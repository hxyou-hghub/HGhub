import { useEffect, useRef, useState } from "react";
import { IChevronDown, IChevronUp, IRefresh, Logo } from "../icons";
import { useHost } from "./HostContext";
import { pluginError, type InstalledPlugin } from "./client";
import type { Category, MediaItem, Page, Section } from "./protocol";
import { usePluginRequests } from "./usePluginRequests";
import PluginMediaDetail from "./PluginMediaDetail";
import { Notice, type OpenMedia } from "./BrowsePages";
import { useStore } from "../store";
import { useAssetUrls } from './MediaCards';
import { readMetadata } from './metadataCache';

type QueueItem = { plugin: InstalledPlugin; item: MediaItem };
type SourcePage = { method: string; args: Record<string, unknown>; cursor?: string; done: boolean; seen: Set<string> };
const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
};

export const playbackSources = (sources: InstalledPlugin[]) => sources.filter(p => p.methods.includes("media.resolvePlayback") && ["feed.list", "home.getSections", "catalog.list"].some(m => p.methods.includes(m)));

export default function ImmersiveHome({ open, manage, settings, active = true }: { open: OpenMedia; manage: () => void; settings: () => void; active?: boolean }) {
  const host = useHost(), request = usePluginRequests(), app = useStore();
  const available = playbackSources(host.sources);
  const picked = host.prefs.homeIds.flatMap(id => available.find(p => p.meta.id === id) || []).slice(0, host.prefs.homeMode === "single" ? 1 : undefined);
  // 未显式选择片源（如首次安装）时回退到全部可用片源，避免首页落到全黑空态。
  const chosen = host.prefs.homeMode === "all" || !picked.length ? available : picked;
  const signature = chosen.map(p => p.meta.id + p.revision).join("|");
  const [queue, setQueue] = useState<QueueItem[]>([]), [index, setIndex] = useState(0), [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}), [round, setRound] = useState(0);
  const pages = useRef(new Map<string, SourcePage>()), generation = useRef(0), loading = useRef(false), ids = useRef(new Set<string>());
  const [more, setMore] = useState(false);
  const load = async (advance = false) => {
    if (loading.current) return;
    loading.current = true; setBusy(true);
    const epoch = generation.current;
    let appended = false;
    await Promise.all(shuffle(chosen).map(async plugin => {
      const id = plugin.meta.id;
      let state = pages.current.get(id);
      if (state?.done) return [];
      try {
        if (!state) {
          const method = plugin.methods.includes("feed.list") ? "feed.list" : plugin.methods.includes("home.getSections") ? "home.getSections" : "catalog.list";
          const args: Record<string, unknown> = {};
          if (method === "catalog.list") {
            const categories = await request<Category[]>("call", { id, method: "catalog.getCategories", args: {} });
            const category = shuffle(categories)[0];
            args.categoryId = category?.children?.[0]?.id || category?.id;
            if (!args.categoryId) { if (epoch === generation.current) pages.current.set(id, { method, args, done: true, seen: new Set() }); return []; }
          }
          state = { method, args, done: false, seen: new Set() };
        }
        if (epoch !== generation.current) return [];
        const result = await request<Page<MediaItem> | Page<Section>>("call", { id, method: state.method, args: { ...state.args, cursor: state.cursor, limit: 20 } });
        if (epoch !== generation.current) return [];
        if (state.cursor) state.seen.add(state.cursor);
        state.done = !result.next || state.seen.has(result.next);
        state.cursor = result.next || undefined;
        pages.current.set(id, state);
        setErrors(old => { const next = { ...old }; delete next[id]; return next; });
        const items = state.method === "home.getSections" ? (result as Page<Section>).items.flatMap(s => s.items) : (result as Page<MediaItem>).items;
        const added = shuffle(items).filter(item => {
          const key = JSON.stringify([id, item.id]);
          if (ids.current.has(key)) return false;
          ids.current.add(key); return true;
        }).map(item => ({ plugin, item }));
        if (added.length) {
          setQueue(old => [...old, ...added]);
          if (advance && !appended) setIndex(queue.length);
          appended = true;
        }
      } catch (e) {
        if (epoch === generation.current) setErrors(old => ({ ...old, [id]: `${plugin.meta.name}：${pluginError(e)}` }));
        return [];
      }
    }));
    if (epoch !== generation.current) return;
    setMore(chosen.some(p => !pages.current.get(p.meta.id)?.done));
    loading.current = false; setBusy(false);
  };
  useEffect(() => {
    generation.current++; request.cancelAll(); pages.current.clear(); ids.current.clear(); loading.current = false;
    setQueue([]); setIndex(0); setErrors({}); setMore(false); void load();
    return () => { generation.current++; request.cancelAll(); };
  }, [signature, round]);
  const next = () => { if (!active) return; if (index + 1 < queue.length) setIndex(index + 1); else if (more && !busy) void load(true); };
  const previous = () => { if (active) setIndex(Math.max(0, index - 1)); };
  const current = queue[index];
  const before = queue[index - 1], after = queue[index + 1];
  const beforePoster = useAssetUrls(before?.plugin.meta.id || '', before?.item.cover ? [before.item.cover] : [])[0];
  const afterPoster = useAssetUrls(after?.plugin.meta.id || '', after?.item.cover ? [after.item.cover] : [])[0];
  useEffect(() => {
    if (active && more && queue.length - index < 4 && !loading.current) void load();
  }, [active, index, queue.length, more]);
  useEffect(() => {
    if (!active || !after || after.item.entryEpisodeId) return;
    const timer = window.setTimeout(() => { void readMetadata(after.plugin, 'media.getDetail', { id: after.item.id }, false, false).catch(() => {}); }, 600);
    return () => clearTimeout(timer);
  }, [active, after?.plugin.meta.id, after?.plugin.revision, after?.item.id]);
  return <div className="legacy-home">
    {current ? <PluginMediaDetail key={JSON.stringify([current.plugin.meta.id,current.plugin.revision,current.item.id])} active={active} plugin={current.plugin} mediaId={current.item.id} entryEpisodeId={current.item.entryEpisodeId} entryItem={current.item} manage={manage} onSwitch={(pluginId,mediaId,start)=>app.push({kind:"media",pluginId,mediaId,start})} presentation={{mode:"preview",title:current.item.title,queueIndex:index,total:queue.length,onNext:index+1<queue.length||more?next:undefined,onPrevious:index?previous:undefined,nextPreview:after?{title:after.item.title,poster:afterPoster}:undefined,previousPreview:before?{title:before.item.title,poster:beforePoster}:undefined}}/>
      : <div className="absolute inset-0 bg-black flex flex-col items-center justify-center gap-4 text-white/60 text-xs"><Logo size={42}/><p>{busy?"正在加载…":available.length?"暂无可播放内容":"添加片源后开始观看"}</p>{!busy&&<button className="rounded-full px-5 py-2 bg-white/10" onClick={available.length?settings:manage}>{available.length?"选择片源":"添加片源"}</button>}</div>}
    {!!Object.keys(errors).length&&<details className="hpp-home-errors"><summary>{Object.keys(errors).length} 个片源暂不可用</summary>{Object.values(errors).map(e=><Notice key={e} error={e}/>)}<button onClick={()=>void load()}>重试片源</button></details>}
  </div>;
}
