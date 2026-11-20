import { useEffect, useRef, useState } from "react";
import type { ImageRef, MediaItem } from "./protocol";
import { pluginCommand, releaseMedia } from "./client";

type Prepared = { sessionId: string; url: string };
export function useAssetUrls(pluginId: string, assets: ImageRef[]) {
  const [urls,setUrls]=useState<string[]>([]);
  // 已解析资源按资源 JSON 缓存：分页追加时只为新增项 prepare，命中的旧地址保持不变，
  // 避免整页封面被清空重取（首屏已加载的图片不应因翻页而重新渲染）。
  const cache=useRef(new Map<string,Prepared>());
  const cachePlugin=useRef(pluginId);
  const encoded=JSON.stringify(assets);
  useEffect(()=>{
    let disposed=false;
    if(cachePlugin.current!==pluginId){cachePlugin.current=pluginId;cache.current.clear();}
    const keys=assets.map(asset=>JSON.stringify(asset));
    const cacheMap=cache.current,keep=new Set(keys);
    for(const [key,entry] of cacheMap){if(!keep.has(key)){releaseMedia(entry.sessionId);cacheMap.delete(key);}}
    const missing=[...new Set(keys.filter(key=>!cacheMap.has(key)))];
    const publish=()=>{if(!disposed)setUrls(keys.map(key=>cacheMap.get(key)?.url??""));};
    if(!missing.length){publish();return ()=>{disposed=true;};}
    void (async()=>{
      for(let start=0;start<missing.length;start+=200){
        const chunk=missing.slice(start,start+200);
        const r=await pluginCommand<{sessionId:string;urls:string[]}>("assets.prepare",{id:pluginId,assets:chunk.map(key=>JSON.parse(key) as ImageRef)});
        if(disposed){releaseMedia(r.sessionId);return;}
        r.urls.forEach((url,i)=>{const key=chunk[i];if(key!==undefined)cacheMap.set(key,{sessionId:r.sessionId,url});});
      }
      publish();
    })().catch(()=>{});
    return ()=>{disposed=true;};
  },[pluginId,encoded]);
  // 组件卸载时释放仍缓存的所有会话。
  useEffect(()=>()=>{for(const entry of cache.current.values())releaseMedia(entry.sessionId);cache.current.clear();},[]);
  return urls;
}
export default function MediaCards({ pluginId, items, open, landscape=false, layout="grid" }: {pluginId:string;items:MediaItem[];open:(item:MediaItem)=>void;landscape?:boolean;layout?:string}) {
  // Row sections (rankings) share the uniform card; grid sections flow at each cover's own aspect ratio.
  if(layout==="row")return <WaterfallCards pluginId={pluginId} items={items} open={open}/>;
  if(layout==="grid")return <FlowCards pluginId={pluginId} items={items} open={open}/>;
  const assets=items.flatMap(i=>(landscape?i.backdrop||i.cover:i.cover)?[landscape?i.backdrop||i.cover!:i.cover!]:[]);
  const urls=useAssetUrls(pluginId,assets);let n=0;
  return <div className={`hpp-cards ${landscape?"hpp-landscape":""}`}>{items.map((item,index)=>{
    const cover=(landscape?item.backdrop||item.cover:item.cover)?urls[n++]:undefined;
    return <button className="hpp-media-card" key={`${item.id}-${index}`} onClick={()=>open(item)}><div className="hpp-poster">{cover?<img src={cover} alt="" loading="lazy"/>:<span>{item.title.slice(0,2)}</span>}{item.badge&&<small>{item.badge}</small>}</div><strong>{item.title}</strong><p>{[item.year,item.type,item.episodeCount?`${item.episodeCount} 集`:null].filter(Boolean).join(" · ")}</p></button>;
  })}</div>;
}

function GridCard({ item, cover, onOpen }: { item: MediaItem; cover?: string; onOpen: () => void }) {
  const meta = [item.year, item.type, item.episodeCount ? `${item.episodeCount} 集` : null].filter(Boolean).join(" · ");
  return <button className="hpp-media-card hpp-grid-card" onClick={onOpen}>
    <div className="hpp-poster">{cover ? <img src={cover} alt="" loading="lazy"/> : <span>{item.title.slice(0, 2)}</span>}{item.badge && <small>{item.badge}</small>}</div>
    <div className="hpp-grid-caption">
      <strong>{item.title}</strong>
      {meta && <p>{meta}</p>}
    </div>
  </button>;
}

/** Uniform grid: every thumbnail shares one fixed size and every caption is two lines tall,
 *  so rows and columns stay aligned regardless of title length. */
export function WaterfallCards({ pluginId, items, open }: { pluginId: string; items: MediaItem[]; open: (item: MediaItem) => void }) {
  const urls = useAssetUrls(pluginId, items.flatMap(item => item.cover ? [item.cover] : []));
  let image = 0;
  return <div className="hpp-grid">
    {items.map(item => <GridCard key={item.id} item={item} cover={item.cover ? urls[image++] : undefined} onOpen={() => open(item)}/>)}
  </div>;
}

/** Flow row: covers keep their own aspect ratio, so cards vary in width and height while staying on one line. */
function FlowCard({ item, cover, onOpen }: { item: MediaItem; cover?: string; onOpen: () => void }) {
  const meta = [item.year, item.type, item.episodeCount ? `${item.episodeCount} 集` : null].filter(Boolean).join(" · ");
  return <button className="hpp-media-card hpp-flow-card" onClick={onOpen}>
    <div className="hpp-poster">{cover ? <img src={cover} alt="" loading="lazy"/> : <span>{item.title.slice(0, 2)}</span>}{item.badge && <small>{item.badge}</small>}</div>
    <div className="hpp-flow-caption">
      <strong>{item.title}</strong>
      {meta && <p>{meta}</p>}
    </div>
  </button>;
}

export function FlowCards({ pluginId, items, open }: { pluginId: string; items: MediaItem[]; open: (item: MediaItem) => void }) {
  const urls = useAssetUrls(pluginId, items.flatMap(item => item.cover ? [item.cover] : []));
  let image = 0;
  return <div className="hpp-flow">
    {items.map(item => <FlowCard key={item.id} item={item} cover={item.cover ? urls[image++] : undefined} onOpen={() => open(item)}/>)}
  </div>;
}
