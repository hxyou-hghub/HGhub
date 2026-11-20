import { useEffect, useMemo, useState } from "react";
import { ICpu, IBack, IGrid, ILockF, IRefresh } from "../icons";
import { pluginError, type InstalledPlugin } from "../plugins/client";
import type { Endpoint, Setting } from "../plugins/protocol";
import { usePluginRequests } from "../plugins/usePluginRequests";
import PluginForms from "../plugins/PluginForms";
import PluginDistribution from "../plugins/PluginDistribution";
import { useHost } from "../plugins/HostContext";
import { Modal, Toggle } from "../components/ui";
import { useStore } from "../store";

const statuses: Record<InstalledPlugin["status"], string> = {
  ready: "已就绪",
  unloaded: "待加载",
  failed: "运行失败",
  incompatible: "不兼容",
  disabled: "已停用",
};

function ErrorMessage({ error, onDismiss }: { error: string; onDismiss?: () => void }) {
  if (!error) return null;
  return (
    <div className="hpp-error" role="alert">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
        <span className="truncate">{error}</span>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="hpp-error-dismiss"
          aria-label="关闭提示"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function PluginIcon({ plugin }: { plugin: InstalledPlugin }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const metaRecord = plugin.meta as unknown as Record<string, unknown>;
  const custom = metaRecord.icon || metaRecord.logo;

  const favicon = useMemo(() => {
    if (typeof custom === "string" && custom.trim()) return custom.trim();

    const candidate = plugin.endpoint?.url || plugin.meta.homepage || plugin.meta.matches?.[0] || plugin.origin?.location;
    if (!candidate) return null;
    try {
      const raw = candidate.startsWith("http://") || candidate.startsWith("https://") ? candidate : `https://${candidate}`;
      const url = new URL(raw);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return `${url.origin}/favicon.ico`;
      }
    } catch {
      return null;
    }
    return null;
  }, [plugin.endpoint?.url, plugin.meta.homepage, plugin.meta.matches, plugin.origin?.location, custom]);

  const showIcon = favicon && failedUrl !== favicon;

  return (
    <span className="hpp-plugin-icon">
      {showIcon ? (
        <img
          src={favicon}
          alt=""
          className="w-5 h-5 rounded-sm object-contain"
          onError={() => setFailedUrl(favicon)}
          loading="lazy"
        />
      ) : (
        <IGrid size={20} />
      )}
    </span>
  );
}

export default function Plugins({ onBack, focusId }: { onBack: () => void; focusId?: string }) {
  const host = useHost();
  // 插件管理中心展示全部已安装插件，成人内容过滤只作用于内容来源（home/search），不应用于管理列表。
  const plugins = host.plugins;

  return (
    <div className="hpp-page hpp-plugins-page">
      <header className="hpp-header">
        <button aria-label="返回" onClick={onBack}><IBack size={20} /></button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1 className="truncate">插件中心</h1>
        </div>
      </header>
      <ErrorMessage error={host.error} />
      <PluginManagement plugins={plugins} reload={host.reload} focusId={focusId} />
    </div>
  );
}

function PluginManagement({ plugins, reload, focusId = "" }: { plugins: InstalledPlugin[]; reload: () => Promise<void>; focusId?: string }) {
  const app = useStore();
  const request = usePluginRequests();
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const [options, setOptions] = useState<string | null>(focusId || null);
  const [detailPluginId, setDetailPluginId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const detailPlugin = useMemo(() => plugins.find(p => p.meta.id === detailPluginId) || null, [plugins, detailPluginId]);
  const optionsPlugin = useMemo(() => plugins.find(p => p.meta.id === options) || null, [plugins, options]);

  useEffect(() => {
    if (focusId) {
      setOptions(focusId);
    }
  }, [focusId]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const perform = async (action: string, params: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      await request(action, params);
      await reload();
    } catch (e) {
      setError(pluginError(e));
    } finally {
      setBusy(false);
    }
  };

  const batchPerform = async (action: "remove", targetIds: string[]) => {
    if (!targetIds.length) return;
    setBusy(true);
    setError("");
    try {
      for (const id of targetIds) {
        if (action === "remove") await request("remove", { id });
      }
      await reload();
      setSelectedIds([]);
    } catch (e) {
      setError(pluginError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hpp-scroll">
      <div className="hpp-content">
        {/* 顶部：添加与订阅管理 */}
        <PluginDistribution plugins={plugins} reload={reload} />

        <ErrorMessage error={error} />

        {/* 主体：统一单页插件列表，保持一份 */}
        <div className="hpp-unified-plugins">
          <div className="hpp-section-title">
            <div className="flex items-center gap-2 min-w-0">
              <h2 className="truncate">已安装插件</h2>
              <span className="text-[12px] opacity-50 font-normal shrink-0">{plugins.length} 个插件</span>
            </div>
            {batchMode ? (
              <div className="hpp-batch-bar">
                <button
                  className="hpp-btn-subtle"
                  onClick={() => {
                    if (selectedIds.length === plugins.length) setSelectedIds([]);
                    else setSelectedIds(plugins.map(p => p.meta.id));
                  }}
                >
                  {selectedIds.length === plugins.length ? "取消全选" : "全选"}
                </button>
                <button
                  className="danger"
                  disabled={busy || !selectedIds.length}
                  onClick={() => {
                    if (window.confirm(`确定批量移除所选的 ${selectedIds.length} 个插件及其本地数据？`)) {
                      void batchPerform("remove", selectedIds);
                    }
                  }}
                >
                  移除{selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
                </button>
                <button
                  className="primary"
                  onClick={() => { setBatchMode(false); setSelectedIds([]); }}
                >
                  完成
                </button>
              </div>
            ) : (
              plugins.length > 0 && (
                <button className="hpp-btn-subtle" onClick={() => { setBatchMode(true); setSelectedIds([]); }}>
                  批量操作
                </button>
              )
            )}
          </div>

          {!plugins.length && (
            <div className="hpp-empty">
              <ICpu size={40} />
              <h2>暂无已安装插件</h2>
              <p>可在上方选择本地插件文件、输入清单地址或粘贴代码开始导入。</p>
            </div>
          )}

          <div className="hpp-installed">
            {plugins.map(p => (
              <article
                className={`hpp-plugin ${batchMode ? "is-batch-mode" : ""} ${selectedIds.includes(p.meta.id) ? "is-selected" : ""}`}
                key={p.meta.id}
                data-status={p.status}
                onClick={batchMode ? () => toggleSelect(p.meta.id) : undefined}
              >
                <div className="hpp-plugin-main">
                  {batchMode && (
                    <input
                      type="checkbox"
                      className="hpp-batch-checkbox"
                      aria-label={`选择 ${p.meta.name}`}
                      checked={selectedIds.includes(p.meta.id)}
                      onChange={e => {
                        e.stopPropagation();
                        toggleSelect(p.meta.id);
                      }}
                    />
                  )}
                  <PluginIcon plugin={p} />
                  <div
                    className={`hpp-plugin-info ${batchMode ? "" : "is-clickable"}`}
                    onClick={batchMode ? undefined : () => setDetailPluginId(p.meta.id)}
                    title={batchMode ? undefined : "查看插件详情"}
                  >
                    <div className="hpp-plugin-title-row">
                      <h3>{p.meta.name}</h3>
                      {/* 默认正常可用状态（ready 或 unloaded 按需待命）静默无噪音；仅存在真实异常时才展示标签 */}
                      {p.status !== "ready" && p.status !== "unloaded" && (
                        <span className={`hpp-status ${p.status}`}>{statuses[p.status]}</span>
                      )}
                    </div>
                    {p.meta.description && <p className="hpp-plugin-desc">{p.meta.description}</p>}
                    <ErrorMessage error={p.error?.message || ""} />
                  </div>

                  {!batchMode && (
                    <div className="hpp-plugin-actions">
                      <button onClick={() => setDetailPluginId(p.meta.id)}>
                        详情
                      </button>
                      <button onClick={() => setOptions(p.meta.id)}>
                        设置与日志
                      </button>
                      <button className="danger" disabled={busy} onClick={() => {
                        if (window.confirm(`移除「${p.meta.name}」及其本地存储与 Cookie？`)) void perform("remove", { id: p.meta.id });
                      }}>
                        移除
                      </button>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>

      {detailPlugin && (
        <PluginDetailModal
          plugin={detailPlugin}
          onClose={() => setDetailPluginId(null)}
        />
      )}

      {optionsPlugin && (
        <PluginOptionsModal
          key={optionsPlugin.meta.id + optionsPlugin.revision}
          plugin={optionsPlugin}
          onClose={() => setOptions(null)}
          reload={reload}
        />
      )}
    </div>
  );
}

function PluginOptionsModal({
  plugin: p,
  onClose,
  reload,
}: {
  plugin: InstalledPlugin;
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const request = usePluginRequests();
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [logs, setLogs] = useState<unknown[]>([]);
  const [logsBusy, setLogsBusy] = useState(false);
  const [logsNotice, setLogsNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [probes, setProbes] = useState<{ id: string; url: string; ok: boolean; latencyMs: number; status?: number; error?: string }[]>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [notice, setNotice] = useState("");

  const hasSettings = Boolean(p.meta.settings?.length);
  const hasEndpoints = Boolean(endpoints.length || (p.enabled && p.methods.includes("endpoints.list")));
  const [activeTab, setActiveTab] = useState<"settings" | "logs">("settings");

  const settingsTabLabel = useMemo(() => {
    if (hasEndpoints && !hasSettings) return "站点线路";
    if (!hasEndpoints && hasSettings) return "插件配置";
    return "常规设置";
  }, [hasEndpoints, hasSettings]);

  useEffect(() => {
    if (hasSettings) {
      void request<Record<string, unknown>>("settings.get", { id: p.meta.id })
        .then(values => { setSettings(values); setSettingsLoaded(true); })
        .catch(e => {
          const err = pluginError(e);
          if (err !== "调用已取消" && (e as any)?.code !== "CANCELLED") {
            setError(err);
          }
        });
    }

    if (p.enabled && p.methods.includes("endpoints.list")) {
      void request<Endpoint[]>("endpoint.list", { id: p.meta.id, refresh: false })
        .then(setEndpoints)
        .catch(e => {
          const err = pluginError(e);
          if (err !== "调用已取消" && (e as any)?.code !== "CANCELLED") {
            setError(err);
          }
        });
    }
  }, [p.meta.id, p.enabled, p.methods, hasSettings]);

  const update = async (action: string, data: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(action, { id: p.meta.id, ...data });
      await reload();
      setNotice("设置已保存");
      setTimeout(() => setNotice(""), 2000);
    } catch (e) {
      const err = pluginError(e);
      if (err !== "调用已取消" && (e as any)?.code !== "CANCELLED") {
        setError(err);
      }
    } finally {
      setBusy(false);
    }
  };

  const loadLogs = async () => {
    setLogsBusy(true);
    setError("");
    setLogsNotice("");
    try {
      const rows = await request<unknown[]>("logs", { id: p.meta.id });
      setLogs(rows);
      setLogsNotice(rows.length ? `已获取 ${rows.length} 条日志` : "暂无运行日志");
    } catch (e) {
      const err = pluginError(e);
      if (err !== "调用已取消" && (e as any)?.code !== "CANCELLED") setError(err);
    } finally {
      setLogsBusy(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} width={560}>
      <div className="hpp-modal-box" aria-label={`${p.meta.name} 设置与日志`}>
        <div className="hpp-modal-header">
          <div className="hpp-plugin-detail-header min-w-0 flex-1">
            <PluginIcon plugin={p} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="truncate">{p.meta.name}</h3>
                <span className="text-[11px] px-1.5 py-0.5 rounded font-mono bg-white/10 dark:bg-white/10 opacity-70 shrink-0">
                  v{p.meta.version}
                </span>
              </div>
              <div className="hpp-plugin-detail-header-sub">
                <span className="text-xs opacity-50 font-mono truncate">{p.meta.id}</span>
              </div>
            </div>
          </div>
          <button className="hpp-modal-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="hpp-modal-tab-bar">
          <div className="hpp-modal-tabs" role="tablist" aria-label="设置与日志分栏">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "settings"}
              className={`hpp-modal-tab ${activeTab === "settings" ? "active" : ""}`}
              onClick={() => setActiveTab("settings")}
            >
              {settingsTabLabel}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "logs"}
              className={`hpp-modal-tab ${activeTab === "logs" ? "active" : ""}`}
              onClick={() => setActiveTab("logs")}
            >
              运行日志
              {logs.length > 0 && (
                <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-primary/20 text-primary font-mono leading-none">
                  {logs.length}
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="hpp-modal-body">
          <ErrorMessage error={error} onDismiss={() => setError("")} />

          {activeTab === "settings" && (
            <>
              <PluginForms plugin={p} />

              {hasSettings && (
                <section className="hpp-detail-section">
                  <div className="hpp-detail-section-title">插件配置</div>
                  <div className="flex flex-col gap-2.5">
                    {p.meta.settings?.map(s => (
                      <div className="flex items-center justify-between gap-3 flex-wrap" key={s.key}>
                        <label htmlFor={`setting-${s.key}`} className="text-xs font-medium opacity-80 min-w-[100px]">
                          {s.label}
                        </label>
                        <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                          <SettingInput
                            setting={s}
                            value={settings[s.key]}
                            disabled={busy || !settingsLoaded}
                            onChange={v => setSettings(old => ({ ...old, [s.key]: v }))}
                          />
                          <button
                            type="button"
                            className="hpp-section-btn text-xs px-2.5 py-1.5 shrink-0"
                            disabled={busy || !settingsLoaded}
                            onClick={() => void update("settings.set", { key: s.key, value: settings[s.key] })}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {notice && (
                    <div role="status" className="flex items-center gap-1.5 text-xs text-emerald-500 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{notice}</span>
                    </div>
                  )}
                </section>
              )}

              {hasEndpoints && (
                <section className="hpp-detail-section">
                  <div className="flex items-center justify-between gap-2">
                    <div className="hpp-detail-section-title">站点线路</div>
                    {p.enabled && p.methods.includes("endpoints.list") && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          aria-label="刷新站点线路"
                          className="hpp-section-btn"
                          onClick={() => {
                            setBusy(true);
                            setError("");
                            void request<Endpoint[]>("endpoint.list", { id: p.meta.id, refresh: true })
                              .then(async r => { setEndpoints(r); setProbes([]); await reload(); })
                              .catch(e => {
                                const err = pluginError(e);
                                if (err !== "调用已取消" && (e as any)?.code !== "CANCELLED") setError(err);
                              })
                              .finally(() => setBusy(false));
                          }}
                        >
                          <IRefresh size={12} className={busy ? "animate-spin" : ""} />
                          <span>刷新线路</span>
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          aria-label="探测站点线路"
                          className="hpp-section-btn"
                          onClick={() => {
                            setBusy(true);
                            setError("");
                            void request<typeof probes>("endpoint.probe", { id: p.meta.id })
                              .then(setProbes)
                              .catch(e => {
                                const err = pluginError(e);
                                if (err !== "调用已取消" && (e as any)?.code !== "CANCELLED") setError(err);
                              })
                              .finally(() => setBusy(false));
                          }}
                        >
                          <span>测速探测</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {!!endpoints.length && (
                    <div className="relative mt-1">
                      <select
                        value={p.endpoint?.id || ""}
                        disabled={busy}
                        aria-label="当前线路"
                        onChange={e => void update("endpoint.set", { endpointId: e.target.value })}
                        className="hpp-select-modern"
                      >
                        {endpoints.map(e => (
                          <option value={e.id} key={e.id} className="bg-s2 text-on">
                            {e.label || e.id} · {e.url}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {!!probes.length && (
                    <div className="hpp-probes-grid mt-2">
                      {probes.map(result => {
                        const endpoint = endpoints.find(e => e.id === result.id);
                        const label = endpoint?.label || result.id;
                        return (
                          <div key={result.id} className="hpp-probe-item">
                            <span className="truncate opacity-80" title={endpoint?.url || result.url}>
                              {label}
                            </span>
                            {result.ok ? (
                              <span className="hpp-probe-badge success">
                                可达 · {result.latencyMs} ms
                              </span>
                            ) : (
                              <span className="hpp-probe-badge danger">
                                {result.error || `HTTP ${result.status}`}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          )}

          {activeTab === "logs" && (
            <section className="hpp-detail-section !gap-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs opacity-60">运行时控制台与网络日志</span>
                <div className="flex items-center gap-1.5">
                  {!!logs.length && (
                    <button
                      type="button"
                      className="hpp-section-btn opacity-70 hover:opacity-100"
                      onClick={() => { setLogs([]); setLogsNotice(""); }}
                    >
                      清空
                    </button>
                  )}
                  <button
                    type="button"
                    className="hpp-section-btn"
                    disabled={logsBusy}
                    onClick={() => void loadLogs()}
                  >
                    <IRefresh size={12} className={logsBusy ? "animate-spin" : ""} />
                    <span>刷新日志</span>
                  </button>
                </div>
              </div>

              {!!logs.length ? (
                <pre className="hpp-logs !mt-0 !max-h-[360px]">{logs.map(x => (typeof x === "string" ? x : JSON.stringify(x))).join("\n")}</pre>
              ) : (
                <div className="hpp-empty-logs flex-col gap-2 py-8">
                  <span className="opacity-70">{logsBusy ? "正在获取运行日志…" : "暂无运行日志"}</span>
                  <button
                    type="button"
                    className="hpp-section-btn text-xs mt-1"
                    disabled={logsBusy}
                    onClick={() => void loadLogs()}
                  >
                    <IRefresh size={12} className={logsBusy ? "animate-spin" : ""} />
                    <span>获取近期运行日志</span>
                  </button>
                </div>
              )}

              {logsNotice && (
                <div role="status" className="flex items-center gap-1.5 text-xs opacity-70">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span>{logsNotice}</span>
                </div>
              )}
            </section>
          )}
        </div>

        <div className="hpp-modal-footer">
          <button className="primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </Modal>
  );
}

function SettingInput({ setting: s, value, disabled, onChange }: { setting: Setting; value: unknown; disabled: boolean; onChange: (v: unknown) => void }) {
  const id = `setting-${s.key}`;
  if (s.type === "switch") return <input id={id} type="checkbox" disabled={disabled} checked={value === true} onChange={e => onChange(e.target.checked)} />;
  if (s.type === "select") return <select id={id} className="hpp-select-modern" disabled={disabled} value={String(value ?? "")} onChange={e => onChange(e.target.value)}>{s.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  return <input id={id} className="hpp-select-modern" type={s.type === "number" ? "number" : s.type === "password" ? "password" : "text"} disabled={disabled} placeholder={s.placeholder} min={s.min} max={s.max} value={String(value ?? "")} onChange={e => onChange(s.type === "number" ? Number(e.target.value) : e.target.value)} />;
}

function PluginDetailModal({
  plugin,
  onClose,
}: {
  plugin: InstalledPlugin;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(plugin.meta.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore clipboard error
    }
  };

  const isResolver = plugin.meta.kind === "resolver";
  const isSource = plugin.meta.kind === "source";
  const kindText = isResolver ? "解析器插件" : isSource ? "数据源插件" : "通用插件";

  return (
    <Modal open={true} onClose={onClose} width={560}>
      <div className="hpp-modal-box" aria-label={`${plugin.meta.name} 详情`}>
        <div className="hpp-modal-header">
          <div className="hpp-plugin-detail-header min-w-0 flex-1">
            <PluginIcon plugin={plugin} />
            <div className="min-w-0 flex-1">
              <h3 className="truncate">{plugin.meta.name}</h3>
              <div className="hpp-plugin-detail-header-sub">
                <span className={`hpp-status ${plugin.status}`}>{statuses[plugin.status]}</span>
                <span className="text-xs opacity-50 truncate">{kindText}</span>
              </div>
            </div>
          </div>
          <button className="hpp-modal-close" onClick={onClose} aria-label="关闭">✕</button>
        </div>

        <div className="hpp-modal-body">
          {/* 基本信息与唯一标识 */}
          <section className="hpp-detail-section">
            <div className="hpp-detail-section-title">基本信息</div>
            <div className="hpp-detail-grid">
              <div className="hpp-detail-field">
                <span className="hpp-detail-k">唯一标识 (ID)</span>
                <span className="hpp-detail-v">
                  <span className="hpp-detail-code">
                    <span>{plugin.meta.id}</span>
                    <button type="button" className="hpp-detail-copy-btn" onClick={copyId}>
                      {copied ? "已复制" : "复制"}
                    </button>
                  </span>
                </span>
              </div>
              <div className="hpp-detail-field">
                <span className="hpp-detail-k">版本</span>
                <span className="hpp-detail-v">
                  v{plugin.meta.version} <span className="opacity-50 text-[11px]">(HPP v{plugin.meta.protocol})</span>
                </span>
              </div>
              {plugin.meta.author && (
                <div className="hpp-detail-field">
                  <span className="hpp-detail-k">作者</span>
                  <span className="hpp-detail-v">{plugin.meta.author}</span>
                </div>
              )}
              {plugin.meta.homepage && (
                <div className="hpp-detail-field full">
                  <span className="hpp-detail-k">主页 / 官网</span>
                  <span className="hpp-detail-v">
                    <a href={plugin.meta.homepage} target="_blank" rel="noreferrer" className="underline opacity-80 hover:opacity-100">
                      {plugin.meta.homepage}
                    </a>
                  </span>
                </div>
              )}
            </div>
            {plugin.meta.description && (
              <div className="hpp-detail-field full mt-1">
                <span className="hpp-detail-k">功能描述</span>
                <p className="hpp-detail-v text-xs leading-relaxed opacity-85 m-0 whitespace-pre-wrap">{plugin.meta.description}</p>
              </div>
            )}
          </section>

          {/* 来源与订阅（原问号提示中的隐藏信息） */}
          <section className="hpp-detail-section">
            <div className="hpp-detail-section-title">来源与分发</div>
            <div className="hpp-detail-grid">
              <div className="hpp-detail-field">
                <span className="hpp-detail-k">来源类型</span>
                <span className="hpp-detail-v">{plugin.origin?.location ? "线上订阅" : "本地来源"}</span>
              </div>
              {plugin.origin?.manifestName && (
                <div className="hpp-detail-field">
                  <span className="hpp-detail-k">订阅名称</span>
                  <span className="hpp-detail-v">{plugin.origin.manifestName}</span>
                </div>
              )}
              <div className="hpp-detail-field full">
                <span className="hpp-detail-k">安装来源地址</span>
                <span className="hpp-detail-v font-mono text-[11px] opacity-80">{plugin.origin?.location || plugin.source || "本地代码"}</span>
              </div>
              {plugin.origin?.manifest && plugin.origin.manifest !== plugin.origin.location && (
                <div className="hpp-detail-field full">
                  <span className="hpp-detail-k">订阅清单地址</span>
                  <span className="hpp-detail-v font-mono text-[11px] opacity-80">{plugin.origin.manifest}</span>
                </div>
              )}
              {plugin.meta.updateUrl && (
                <div className="hpp-detail-field full">
                  <span className="hpp-detail-k">独立更新地址</span>
                  <span className="hpp-detail-v font-mono text-[11px] opacity-80">{plugin.meta.updateUrl}</span>
                </div>
              )}
            </div>
          </section>

          {/* 接口能力与方法（原问号提示中的能力统计与具体列表） */}
          <section className="hpp-detail-section">
            <div className="flex items-center justify-between">
              <div className="hpp-detail-section-title">声明能力与接口</div>
              <span className="text-[11px] opacity-50">{plugin.methods.length} 项能力</span>
            </div>
            {plugin.methods.length > 0 ? (
              <div className="hpp-tag-list">
                {plugin.methods.map(m => (
                  <span key={m} className="hpp-tag-item">{m}</span>
                ))}
              </div>
            ) : (
              <span className="text-xs opacity-50">未声明特定公开方法</span>
            )}

            {plugin.meta.features && plugin.meta.features.length > 0 && (
              <div className="hpp-detail-field full mt-1">
                <span className="hpp-detail-k">特性声明 (Features)</span>
                <div className="hpp-tag-list mt-1">
                  {plugin.meta.features.map(f => (
                    <span key={f} className="hpp-tag-item">{f}</span>
                  ))}
                </div>
              </div>
            )}

            {plugin.meta.requires && plugin.meta.requires.length > 0 && (
              <div className="hpp-detail-field full mt-1">
                <span className="hpp-detail-k">依赖要求 (Requires)</span>
                <div className="hpp-tag-list mt-1">
                  {plugin.meta.requires.map(r => (
                    <span key={`${r.type}-${r.name}`} className="hpp-tag-item">{r.type}:{r.name}</span>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 网络与站点端点 */}
          {(plugin.endpoint || (plugin.meta.matches && plugin.meta.matches.length > 0) || (plugin.meta.linkDomains && plugin.meta.linkDomains.length > 0)) && (
            <section className="hpp-detail-section">
              <div className="hpp-detail-section-title">网络与站点</div>
              <div className="hpp-detail-grid">
                {plugin.endpoint && (
                  <div className="hpp-detail-field full">
                    <span className="hpp-detail-k">当前线路 / API 端点</span>
                    <span className="hpp-detail-v font-mono text-[11px]">
                      {plugin.endpoint.label ? `${plugin.endpoint.label} · ` : ""}{plugin.endpoint.url}
                    </span>
                  </div>
                )}
                {plugin.meta.matches && plugin.meta.matches.length > 0 && (
                  <div className="hpp-detail-field full">
                    <span className="hpp-detail-k">匹配域名 / 规则</span>
                    <span className="hpp-detail-v font-mono text-[11px]">{plugin.meta.matches.join(", ")}</span>
                  </div>
                )}
                {plugin.meta.linkDomains && plugin.meta.linkDomains.length > 0 && (
                  <div className="hpp-detail-field full">
                    <span className="hpp-detail-k">外链解析域名</span>
                    <span className="hpp-detail-v font-mono text-[11px]">{plugin.meta.linkDomains.join(", ")}</span>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 异常详情（若存在） */}
          {plugin.error && (
            <section className="hpp-detail-section">
              <div className="hpp-detail-section-title text-red-500">错误诊断</div>
              <div className="hpp-detail-field full">
                <span className="hpp-detail-k">错误代码</span>
                <span className="hpp-detail-v text-red-500 font-mono text-xs">{plugin.error.code}</span>
              </div>
              <div className="hpp-detail-field full">
                <span className="hpp-detail-k">错误说明</span>
                <span className="hpp-detail-v text-red-500 text-xs">{plugin.error.message}</span>
              </div>
            </section>
          )}
        </div>

        <div className="hpp-modal-footer">
          <button className="primary" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </Modal>
  );
}
