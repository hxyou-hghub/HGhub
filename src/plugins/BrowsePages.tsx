import { useEffect, useRef, useState } from "react";
import { useHost } from "./HostContext";
import { pluginError, type InstalledPlugin } from "./client";
import { usePluginRequests } from "./usePluginRequests";
import type { Category, Filter, FilterOption, MediaItem, Page, Section } from "./protocol";
import MediaCards, { WaterfallCards } from "./MediaCards";
import type { OpenSection } from "./SectionPage";
import { mergeSearch, type SearchHit } from "./searchModel";
import { PageLoadMore, usePagedPlugin } from "./usePagedPlugin";
import SearchPosters from "./SearchPosters";
import { IGrid, IChevR, IBack, ISearch, IClose, ISettings, IFireF, IRefresh } from "../icons";

// Cache fulfilled metadata only. A view owns its in-flight request and may cancel it.
const categoryTrees = new Map<string, { revision: string; tree: Category[] }>();

export type OpenMedia = (pluginId:string,mediaId:string)=>void;
export function BrowseFrame({title,children,tools,onBack}:{title:string;children:React.ReactNode;tools?:React.ReactNode;onBack?:()=>void}) {
  return (
    <div className="hpp-page">
      <header className="hpp-header">
        {onBack && <button aria-label="返回" onClick={onBack}><IBack size={20} /></button>}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1 className="truncate">{title}</h1>
        </div>
        {tools && <div className="hpp-header-tools shrink-0">{tools}</div>}
      </header>
      <div className="hpp-scroll"><div className="hpp-content">{children}</div></div>
    </div>
  );
}
export function Notice({error,retry,retryLabel="重试",className=""}:{error?:string;retry?:()=>void;retryLabel?:string;className?:string}){
  if(!error)return null;
  return (
    <div role="alert" className={`hpp-error a-rise ${className}`.trim()}>
      <div className="flex items-center gap-2.5 flex-1 min-w-0">
        <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-red-500/15" style={{color:"var(--p-danger)"}}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M8 4.75v3.5M8 10.75v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </span>
        <span className="break-words flex-1 min-w-0 font-medium text-[12.5px] leading-relaxed">{error}</span>
      </div>
      {retry&&<button type="button" onClick={retry} className="hpp-error-retry shrink-0 pressable"><IRefresh size={12} className="shrink-0"/><span>{retryLabel}</span></button>}
    </div>
  );
}
export function EmptySources({manage}:{manage:()=>void}) {return <div className="hpp-empty"><h2>从一个插件开始</h2><p>导入你选择的数据源，发现影视、短剧与更多内容。</p><button className="primary" onClick={manage}>管理插件</button></div>;}
function Scope({kind,plugins}:{kind:"home"|"search";plugins:InstalledPlugin[]}) {
  const {prefs,setPrefs}=useHost(),mode=kind==="home"?prefs.homeMode:prefs.searchMode,ids=kind==="home"?prefs.homeIds:prefs.searchIds;
  const update=(mode:string,ids:string[])=>setPrefs(kind==="home"?{homeMode:mode as typeof prefs.homeMode,homeIds:ids}:{searchMode:mode as typeof prefs.searchMode,searchIds:ids});
  return <div className="hpp-scope"><label>{kind==="home"?"首页来源":"搜索范围"}<select aria-label={kind==="home"?"首页来源":"搜索范围"} value={mode} onChange={e=>update(e.target.value,ids.length?ids:plugins.slice(0,1).map(p=>p.meta.id))}><option value="all">综合</option><option value="single">单个插件</option><option value="multiple">多个插件</option></select></label>{mode!=="all"&&plugins.map(p=><label key={p.meta.id}><input type={mode==="single"?"radio":"checkbox"} name={`${kind}-scope`} checked={ids.includes(p.meta.id)} onChange={e=>update(mode,mode==="single"?[p.meta.id]:e.target.checked?[...ids,p.meta.id]:ids.filter(id=>id!==p.meta.id))}/>{p.meta.name}</label>)}</div>;
}
export function PluginRecommendations({plugin,open,openSection,onBack}:{plugin:InstalledPlugin;open:OpenMedia;openSection:OpenSection;onBack:()=>void}) {
  const [refresh,setRefresh]=useState(0);
  return <BrowseFrame title={plugin.meta.name + " · 推荐分区"} onBack={onBack} tools={<button onClick={()=>setRefresh(n=>n+1)}>刷新推荐</button>}><HomeSource plugin={plugin} open={open} openSection={openSection} refreshToken={refresh}/></BrowseFrame>;
}
function HomeSource({plugin:p,open,openSection,refreshToken}:{plugin:InstalledPlugin;open:OpenMedia;openSection:OpenSection;refreshToken:number}) {
  const list=usePagedPlugin<Section>({plugin:p,method:"home.getSections",limit:20}),lastRefresh=useRef(refreshToken);
  useEffect(()=>{if(lastRefresh.current!==refreshToken){lastRefresh.current=refreshToken;list.refresh();}},[refreshToken]);
  return <section className="hpp-home-source" aria-label={p.meta.name+"的推荐"}><Notice error={list.error||list.warning} retry={list.error?list.retry:undefined} retryLabel={`重试 ${p.meta.name}`}/>{list.busy&&!list.page&&<div className="hpp-skeleton" aria-label="正在加载推荐"/>}
    {list.page?.items.filter(s=>s.items.length>0).map(s=><HomeSection key={s.id} plugin={p} section={s} open={open} openSection={openSection}/>)}
    {list.page?.next&&<PageLoadMore next={list.page.next} busy={list.busy} error={list.error} more={list.more} label={"更多推荐分区 · "+p.meta.name}/>}
  </section>;
}
function HomeSection({plugin:p,section:s,open,openSection}:{plugin:InstalledPlugin;section:Section;open:OpenMedia;openSection:OpenSection}) {
  return <section className={`hpp-section hpp-layout-${s.layout}`}><div className="hpp-section-title"><h2>{s.title||"推荐"}<small>{p.meta.name}</small></h2>{s.more&&p.methods.includes("home.listSection")&&<button onClick={()=>openSection(p.meta.id,s.id,s.title)}>查看更多</button>}</div><MediaCards pluginId={p.meta.id} items={s.items} landscape={s.layout==="banner"||s.imageAspect==="landscape"} open={i=>open(p.meta.id,i.id)}/></section>;
}
export function FilterControls({filters,values,change}:{filters:Filter[];values:Record<string,string[]>;change:(v:Record<string,string[]>)=>void}) {
  return <div className="hpp-filters browse-filters">{filters.map(f=><fieldset key={f.id}><legend>{f.label}</legend>{f.options.map(o=><label key={o.id}><input type={f.multiple?"checkbox":"radio"} name={`filter-${f.id}`} checked={(values[f.id]||[]).includes(o.id)} onChange={e=>change({...values,[f.id]:f.multiple?e.target.checked?[...(values[f.id]||[]),o.id]:(values[f.id]||[]).filter(id=>id!==o.id):[o.id]})}/>{o.label}</label>)}<button type="button" aria-pressed={!values[f.id]?.length} onClick={()=>change({...values,[f.id]:[]})}>不限</button></fieldset>)}</div>;
}
export function PluginCategory({open,manage,openContent}:{open:OpenMedia;manage:()=>void;openContent?:(kind:"live"|"articles"|"feed"|"recommendations",pluginId:string)=>void}) {
  const {sources}=useHost(),available=sources.filter(p=>["catalog.getCategories","home.getSections","live.resolve","articles.list","feed.list"].some(m=>p.methods.includes(m))),[selected,setSelected]=useState("");
  const current=available.find(p=>p.meta.id===selected)||available[0];
  const entries=current&&openContent?<nav className="hpp-content-entries" aria-label="其他内容">{([['recommendations','home.getSections','推荐更多'],['live','live.resolve','直播'],['articles','articles.list','图文'],['feed','feed.list','信息流']] as const).filter(([,method])=>current.methods.includes(method)).map(([kind,,label])=><button key={kind} onClick={()=>openContent(kind,current.meta.id)}>{label}<IChevR size={13}/></button>)}</nav>:null;
  return <div className="hpp-page hpp-category-page"><header className="shrink-0 px-4 pb-2" style={{paddingTop:"calc(var(--sat,0px) + 14px)"}}><h1 className="text-[24px] font-bold text-on leading-none">分类</h1></header><nav className="hpp-provider-tabs" aria-label="分类片源">{available.map(p=><button aria-pressed={current===p} className={current===p?"selected":""} key={p.meta.id} onClick={()=>setSelected(p.meta.id)}>{p.meta.name}</button>)}</nav><div className="hpp-scroll"><div className="hpp-content">
    {current?.methods.includes("catalog.getCategories")?<CategoryBrowser key={current.meta.id+current.revision} plugin={current} open={open} entries={entries}/>:<>{entries}{!current?<EmptySources manage={manage}/>:<p className="hpp-muted">选择上方内容入口开始浏览。</p>}</>}
  </div></div></div>;
}
// 分区是分类树顶层节点，其 children 是二级分类；单层树把分区自身规范成唯一的「全部」分类。
function categoriesOf(section?: Category): Category[] {
  if (!section) return [];
  if (section.children?.length) return section.children;
  return [{ id: section.id, label: "全部", filters: section.filters, sorts: section.sorts }];
}
function CategoryBrowser({plugin,open,entries}:{plugin:InstalledPlugin;open:OpenMedia;entries:React.ReactNode}) {
  const request=usePluginRequests(),[tree,setTree]=useState<Category[]>([]),[sectionId,setSectionId]=useState(""),[categoryId,setCategoryId]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(true),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let live=true;setBusy(true);setError("");const cached=categoryTrees.get(plugin.meta.id);const load=cached?.revision===plugin.revision?Promise.resolve(cached.tree):request<Category[]>("call",{id:plugin.meta.id,method:"catalog.getCategories",args:{}});void load.then(result=>{if(!live)return;categoryTrees.set(plugin.meta.id,{revision:plugin.revision,tree:result});setTree(result);setSectionId(result[0]?.id||"");setCategoryId(categoriesOf(result[0])[0]?.id||"");}).catch(e=>{if(live)setError(pluginError(e));}).finally(()=>{if(live)setBusy(false);});return()=>{live=false;request.cancelAll();};},[plugin.meta.id,plugin.revision,attempt,request]);
  const section=tree.find(c=>c.id===sectionId),categories=categoriesOf(section),active=categories.find(c=>c.id===categoryId)||categories[0];
  const selectSection=(id:string)=>{setSectionId(id);setCategoryId(categoriesOf(tree.find(c=>c.id===id))[0]?.id||"");};
  if(busy)return <><Notice error={error}/><div className="hpp-skeleton" aria-label="正在加载分类"/></>;
  if(error)return <Notice error={error} retry={()=>setAttempt(v=>v+1)} retryLabel="重试分类"/>;
  if(!tree.length)return <div className="hpp-empty"><IGrid size={36}/><h2>这里还没有分类</h2><p>片源暂未提供分类内容。</p></div>;
  return <>
    <CategoryNav tree={tree} section={section} categories={categories} active={active} entries={entries} onSection={selectSection} onCategory={setCategoryId}/>
    {active&&<CategoryResults key={section?.id+":"+active.id} plugin={plugin} category={active} open={open}/>}
  </>;
}
function CategoryNav({tree,section,categories,active,entries,onSection,onCategory}:{tree:Category[];section?:Category;categories:Category[];active?:Category;entries:React.ReactNode;onSection:(id:string)=>void;onCategory:(id:string)=>void}) {
  return <>
    <div className="hpp-section-row">
      <nav className="hpp-section-tabs" aria-label="分区">{tree.map(s=><button key={s.id} aria-pressed={s.id===section?.id} onClick={()=>onSection(s.id)}>{s.label}</button>)}</nav>
      {entries}
    </div>
    <nav className="hpp-category-tabs" aria-label="分类">{categories.map(c=><button key={c.id} aria-pressed={c.id===active?.id} onClick={()=>onCategory(c.id)}>{c.label}</button>)}</nav>
  </>;
}
function CategoryResults({plugin:p,category,open}:{plugin:InstalledPlugin;category:Category;open:OpenMedia}) {
  const metadata=usePluginRequests(),[filters,setFilters]=useState<Filter[]>(category.filters||[]),[sorts,setSorts]=useState<FilterOption[]>(category.sorts||[]),[values,setValues]=useState<Record<string,string[]>>({}),[sort,setSort]=useState(""),[error,setError]=useState("");
  useEffect(()=>{if(!p.methods.includes("catalog.getFilters"))return;let live=true;void metadata<{filters?:Filter[];sorts?:FilterOption[]}>("call",{id:p.meta.id,method:"catalog.getFilters",args:{categoryId:category.id}}).then(r=>{if(live){setFilters(r.filters||[]);setSorts(r.sorts||[]);}}).catch(e=>{if(live)setError(pluginError(e));});return()=>{live=false;};},[category.id,p.meta.id,p.methods,metadata]);
  const list=usePagedPlugin<MediaItem>({plugin:p,method:"catalog.list",args:{categoryId:category.id,filters:values,sort:sort||undefined}});
  return <>
    <FilterControls filters={filters} values={values} change={setValues}/>
    {!!sorts.length&&<label className="hpp-sort">排序 <select aria-label="分类排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="">默认</option>{sorts.map(s=><option value={s.id} key={s.id}>{s.label}</option>)}</select></label>}
    <Notice error={error||list.error||list.warning} retry={list.error?list.retry:undefined} retryLabel="重试分类"/>
    {list.busy&&!list.page?<div className="hpp-skeleton"/>:list.page?.items?.length?<WaterfallCards pluginId={p.meta.id} items={list.page.items} open={i=>open(p.meta.id,i.id)}/>:null}
    {!list.busy&&!list.error&&!list.page?.items.length&&<div className="py-16 text-center text-mut a-rise"><IGrid size={32} className="mx-auto mb-3 opacity-30 text-dim"/><p className="text-sm font-medium">暂无分类内容</p><p className="text-xs text-dim mt-1.5">可尝试选择其他分类或筛选条件</p></div>}
    {!!list.page?.items?.length&&<PageLoadMore next={list.page?.next} busy={list.busy} error={list.error} more={list.more}/>}
  </>;
}
export function PluginSearch({open,manage}:{open:OpenMedia;manage:()=>void}) {
  const {sources,prefs}=useHost(),request=usePluginRequests(),metadata=usePluginRequests(),suggestRequest=usePluginRequests(),[query,setQuery]=useState(""),[submitted,setSubmitted]=useState(""),[pages,setPages]=useState<Record<string,Page<MediaItem>>>({}),[errors,setErrors]=useState<Record<string,string>>({}),[busy,setBusy]=useState<Record<string,boolean>>({}),[tab,setTab]=useState("all"),[choice,setChoice]=useState<SearchHit[]|null>(null),[suggest,setSuggest]=useState<string[]>([]),[trending,setTrending]=useState<Record<string,string[]>>({}),[filters,setFilters]=useState<Filter[]>([]),[values,setValues]=useState<Record<string,string[]>>({}),epoch=useRef(0);
  const locks=useRef(new Map<string,number>()), consumed=useRef(new Map<string,Set<string>>()), failedCursors=useRef(new Map<string,string|undefined>()), searchFilters=useRef<Record<string,string[]>>({});
  const [warnings,setWarnings]=useState<Record<string,string>>({});
  const [showScope,setShowScope]=useState(false),inputRef=useRef<HTMLInputElement>(null);
  const [history,setHistory]=useState<string[]>(()=>{try{const saved=JSON.parse(localStorage.getItem("hpp.searchHistory")||"[]");return Array.isArray(saved)?[...new Set<string>(saved.filter((v:unknown):v is string=>typeof v==="string"&&!!v.trim()))].slice(0,20):[];}catch{return [];}});
  useEffect(()=>{try{localStorage.setItem("hpp.searchHistory",JSON.stringify(history));}catch{/* Search remains usable if storage is unavailable. */}},[history]);
  useEffect(()=>{if(!/Android|iPhone|iPad/i.test(navigator.userAgent))inputRef.current?.focus();},[]);

  const available=sources.filter(p=>p.methods.includes("search.search")),chosen=prefs.searchMode==="all"?available:prefs.searchIds.flatMap(id=>available.find(p=>p.meta.id===id)||[]).slice(0,prefs.searchMode==="single"?1:undefined),ids=chosen.map(p=>p.meta.id+p.revision).join("|");
  useEffect(()=>{let live=true;setTrending({});for(const p of chosen)if(p.methods.includes("search.trending"))void metadata<string[]>("call",{id:p.meta.id,method:"search.trending",args:{}}).then(r=>{if(live)setTrending(old=>({...old,[p.meta.id]:r}));}).catch(()=>{});return()=>{live=false;};},[ids]);
  useEffect(()=>{let live=true;setFilters([]);setValues({});const p=prefs.searchMode==="single"?chosen[0]:undefined;if(p?.methods.includes("search.getFilters"))void metadata<Filter[]>("call",{id:p.meta.id,method:"search.getFilters",args:{}}).then(r=>{if(live)setFilters(r);}).catch(()=>{});return()=>{live=false;};},[ids,prefs.searchMode]);
  useEffect(()=>{let live=true;setSuggest([]);const p=prefs.searchMode==="single"?chosen[0]:undefined;const timer=window.setTimeout(()=>{if(query.trim()&&p?.methods.includes("search.suggest"))void suggestRequest<string[]>("call",{id:p.meta.id,method:"search.suggest",args:{query}}).then(r=>{if(live)setSuggest(r);}).catch(()=>{});},300);return()=>{live=false;clearTimeout(timer);suggestRequest.cancelAll();};},[query,ids,prefs.searchMode]);
  useEffect(()=>{request.cancelAll();epoch.current++;setPages({});setErrors({});setBusy({});setSubmitted("");setTab(prefs.searchMode==="all"?"all":chosen[0]?.meta.id||"");return()=>{epoch.current++;request.cancelAll();};},[ids,prefs.searchMode]);
  const load=async(p:InstalledPlugin,q:string,n:number,cursor?:string)=>{
    if(n!==epoch.current||locks.current.get(p.meta.id)===n||cursor!==undefined&&consumed.current.get(p.meta.id)?.has(cursor))return;
    locks.current.set(p.meta.id,n);failedCursors.current.set(p.meta.id,cursor);
    setBusy(old=>({...old,[p.meta.id]:true}));setErrors(old=>({...old,[p.meta.id]:""}));
    try{
      const r=await request<Page<MediaItem>>("call",{id:p.meta.id,method:"search.search",args:{query:q,filters:searchFilters.current,cursor,limit:40}});
      if(n!==epoch.current)return;
      const seen=cursor===undefined?new Set<string>():consumed.current.get(p.meta.id)||new Set<string>();
      if(cursor!==undefined)seen.add(cursor);consumed.current.set(p.meta.id,seen);
      const repeated=!!r.next&&seen.has(r.next);
      setWarnings(old=>({...old,[p.meta.id]:repeated?"来源返回了重复分页游标，已停止继续加载。":""}));
      setPages(old=>{
        const previous=cursor===undefined?[]:old[p.meta.id]?.items||[],ids=new Set(previous.map(i=>i.id));
        return {...old,[p.meta.id]:{...r,next:repeated?null:r.next,items:[...previous,...r.items.filter(i=>{if(ids.has(i.id))return false;ids.add(i.id);return true;})]}};
      });
    }catch(e){if(n===epoch.current&&(e as {code?:string}).code!=="CANCELLED")setErrors(old=>({...old,[p.meta.id]:pluginError(e)}));}
    finally{if(locks.current.get(p.meta.id)===n)locks.current.delete(p.meta.id);if(n===epoch.current)setBusy(old=>({...old,[p.meta.id]:false}));}
  };
  const search=(q=query)=>{q=q.trim();if(!q||!chosen.length)return;setQuery(q);setHistory(old=>[q,...old.filter(h=>h!==q)].slice(0,20));request.cancelAll();const n=++epoch.current;locks.current.clear();consumed.current.clear();failedCursors.current.clear();searchFilters.current=values;setSubmitted(q);setPages({});setErrors({});setWarnings({});setBusy({});setChoice(null);setSuggest([]);for(const p of chosen)void load(p,q,n);};
  useEffect(()=>{if(submitted)search(submitted);},[JSON.stringify(values)]);
  const hits=chosen.flatMap(p=>(pages[p.meta.id]?.items||[]).map(item=>({pluginId:p.meta.id,item}))),groups=mergeSearch(hits);
  const visibleGroups=tab==="all"?groups:hits.filter(h=>h.pluginId===tab).map(h=>[h]);
  const activeSources=tab==="all"?chosen:chosen.filter(p=>p.meta.id===tab);
  const loading=activeSources.some(p=>busy[p.meta.id]);
  const clear=()=>{request.cancelAll();suggestRequest.cancelAll();epoch.current++;setQuery("");setSubmitted("");setPages({});setErrors({});setWarnings({});setBusy({});setChoice(null);setSuggest([]);inputRef.current?.focus();};
  const openGroup=(group:SearchHit[])=>group.length>1?setChoice(group):open(group[0].pluginId,group[0].item.id);
  return <div className="legacy-search-page absolute inset-0 bg-bg flex flex-col">
    <div className="shrink-0 px-4 pb-3 flex items-center gap-2.5" style={{paddingTop:"calc(var(--sat, 0px) + 12px)"}}>
      <form className="hpp-search legacy-search-form flex-1 flex items-center gap-2 h-11 rounded-(--r-ctl) bg-s3 px-3.5 focus-within:bg-s4 transition-colors" onSubmit={e=>{e.preventDefault();search();inputRef.current?.blur();}}>
        <button type="submit" aria-label="搜索" disabled={!query.trim()||!chosen.length} className="text-mut shrink-0 pressable"><ISearch size={17}/></button>
        <input ref={inputRef} aria-label="搜索所有插件" placeholder="搜索作品、作者、题材…" value={query} onChange={e=>setQuery(e.target.value)} className="flex-1 min-w-0 bg-transparent text-[13.5px] text-on placeholder-dim outline-none"/>
        {query&&<button type="button" aria-label="清除搜索" onClick={clear} className="w-5 h-5 rounded-full bg-s4 flex items-center justify-center text-mut pressable"><IClose size={11}/></button>}
      </form>
      <button type="button" aria-label="搜索来源与筛选" aria-expanded={showScope} onClick={()=>setShowScope(v=>!v)} className="w-11 h-11 shrink-0 rounded-(--r-sm) flex items-center justify-center bg-primary text-on-primary pressable elev-2"><ISettings size={19}/></button>
    </div>
    <div className="flex-1 min-h-0 scroll-y px-4 pb-6">
      {showScope&&<div className="legacy-search-options"><Scope kind="search" plugins={available}/><FilterControls filters={filters} values={values} change={setValues}/><button onClick={manage} className="text-primary text-xs pressable">管理插件</button></div>}
      {!!suggest.length&&query!==submitted&&<div className="flex flex-wrap gap-2 mb-3" aria-label="搜索建议">{suggest.map(s=><button className="px-3 h-8 rounded-(--r-ctl) bg-s3 text-xs text-on pressable" key={s} onClick={()=>search(s)}>{s}</button>)}</div>}
      {!submitted?<>
        {!!history.length&&<section className="mt-1 a-rise" aria-label="搜索历史">
          <div className="flex items-center justify-between"><span className="text-[13px] font-bold text-on">搜索历史</span><button onClick={()=>setHistory([])} className="text-[11px] text-dim pressable">清空</button></div>
          <div className="flex flex-wrap gap-2 mt-2.5">{history.map(h=><button key={h} onClick={()=>search(h)} className="px-3.5 h-8 rounded-(--r-ctl) bg-s3 text-[12px] text-on/80 pressable">{h}</button>)}</div>
        </section>}
        {chosen.filter(p=>trending[p.meta.id]?.length).map(p=><section key={p.meta.id} className="mt-5 rounded-(--r-md) bg-s2 p-3.5 a-rise"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-1.5 text-[13px] font-semibold text-on/90"><IFireF size={15} className="text-primary"/>热门搜索</span><span className="text-[11px] text-mut">{p.meta.name}</span></div><div className="flex flex-wrap gap-2 mt-3">{trending[p.meta.id].map(s=><button key={s} onClick={()=>search(s)} className="px-3 h-7 rounded-(--r-ctl) bg-s3 text-[12px] text-on/85 pressable">{s}</button>)}</div></section>)}
        {!available.length?<EmptySources manage={manage}/>:<p className="text-[11.5px] text-dim leading-relaxed mt-6">{chosen.length?"输入关键词后按回车搜索，也可以点搜索历史或热门词直接查看。":"请在右上角选择搜索片源。"}</p>}
      </>:<>
        {chosen.length>1&&<nav className="legacy-search-tabs flex gap-2 overflow-x-auto pb-2" aria-label="搜索结果来源"><button aria-pressed={tab==="all"} className={tab==="all"?"selected":""} onClick={()=>{setTab("all");setChoice(null);}}>全部</button>{chosen.map(p=><button key={p.meta.id} aria-pressed={tab===p.meta.id} className={tab===p.meta.id?"selected":""} onClick={()=>{setTab(p.meta.id);setChoice(null);}}>{p.meta.name}{busy[p.meta.id]?" · 加载中":` · ${pages[p.meta.id]?.items.length||0}`}</button>)}</nav>}
        <div className="text-[11.5px] text-mut mt-1 mb-2.5" aria-live="polite">「{submitted}」共 <span className="text-primary font-bold">{visibleGroups.length}</span> 条结果{loading?" · 搜索中…":""}</div>
        {choice?<div className="hpp-source-choice legacy-search-options"><div className="flex items-center justify-between mb-3"><h2 className="text-sm font-bold">选择内容来源</h2><button onClick={()=>setChoice(null)} className="text-primary text-xs">返回搜索</button></div>{choice.map(h=><button className="block w-full text-left p-3 mb-2 bg-s3 rounded-(--r-ctl) text-xs" key={h.pluginId+h.item.id} onClick={()=>open(h.pluginId,h.item.id)}>{sources.find(p=>p.meta.id===h.pluginId)?.meta.name} · {h.item.title}</button>)}</div>:
          <SearchPosters groups={visibleGroups} names={Object.fromEntries(sources.map(p=>[p.meta.id,p.meta.name]))} open={openGroup}/>}
        {!visibleGroups.length&&(loading?<div className="flex justify-center py-12"><div className="w-8 h-8 spinner" aria-label="正在搜索"/></div>:<div className="py-12 text-center text-mut"><ISearch size={26} className="mx-auto mb-3"/><p className="text-sm">没有找到相关内容</p><p className="text-xs text-dim mt-2">换个关键词或片源试试</p></div>)}
        {activeSources.map(p=><section key={p.meta.id}><Notice error={errors[p.meta.id]||warnings[p.meta.id]||""} retry={errors[p.meta.id]?()=>void load(p,submitted,epoch.current,failedCursors.current.get(p.meta.id)):undefined} retryLabel={tab==="all"?`重试 ${p.meta.name}`:"重试搜索"}/>{pages[p.meta.id]?.next&&<PageLoadMore next={pages[p.meta.id].next} busy={!!busy[p.meta.id]} error={errors[p.meta.id]||""} more={()=>void load(p,submitted,epoch.current,pages[p.meta.id].next||undefined)} label={`加载更多 · ${p.meta.name}`}/>}</section>)}
      </>}
    </div>
  </div>;
}
