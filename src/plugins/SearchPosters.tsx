import { useAssetUrls } from "./MediaCards";
import type { SearchHit } from "./searchModel";

type Poster = { hit: SearchHit; group: SearchHit[]; index: number };

function durationLabel(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Reuses the category grid presentation; each plugin prepares its own protected images in a batch.
function SourcePosters({ pluginId, posters, name, open }: { pluginId: string; posters: Poster[]; name: string; open: (group: SearchHit[]) => void }) {
  const urls = useAssetUrls(pluginId, posters.flatMap(p => p.hit.item.cover ? [p.hit.item.cover] : []));
  let imageIndex = 0;
  return <>{posters.map(({ hit: { item: v }, group, index }) => {
    const cover = v.cover ? urls[imageIndex++] : undefined;
    const sources = new Set(group.map(h => h.pluginId)).size;
    const badge = v.badge || durationLabel(v.durationSec) || (v.status === "finished" ? "已完结" : v.episodeCount ? `更新至${v.episodeCount}集` : "");
    const meta = [v.year, v.author?.name || name, sources > 1 ? `${sources} 个来源` : null].filter(Boolean).join(" · ");
    return <button key={v.id} onClick={() => open(group)} style={{ order: index }} className="hpp-media-card hpp-grid-card">
      <div className="hpp-poster">{cover ? <img src={cover} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = "hidden"; }}/> : <span>{v.title.slice(0, 2)}</span>}{badge && <small>{badge}</small>}</div>
      <div className="hpp-grid-caption">
        <strong>{v.title}</strong>
        {meta && <p>{meta}</p>}
      </div>
    </button>;
  })}</>;
}

export default function SearchPosters({ groups, names, open }: { groups: SearchHit[][]; names: Record<string, string>; open: (group: SearchHit[]) => void }) {
  const batches = new Map<string, Poster[]>();
  groups.forEach((group, index) => {
    const hit = group.find(h => h.item.cover) || group[0];
    batches.set(hit.pluginId, [...batches.get(hit.pluginId) || [], { hit, group, index }]);
  });
  return <div className="hpp-grid">{[...batches].map(([pluginId, posters]) => <SourcePosters key={pluginId} pluginId={pluginId} posters={posters} name={names[pluginId]} open={open}/>)}</div>;
}
