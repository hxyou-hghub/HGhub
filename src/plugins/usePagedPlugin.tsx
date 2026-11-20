import { useEffect, useRef, useState } from "react";
import type { Page } from "./protocol";
import { pluginError, type InstalledPlugin } from "./client";
import { usePluginRequests } from "./usePluginRequests";

/** Append by opaque ID; consumed cursors belong to one query, including under StrictMode. */
export function usePagedPlugin<T extends { id: string }>({ plugin, method, args = {}, limit = 40, enabled = true }: {
  plugin: InstalledPlugin; method: string; args?: Record<string, unknown>; limit?: number; enabled?: boolean;
}) {
  const request = usePluginRequests(), epoch = useRef(0), lock = useRef(false), consumed = useRef(new Set<string>());
  const current = useRef<Page<T> | null>(null), failed = useRef<string | undefined>(undefined);
  const [page, setPage] = useState<Page<T> | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(""), [warning, setWarning] = useState("");
  const key = JSON.stringify([plugin.meta.id, plugin.revision, method, args, limit, enabled]);
  const load = async (cursor?: string, refresh = false) => {
    if (!enabled || lock.current || cursor !== undefined && consumed.current.has(cursor)) return;
    lock.current = true; const n = epoch.current;
    failed.current = cursor; setBusy(true); setError(""); setWarning("");
    try {
      const result = ['catalog.list', 'home.getSections', 'home.listSection'].includes(method)
        ? await request.read<Page<T>>(plugin, method, { ...args, cursor, limit }, refresh)
        : await request<Page<T>>("call", { id: plugin.meta.id, method, args: { ...args, cursor, limit } });
      if (n !== epoch.current) return;
      if (cursor === undefined) consumed.current.clear(); else consumed.current.add(cursor);
      const oldItems = cursor === undefined ? [] : current.current?.items || [], ids = new Set(oldItems.map(i => i.id));
      const items = [...oldItems, ...result.items.filter(item => { if (ids.has(item.id)) return false; ids.add(item.id); return true; })];
      const repeated = result.next !== undefined && result.next !== null && consumed.current.has(result.next);
      if (repeated) setWarning("来源返回了重复分页游标，已停止继续加载。");
      current.current = { ...result, items, next: repeated ? null : result.next }; setPage(current.current);
    } catch (e) { if (n === epoch.current && (e as { code?: string }).code !== "CANCELLED") setError(pluginError(e)); }
    finally { if (n === epoch.current) { lock.current = false; setBusy(false); } }
  };
  useEffect(() => {
    epoch.current++; lock.current = false; consumed.current.clear(); current.current = null;
    setPage(null); setError(""); setWarning(""); setBusy(false);
    if (enabled) void load();
    return () => { epoch.current++; lock.current = false; request.cancelAll(); };
  }, [key, request]);
  return { page, busy, error, warning, refresh: () => load(undefined, true), retry: () => load(failed.current, true), more: () => load(current.current?.next || undefined) };
}

/** 分页加载的触发与占位。以同构骨架提前预取，弱化“到底再等”的过程感：
 *  - 触发阈值提前约两屏，用户在滚动途中内容已就位；
 *  - 请求期间渲染与真实卡片同形的骨架网格，取代文字状态跳变；
 *  - 观察器在请求期间保持挂载，追加完成后无需重建即可继续衔接。 */
export function PageLoadMore({ next, busy, error, more, label = "加载更多", auto = true, skeleton }: {
  next?: string | null; busy: boolean; error: string; more: () => void; label?: string; auto?: boolean;
  skeleton?: { columns?: number; rows?: number };
}) {
  const sentinel = useRef<HTMLDivElement>(null), latest = useRef(more); latest.current = more;
  const canMore = !!next && !busy && !error;
  useEffect(() => {
    const node = sentinel.current;
    if (!auto || !node || !canMore) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) latest.current();
    }, { root: node.closest(".hpp-scroll"), rootMargin: "0px 0px 800px 0px" });
    observer.observe(node); return () => observer.disconnect();
  }, [canMore, auto]);
  const pending = busy && !!next;
  const count = (skeleton?.columns ?? 6) * (skeleton?.rows ?? 2);
  return <>
    <div ref={sentinel} className="hpp-page-sentinel" aria-hidden="true"/>
    {pending && <div className="hpp-page-skeleton" aria-hidden="true">{Array.from({ length: count }, (_, i) => <div className="hpp-page-skeleton-card" key={i}><div className="hpp-page-skeleton-poster"/><div className="hpp-page-skeleton-line top"/><div className="hpp-page-skeleton-line"/><div className="hpp-page-skeleton-line meta"/></div>)}</div>}
    {error
      ? <button className="hpp-more" onClick={more}>加载失败，点击重试</button>
      : !pending && <button className="hpp-more" disabled={!next} onClick={more}>{next ? label : "没有更多内容"}</button>}
  </>;
}
