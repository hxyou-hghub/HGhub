import { useAssetUrls } from "./MediaCards";
import type { SearchHit } from "./searchModel";

type Poster = { hit: SearchHit; group: SearchHit[] };

function durationLabel(seconds?: number) {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// 单一来源的卡片：仅负责本来源封面批处理，返回卡片元素数组，由父级铺进同一个网格。
// 每个来源各持一份 assets.prepare 会话，互不影响；卡片结构恒定，行高不随数据产生跳变。
function SourcePosterCards({ pluginId, posters, name, open }: { pluginId: string; posters: Poster[]; name: string; open: (group: SearchHit[]) => void }) {
  const urls = useAssetUrls(pluginId, posters.flatMap(p => p.hit.item.cover ? [p.hit.item.cover] : []));
  let imageIndex = 0;
  return <>{posters.map(({ hit: { item: v }, group }) => {
    const cover = v.cover ? urls[imageIndex++] : undefined;
    const sources = new Set(group.map(h => h.pluginId)).size;
    const badge = v.badge || durationLabel(v.durationSec) || (v.status === "finished" ? "已完结" : v.episodeCount ? `更新至${v.episodeCount}集` : "");
    const meta = [v.year, v.author?.name || name, sources > 1 ? `${sources} 个来源` : null].filter(Boolean).join(" · ");
    return <button key={v.id} onClick={() => open(group)} className="hpp-media-card hpp-grid-card">
      <div className="hpp-poster">{cover ? <img src={cover} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = "hidden"; }}/> : <span>{v.title.slice(0, 2)}</span>}{badge && <small>{badge}</small>}</div>
      <div className="hpp-grid-caption">
        <strong>{v.title}</strong>
        <p>{meta || "\u00a0"}</p>
      </div>
    </button>;
  })}</>;
}

// 搜索结果统一网格：所有来源的卡片共享同一个网格，避免按来源堆叠多个网格导致的整页跳动；
// 顺序按「来源首次出现位置 + 组内序号」稳定排列，翻页追加只在本网格末尾补卡，不影响已就位内容。
export default function SearchPosters({ groups, names, open }: { groups: SearchHit[][]; names: Record<string, string>; open: (group: SearchHit[]) => void }) {
  const batches = new Map<string, Poster[]>();
  groups.forEach(group => {
    const hit = group.find(h => h.item.cover) || group[0];
    batches.set(hit.pluginId, [...batches.get(hit.pluginId) || [], { hit, group }]);
  });
  return <div className="hpp-grid">
    {[...batches].map(([pluginId, posters]) => (
      <SourcePosterCards key={pluginId} pluginId={pluginId} posters={posters} name={names[pluginId]} open={open}/>
    ))}
  </div>;
}
