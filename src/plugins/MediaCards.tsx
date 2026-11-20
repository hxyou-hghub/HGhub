import { useEffect, useRef, useState } from "react";
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

const WATERFALL_MIN_COLUMN = 148;
const WATERFALL_GAP = 14;
const WATERFALL_MAX_COLUMNS = 6;

function useWaterfallColumns(host: React.RefObject<HTMLDivElement | null>) {
  const [count, setCount] = useState(2);
  useEffect(() => {
    const node = host.current;
    if (!node) return;
    const measure = () => setCount(Math.max(2, Math.min(WATERFALL_MAX_COLUMNS,
      Math.floor((node.clientWidth + WATERFALL_GAP) / (WATERFALL_MIN_COLUMN + WATERFALL_GAP)))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [host]);
  return count;
}

function WaterfallCard({ item, cover, onOpen }: { item: MediaItem; cover?: string; onOpen: () => void }) {
  const meta = [item.year, item.type, item.episodeCount ? `${item.episodeCount} 集` : null].filter(Boolean).join(" · ");
  return <button className="hpp-media-card hpp-waterfall-card" onClick={onOpen}>
    <div className="hpp-poster">{cover ? <img src={cover} alt="" loading="lazy"/> : <span>{item.title.slice(0, 2)}</span>}{item.badge && <small>{item.badge}</small>}</div>
    <strong>{item.title}</strong>
    {item.description && <span className="hpp-waterfall-desc">{item.description}</span>}
    {meta && <p>{meta}</p>}
    {!!item.tags?.length && <span className="hpp-waterfall-tags">{item.tags.slice(0, 3).join(" · ")}</span>}
  </button>;
}

/** Masonry columns keep already-loaded pages in place when the next page is appended. */
export function WaterfallCards({ pluginId, items, open }: { pluginId: string; items: MediaItem[]; open: (item: MediaItem) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const columns = useWaterfallColumns(host);
  const urls = useAssetUrls(pluginId, items.flatMap(item => item.cover ? [item.cover] : []));
  let image = 0;
  const cards = items.map(item => ({ item, cover: item.cover ? urls[image++] : undefined }));
  const buckets: typeof cards[] = Array.from({ length: columns }, () => []);
  cards.forEach((card, index) => buckets[index % columns].push(card));
  return <div className="hpp-waterfall" ref={host}>
    {buckets.map((bucket, index) => <div className="hpp-waterfall-column" key={index}>
      {bucket.map(({ item, cover }) => <WaterfallCard key={item.id} item={item} cover={cover} onOpen={() => open(item)}/>)}
    </div>)}
  </div>;
}
