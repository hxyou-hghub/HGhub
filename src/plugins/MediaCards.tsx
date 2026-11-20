import { useEffect, useState } from "react";
import type { ImageRef, MediaItem } from "./protocol";
import { pluginCommand, releaseMedia } from "./client";

export function useAssetUrls(pluginId: string, assets: ImageRef[]) {
  const [urls,setUrls]=useState<string[]>([]);
  const encoded=JSON.stringify(assets);
  useEffect(()=>{
    let disposed=false;const sessions:string[]=[];setUrls([]);
    if(assets.length) void (async()=>{
      const result:string[]=[];
      for(let start=0;start<assets.length;start+=200){
        const r=await pluginCommand<{sessionId:string;urls:string[]}>("assets.prepare",{id:pluginId,assets:assets.slice(start,start+200)});
        if(disposed){releaseMedia(r.sessionId);return;}sessions.push(r.sessionId);result.push(...r.urls);
      }
      if(!disposed)setUrls(result);
    })().catch(()=>{for(const id of sessions)releaseMedia(id);});
    return ()=>{disposed=true;for(const id of sessions)releaseMedia(id);};
  },[pluginId,encoded]);return urls;
}
export default function MediaCards({ pluginId, items, open, landscape=false }: {pluginId:string;items:MediaItem[];open:(item:MediaItem)=>void;landscape?:boolean}) {
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
