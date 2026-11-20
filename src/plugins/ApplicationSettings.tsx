import ProxySettings from "./ProxySettings";
import { IBack, IChevR, IGrid, IMoon, ISun, IPlayF, IRefresh, IHeart, IInfo, IHome } from "../icons";
import type { ReactNode } from "react";
import { Toggle } from "../components/ui";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { checkAppUpdate, type AppRelease } from "../appUpdates";
import { useStore, type StartPage } from "../store";
import { APP_VERSION } from "../environment";
import { useHost } from "./HostContext";
import { BrowseFrame, Notice } from "./BrowsePages";
import { pluginError } from "./client";
import { usePluginRequests } from "./usePluginRequests";
import type { UpdatePolicy } from "./updateClient";
const START_TABS: { value: StartPage; label: string }[] = [
  { value: "home", label: "首页" },
  { value: "search", label: "搜索" },
  { value: "category", label: "分类" },
  { value: "profile", label: "我的" },
  { value: "settings", label: "设置" },
  { value: "plugins", label: "插件中心" },
];
export default function ApplicationSettings({ onBack }: { onBack: () => void }) {
  const app = useStore(), host = useHost(), [error, setError] = useState("");
  const request = usePluginRequests(), [resolverPrefs, setResolverPrefs] = useState<Record<string, string>>({}), [clearing, setClearing] = useState(false);
  useEffect(() => { let live = true; void request<Record<string, string>>("resolver.preferences.get").then(p => { if (live) setResolverPrefs(p); }).catch(e => { if (live) setError(pluginError(e)); }); return () => { live = false; }; }, [request]);
  const clearResolver = async (site?: string) => {
    setClearing(true); setError("");
    try {
      await request(site ? "resolver.preferences.set" : "resolver.preferences.clear", site ? { host: site, pluginId: null } : {});
      setResolverPrefs(await request<Record<string, string>>("resolver.preferences.get"));
    } catch (error) { setError(pluginError(error)); } finally { setClearing(false); }
  };
  const updatePolicy = async (changes: Partial<UpdatePolicy>) => {
    setClearing(true); setError("");
    try { await request("updates.policy.set", { ...host.updates.policy, ...changes }); await host.refreshUpdates(); }
    catch (e) { setError(pluginError(e)); } finally { setClearing(false); }
  };
  return <div className="absolute inset-0 bg-bg flex flex-col legacy-settings">
    <header className="hpp-header">
      <button aria-label="返回" onClick={onBack}><IBack size={20} /></button>
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <h1 className="truncate">设置</h1>
      </div>
    </header>
    <div className="flex-1 min-h-0 scroll-y px-4 md:px-6 pt-2 pb-10"><div className="max-w-[680px] mx-auto"><Notice error={error||app.error}/>
      <Section title="外观">
        <Setting icon={app.theme==="dark"?<IMoon size={16}/>:<ISun size={16}/>} title="深色外观" description="切换应用的深色与浅色外观"><Toggle label="深色外观" on={app.theme==="dark"} onChange={on=>app.setTheme(on?"dark":"light")}/></Setting>
        <Setting icon={<IHome size={16}/>} title="启动后打开页面" description="每次启动应用默认进入的页面">
          <select aria-label="启动后打开页面" className="hpp-select-modern" style={{width:"auto",maxWidth:150}} value={app.startTab} onChange={e=>app.setStartTab(e.target.value as StartPage)}>
            {START_TABS.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </Setting>
      </Section>
      <Section title="播放">
        <Setting icon={<IPlayF size={16}/>} title="自动播放下一条" description="播完后继续下一集或下一部作品"><Toggle label="自动播放下一条" on={host.prefs.autoNext} onChange={autoNext=>host.setPrefs({autoNext})}/></Setting>
        <Setting icon={<IRefresh size={16}/>} title="播放失败后尝试其他播放流" description="尝试当前来源可用的其他播放流"><Toggle label="播放失败后尝试其他播放流" on={host.prefs.playbackFallback} onChange={playbackFallback=>host.setPrefs({playbackFallback})}/></Setting>
      </Section>
      <Section title="插件与内容">
        <Setting icon={<IRefresh size={16}/>} title="启动时自动检查插件更新" description="同一地址的自动检查至少间隔 24 小时"><Toggle label="启动时自动检查插件更新" on={host.updates.policy.checkOnStartup} disabled={clearing} onChange={checkOnStartup=>void updatePolicy({checkOnStartup})}/></Setting>
        <Setting icon={<IGrid size={16}/>} title="自动安装插件更新" description="在当前播放结束后自动应用更新"><Toggle label="自动安装插件更新" on={host.updates.policy.autoInstall} disabled={clearing} onChange={autoInstall=>void updatePolicy({autoInstall})}/></Setting>
      </Section>
      <Section title="本地数据"><Setting icon={<IHeart size={16}/>} title="我的片库" description={`${host.library.filter(e=>e.favorite).length} 部收藏 · ${host.library.filter(e=>e.lastProgress).length} 条观看记录`}/>
        <details className="px-3.5 py-3 hpp-resolver-preferences" aria-label="解析器站点偏好"><summary className="text-[12.5px] cursor-pointer">解析器站点偏好</summary><div className="mt-3 text-xs text-mut">
          {Object.entries(resolverPrefs).map(([site,id])=><div className="flex gap-2 py-2" key={site}><span className="flex-1 break-all">{site} · {host.plugins.find(p=>p.meta.id===id)?.meta.name||id}</span><button aria-label={`忘记 ${site} 的解析器`} disabled={clearing} onClick={()=>void clearResolver(site)}>忘记</button></div>)}
          {!Object.keys(resolverPrefs).length&&<p>暂无记住的站点。</p>}<button className="mt-3 text-primary" disabled={clearing||!Object.keys(resolverPrefs).length} onClick={()=>void clearResolver()}>清空解析器偏好</button>
        </div></details>
      </Section>
      <Section title="网络"><ProxySettings/></Section>
      <Section title="关于"><Setting icon={<IInfo size={16}/>} title={`HGhub ${APP_VERSION}`} description="由用户自行导入内容源与解析器的插件视频播放器"/><AppUpdateSetting/></Section>
    </div></div>
  </div>;
}

function AppUpdateSetting() {
  const [checking, setChecking] = useState(false), [opening, setOpening] = useState(false);
  const [message, setMessage] = useState("手动检查 GitHub 正式 Release"), [error, setError] = useState("");
  const [release, setRelease] = useState<AppRelease | null>(null);
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => { active.current?.abort(); active.current = null; }, []);
  const check = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setChecking(true); setError(""); setRelease(null); setMessage("正在检查更新…");
    const timeout = window.setTimeout(() => controller.abort(), 15_000);
    try {
      const result = await checkAppUpdate(APP_VERSION, controller.signal);
      if (active.current !== controller) return;
      setRelease(result);
      setMessage(result ? result.available ? `发现新版本 ${result.tag}` : `暂无更新 · 最新发布 ${result.tag}` : "暂无正式发布版本");
    } catch (e) {
      if (active.current !== controller) return;
      setMessage("检查未完成");
      setError(controller.signal.aborted ? "检查超时，请重试" : e instanceof Error ? e.message : "检查更新失败，请重试");
    } finally {
      window.clearTimeout(timeout);
      if (active.current === controller) { active.current = null; setChecking(false); }
    }
  };
  const open = async () => {
    if (!release || opening) return;
    setOpening(true); setError("");
    try { await invoke<void>("open_url", { url: release.url }); }
    catch { setError("无法打开浏览器，请重试"); }
    finally { setOpening(false); }
  };
  return <div>
    <Setting icon={<IRefresh size={16}/>} title="检查更新" description={<span role="status">{message}</span>}>
      <div className="flex flex-col items-end gap-2 text-[12px] text-primary">
        {release?.available && <button className="pressable disabled:opacity-50" disabled={opening || checking} onClick={() => void open()}>{opening ? "正在打开…" : "前往 Release"}</button>}
        <button className="pressable disabled:opacity-50" disabled={checking || opening} onClick={() => void check()}>{checking ? "检查中…" : release ? "重新检查" : "检查更新"}</button>
      </div>
    </Setting>
    {error && <div className="px-3.5 pb-3"><Notice error={error}/></div>}
  </div>;
}

// Reused Settings row/section structure from 5f88442.
function Section({title,children}:{title:string;children:ReactNode}) {
  return <>
    <h2 className="text-[11px] font-semibold text-dim uppercase tracking-wider px-1 mt-5 mb-2">{title}</h2>
    <section className="rounded-(--r-md) bg-s2 border border-black/5 dark:border-white/5 divide-y divide-black/5 dark:divide-white/5 shadow-xs overflow-hidden">{children}</section>
  </>;
}
function Setting({icon,title,description,children}:{icon:ReactNode;title:string;description:ReactNode;children?:ReactNode}) {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-white/[0.02]">
      <span className="shrink-0 w-8 h-8 rounded-full bg-s3 flex items-center justify-center text-primary">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-on leading-snug">{title}</div>
        <div className="text-[11px] text-mut leading-tight mt-0.5">{description}</div>
      </div>
      <div className="shrink-0 flex items-center">{children}</div>
    </div>
  );
}
