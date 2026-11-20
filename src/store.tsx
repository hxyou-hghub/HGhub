import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { platform } from "./environment";
import type { SourceStart } from "./plugins/sourceMatching";
export type Tab = "home" | "category" | "search" | "profile";
export type Theme = "dark" | "light";
const TABS: Tab[] = ["home", "search", "category", "profile"];
export type StartPage = Tab | "settings" | "plugins";
const START_PAGES: StartPage[] = [...TABS, "settings", "plugins"];
export type PageInput = { kind: "plugins"; focusId?: string } | { kind: "settings" } | { kind: "media"; pluginId: string; mediaId: string; start?: SourceStart; autoPlay?: boolean } | { kind: "section"; pluginId: string; sectionId: string; title?: string } | { kind: "live"; pluginId: string } | { kind: "articles"; pluginId: string } | { kind: "article"; pluginId: string; articleId: string } | { kind: "feed"; pluginId: string } | { kind: "recommendations"; pluginId: string };
export type Page = PageInput & { key: string };
function read<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; } }
function startupPage(start: StartPage): Page | null {
  if (start === "settings") return { kind: "settings", key: "startup" };
  if (start === "plugins") return { kind: "plugins", key: "startup" };
  return null;
}
function useApplication() {
  const [theme, setTheme] = useState<Theme>(() => read<string>("hpp.theme", "dark") === "light" ? "light" : "dark");
  const [startTab, setStartTab] = useState<StartPage>(() => { const v = read<string>("hpp.startTab", "home"); return START_PAGES.includes(v as StartPage) ? v as StartPage : "home"; });
  const [tab, setTabRaw] = useState<Tab>(() => TABS.includes(startTab as Tab) ? startTab as Tab : "home"), [stack, setStack] = useState<Page[]>(() => { const p = startupPage(startTab); return p ? [p] : []; });
  const [muteOnStartup, setMuteOnStartup] = useState(() => read<boolean>("hpp.startMuted", true) !== false);
  const [volume, setVolume] = useState(() => { const v = read("hpp.volume", 0.7); return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.7; });
  const [watching, setWatching] = useState(false);
  const [muted, setMuted] = useState(muteOnStartup);
  const [theater, setTheater] = useState(false), [fs, setFs] = useState(false), [clean, setClean] = useState(false);
  const [strictSecurity, setStrict] = useState(true), [strictSecurityReady, setSecurityReady] = useState(false), [securityPending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sourceErrors, setSourceErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    document.documentElement.classList.toggle("theme-light", theme === "light"); document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem("hpp.theme", JSON.stringify(theme)); localStorage.setItem("hpp.startMuted", JSON.stringify(muteOnStartup)); localStorage.setItem("hpp.volume", JSON.stringify(volume)); localStorage.setItem("hpp.startTab", JSON.stringify(startTab)); } catch { setError("无法保存应用偏好"); }
  }, [theme, muteOnStartup, volume, startTab]);
  useEffect(() => { void invoke<{strict_security:boolean}>("app_boot").then(v => { setStrict(v.strict_security); setSecurityReady(true); }).catch(() => setError("无法读取网络设置")); }, []);
  const setStrictSecurity = useCallback(async (strict: boolean) => { setPending(true); try { setStrict(await invoke<boolean>("security_set", { strict })); } finally { setPending(false); } }, []);
  const setTab = useCallback((tab: Tab) => { setTabRaw(tab); setStack([]); }, []);
  /* 全局静音开关：默认静音，切换后立即作用于当前播放，并持久化供下次启动沿用 */
  const toggleMute = useCallback(() => {
    setMuteOnStartup(next => { const on = !next; setMuted(on); return on; });
  }, []);
  /* 全局音量：调整即取消静音并立即生效；音量为 0 时视为静音偏好，持久化供下次启动沿用 */
  const applyVolume = useCallback((v: number) => {
    const next = Math.min(1, Math.max(0, v));
    setVolume(next); setMuted(false); setMuteOnStartup(next === 0);
  }, []);
  const push = useCallback((p: PageInput) => setStack(old => [...old, { ...p, key: crypto.randomUUID() }]), []);
  const replace = useCallback((p: PageInput) => setStack(old => [...old.slice(0, -1), { ...p, key: crypto.randomUUID() }]), []);
  const pop = useCallback(() => setStack(old => old.slice(0, -1)), []);
  return { watching, setWatching, platform, theme, setTheme, startTab, setStartTab, tab, setTab, stack, push, replace, pop, muteOnStartup, setMuteOnStartup, toggleMute, applyVolume, volume, setVolume, muted, setMuted, theater, setTheater, fs, setFs, clean, setClean, strictSecurity, strictSecurityReady, securityPending, setStrictSecurity, error, sourceErrors, setSourceErrors };
}
const Context = createContext<ReturnType<typeof useApplication>>(null!);
export const useStore = () => useContext(Context);
export function AppProvider({children}: {children: React.ReactNode}) { const value = useApplication(); return <Context.Provider value={value}>{children}</Context.Provider>; }
