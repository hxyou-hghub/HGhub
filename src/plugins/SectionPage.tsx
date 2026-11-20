import { BrowseFrame, ErrorState, Notice, type OpenMedia } from "./BrowsePages";
import type { InstalledPlugin } from "./client";
import MediaCards from "./MediaCards";
import type { MediaItem } from "./protocol";
import { PageLoadMore, usePagedPlugin } from "./usePagedPlugin";

export type OpenSection = (pluginId: string, sectionId: string, title?: string) => void;
export default function SectionPage({ plugin, sectionId, title, open, onBack }: {
  plugin: InstalledPlugin; sectionId: string; title?: string; open: OpenMedia; onBack: () => void;
}) {
  const list = usePagedPlugin<MediaItem>({ plugin, method: "home.listSection", args: { sectionId } });
  const hasItems = !!list.page?.items?.length;
  const activeError = list.error || list.warning;
  return <BrowseFrame title={title || "分区列表"} onBack={onBack}><p className="hpp-muted">{plugin.meta.name}</p>
    {hasItems && <Notice error={activeError} retry={list.error ? list.retry : undefined} retryLabel="重试分区"/>}
    {list.busy && !list.page ? <div className="hpp-skeleton"/> : hasItems ? <MediaCards pluginId={plugin.meta.id} items={list.page!.items} open={item => open(plugin.meta.id, item.id)}/> : null}
    {!list.busy && !hasItems && activeError && <ErrorState error={activeError} retry={list.error ? list.retry : undefined} retryLabel="重试分区"/>}
    {!list.busy && !hasItems && !activeError && <div className="py-16 text-center text-mut a-rise"><p className="text-sm font-medium">暂无分区内容</p></div>}
    {hasItems && <PageLoadMore next={list.page?.next} busy={list.busy} error={list.error} more={list.more}/>}
  </BrowseFrame>;
}
