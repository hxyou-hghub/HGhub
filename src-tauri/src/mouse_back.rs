//! 鼠标侧键（后退键，XButton1）触发应用返回。
//!
//! WebView2 会自行消化鼠标消息，窗口子类化拿不到 WM_XBUTTONUP。
//! 改用系统级低级鼠标钩子 WH_MOUSE_LL：任意窗口上按下后退键都会通知本进程，
//! 命中时向前端派发 `app://mouse-back` 事件，由前端复用既有返回栈。
use std::cell::RefCell;
use tauri::Emitter;
use windows::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    UI::WindowsAndMessaging::{
        CallNextHookEx, SetWindowsHookExW, HHOOK, MSLLHOOKSTRUCT, WH_MOUSE_LL, WM_XBUTTONUP,
        XBUTTON1,
    },
};

const MOUSE_BACK_EVENT: &str = "app://mouse-back";

thread_local! {
    static APP_HANDLE: RefCell<Option<tauri::AppHandle>> = const { RefCell::new(None) };
    static HOOK: RefCell<Option<HHOOK>> = const { RefCell::new(None) };
}

unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && wparam.0 as u32 == WM_XBUTTONUP {
        let info = &*(lparam.0 as *const MSLLHOOKSTRUCT);
        if (info.mouseData >> 16) as u16 == XBUTTON1 {
            APP_HANDLE.with(|slot| {
                if let Some(app) = slot.borrow().as_ref() {
                    let _ = app.emit(MOUSE_BACK_EVENT, ());
                }
            });
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// 安装全局鼠标钩子；必须运行在带有消息循环的 UI 线程上，重复调用无副作用。
pub fn install(app: &tauri::AppHandle) {
    APP_HANDLE.with(|slot| *slot.borrow_mut() = Some(app.clone()));
    if HOOK.with(|slot| slot.borrow().is_some()) {
        return;
    }
    if let Ok(hook) = unsafe { SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), None, 0) } {
        HOOK.with(|slot| *slot.borrow_mut() = Some(hook));
    }
}
