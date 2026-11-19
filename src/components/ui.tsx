import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
/* ——— 头像 ——— */
export function Avatar({ hue = 250, icon, name, size = 40, ring = false, className = "" }: {
  hue?: number; icon?: React.ReactNode; name?: string; size?: number; ring?: boolean; className?: string;
}) {
  const inner = (
    <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden font-semibold"
      style={{ background: `hsl(${hue} 22% 30%)`, color: `hsl(${hue} 70% 88%)` }}>
      {icon ?? <span style={{ fontSize: size * 0.42 }} className="leading-none">{(name || "H").replace(/^@/, "")[0].toUpperCase()}</span>}
    </div>
  );
  return (
    <div className={`shrink-0 ${className}`} style={{ width: size, height: size }}>
      {ring ? <div className="w-full h-full rounded-full p-[2px] bg-primary"><div className="w-full h-full rounded-full bg-bg p-[2px]">{inner}</div></div> : inner}
    </div>
  );
}

/* ——— 底部弹层 ——— */
export function Sheet({ open, onClose, children, z = "z-40" }: { open: boolean; onClose: () => void; children: React.ReactNode; z?: string }) {
  const [render, setRender] = useState(open);
  useEffect(() => {
    if (open) setRender(true);
    else { const t = window.setTimeout(() => setRender(false), 230); return () => window.clearTimeout(t); }
  }, [open]);
  if (!render) return null;
  return (
    <div className={`absolute inset-0 ${z}`}>
      <div className={`absolute inset-0 ${open ? "a-fade" : "opacity-0 transition-opacity duration-200"}`}
        style={{ background: "rgba(0,0,0,.55)" }} onClick={onClose} />
      <div className={`absolute bottom-0 inset-x-0 bg-s2 elev-3 overflow-hidden ${open ? "a-sheet" : "a-sheet-out"}`}
        style={{ paddingBottom: "var(--sab, 0px)", borderTopLeftRadius: "var(--r-lg)", borderTopRightRadius: "var(--r-lg)" }}>
        <div className="pt-3 pb-1 flex justify-center"><div className="w-8 h-1 rounded-full bg-dim/70" /></div>
        {children}
      </div>
    </div>
  );
}

/* ——— 居中弹窗 ——— */
export function Modal({ open, onClose, children, width = 480 }: { open: boolean; onClose: () => void; children: React.ReactNode; width?: number }) {
  const [render, setRender] = useState(open);
  useEffect(() => {
    if (open) setRender(true);
    else { const t = window.setTimeout(() => setRender(false), 200); return () => window.clearTimeout(t); }
  }, [open]);
  if (!render) return null;
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className={`fixed inset-0 bg-black/50 backdrop-blur-sm ${open ? "a-fade" : "opacity-0 transition-opacity"}`} onClick={onClose} />
      <div className={`relative bg-s1 text-on rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 overflow-hidden ${open ? "a-scale-in" : "opacity-0 scale-90 transition-all"}`} style={{ width, maxWidth: "100%", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

/* ——— 开关 ——— */
export function Toggle({ on, onChange, label, disabled = false }: { on: boolean; onChange: (b: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={() => onChange(!on)} aria-pressed={on} aria-label={label}
      className={`relative w-[46px] h-[26px] rounded-full transition-colors duration-200 disabled:opacity-50 disabled:cursor-wait ${on ? "bg-primary" : "bg-s4"}`}>
      <span className={`absolute top-[3px] w-5 h-5 rounded-full elev-1 transition-all duration-200 ${on ? "left-[23px] bg-on-primary" : "left-[3px] bg-mut"}`} />
    </button>
  );
}

/* ——— 提示框 Tooltip ——— */
export function Tooltip({
  text,
  children,
  className = "",
}: {
  text?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; placement: "top" | "bottom" }>({
    x: 0,
    y: 0,
    placement: "bottom",
  });

  const updatePos = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const placement = spaceAbove >= 90 && spaceAbove >= spaceBelow ? "top" : "bottom";

    const tooltipWidth = 260;
    const halfWidth = tooltipWidth / 2;
    let x = rect.left + rect.width / 2;
    if (x - halfWidth < 16) {
      x = 16 + halfWidth;
    } else if (x + halfWidth > window.innerWidth - 16) {
      x = window.innerWidth - 16 - halfWidth;
    }

    const y = placement === "top" ? rect.top - 8 : rect.bottom + 8;
    setPos({ x, y, placement });
  };

  const show = () => {
    updatePos();
    setOpen(true);
  };
  const hide = () => {
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handleScroll = () => updatePos();
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [open]);

  if (!text) return <>{children}</>;

  return (
    <>
      <span
        ref={triggerRef}
        className={`hpp-tooltip-wrapper ${className}`}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        tabIndex={0}
        role="tooltip"
        aria-label={typeof text === "string" ? text : undefined}
      >
        {children || (
          <span
            className="hpp-help-btn"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              if (open) hide();
              else show();
            }}
            aria-label="查看提示"
          >
            ?
          </span>
        )}
      </span>
      {open &&
        createPortal(
          <div
            className={`hpp-tooltip-portal ${pos.placement}`}
            style={{
              position: "fixed",
              left: `${pos.x}px`,
              top: pos.placement === "bottom" ? `${pos.y}px` : undefined,
              bottom: pos.placement === "top" ? `${window.innerHeight - pos.y}px` : undefined,
              transform: "translateX(-50%)",
              zIndex: 99999,
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}


