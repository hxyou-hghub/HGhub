import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { pluginCommand, pluginError, type InstalledPlugin } from "./client";
import type { PluginFailure } from "./protocol";
import { usePluginRequests } from "./usePluginRequests";
import { useHost } from "./HostContext";
import { Tooltip, Modal } from "../components/ui";
import { useStore } from "../store";

interface ImportItem {
  key: string; id: string; name: string; description: string; version: string; source: string;
  installedVersion?: string; error?: PluginFailure;
}
interface Preview { token: string; name: string; description: string; items: ImportItem[]; updatesOnly: boolean; subscriptions: { location: string; name: string; description: string }[] }
interface Outcome { key: string; id: string; plugin?: InstalledPlugin; error?: PluginFailure }
interface UpdateStatus { id: string; status: "current" | "available" | "failed" | "noSource"; error?: PluginFailure }
interface CodeMetaPreview { id?: string; name?: string; version?: string; description?: string; lines: number; chars: number }

function parseCodeMeta(source: string): CodeMetaPreview {
  const lines = source.split("\n").length;
  const chars = source.length;
  const metaMatch = source.match(/export\s+const\s+meta\s*=\s*(\{[\s\S]*?\n\s*\};?|\{[\s\S]*?\})/);
  let id: string | undefined;
  let name: string | undefined;
  let version: string | undefined;
  let description: string | undefined;
  if (metaMatch) {
    const metaStr = metaMatch[1];
    id = metaStr.match(/id\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
    name = metaStr.match(/name\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
    version = metaStr.match(/version\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
    description = metaStr.match(/description\s*:\s*["'`]([^"'`]+)["'`]/)?.[1];
  }
  return { id, name, version, description, lines, chars };
}

const newer = (next: string, current?: string) => {
  if (!current) return true;
  const a = next.split(".").map(Number), b = current.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  return false;
};

const DRAFT_KEYS = {
  mode: "hpp.import.mode",
  url: "hpp.import.url",
  filePath: "hpp.import.filePath",
  code: "hpp.import.code",
} as const;

export default function PluginDistribution({ plugins, reload }: { plugins: InstalledPlugin[]; reload: () => Promise<void> }) {
  const app = useStore();
  const request = usePluginRequests();
  const host = useHost();
  const [importMode, setImportMode] = useState<"url" | "file" | "code">(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEYS.mode);
      if (saved === "url" || saved === "file" || saved === "code") return saved;
    } catch {}
    return "url";
  });
  const [url, setUrl] = useState<string>(() => {
    try {
      return localStorage.getItem(DRAFT_KEYS.url) || "";
    } catch {
      return "";
    }
  });
  const [filePath, setFilePath] = useState<string>(() => {
    try {
      return localStorage.getItem(DRAFT_KEYS.filePath) || "";
    } catch {
      return "";
    }
  });
  const [code, setCode] = useState<string>(() => {
    try {
      return localStorage.getItem(DRAFT_KEYS.code) || "";
    } catch {
      return "";
    }
  });
  const [preview, setPreview] = useState<Preview | null>(null), [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const downgrade = true; // 彻底移除版本概念：导入时始终允许覆盖安装
  const installOnly = false; // 彻底移除“仅安装暂不启用”机制：导入即直接安装并启用
  const [report, setReport] = useState<Outcome[]>([]), [updates, setUpdates] = useState<UpdateStatus[]>([]);
  const [codePreview, setCodePreview] = useState<CodeMetaPreview | null>(null);
  const token = useRef<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEYS.mode, importMode);
    } catch {}
  }, [importMode]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEYS.url, url);
    } catch {}
  }, [url]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEYS.filePath, filePath);
    } catch {}
  }, [filePath]);

  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEYS.code, code);
    } catch {}
  }, [code]);

  const switchImportMode = (mode: "url" | "file" | "code") => {
    setImportMode(mode);
    setError("");
  };

  useEffect(() => () => { if (token.current) void pluginCommand("distribution.discard", { token: token.current }).catch(() => {}); }, []);

  const replacePreview = (next: Preview | null, changedOnly = false) => {
    if (token.current && token.current !== next?.token) void pluginCommand("distribution.discard", { token: token.current }).catch(() => {});
    token.current = next?.token || null;
    setPreview(next);
    setSelected(next?.items.filter(i => !i.error && (!changedOnly || newer(i.version, i.installedVersion))).map(i => i.key) || []);
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await work(); } catch (e) { setError(pluginError(e)); }
    finally { setBusy(false); }
  };

  const readLocations = async (locations: string[]) => {
    if (!locations.length) return;
    setReport([]); setUpdates([]);
    replacePreview(await request<Preview>("distribution.preview", { locations }));
  };

  const directImportLocations = async (locations: string[]) => {
    if (!locations.length) return;
    setReport([]); setUpdates([]);
    const p = await request<Preview>("distribution.preview", { locations });
    const validKeys = p.items.filter(i => !i.error).map(i => i.key);
    if (!validKeys.length) {
      replacePreview(p);
      return;
    }
    const result = await request<{ items: Outcome[] }>("distribution.apply", {
      token: p.token,
      selected: validKeys,
      allowDowngrade: downgrade,
      installOnly,
    });
    token.current = null; setPreview(null); setReport(result.items); setUpdates([]); await reload();
  };

  const canInspect = !busy && (
    (importMode === "url" && !!url.trim()) ||
    (importMode === "file" && !!filePath.trim()) ||
    (importMode === "code" && !!code.trim())
  );

  const canImport = !busy && (
    (importMode === "url" && !!url.trim()) ||
    (importMode === "file" && !!filePath.trim()) ||
    (importMode === "code" && !!code.trim())
  );

  const handleInspect = () => {
    if (busy) return;
    if (importMode === "url") {
      const target = url.trim();
      if (!target) return;
      void run(() => readLocations([target]));
    } else if (importMode === "file") {
      const target = filePath.trim();
      if (!target) return;
      void run(() => readLocations([target]));
    } else if (importMode === "code") {
      const target = code.trim();
      if (!target) return;
      setCodePreview(parseCodeMeta(target));
    }
  };

  const handleImport = () => {
    if (busy) return;
    if (importMode === "url") {
      const target = url.trim();
      if (!target) return;
      void run(() => directImportLocations([target]));
    } else if (importMode === "file") {
      const target = filePath.trim();
      if (!target) return;
      void run(() => directImportLocations([target]));
    } else if (importMode === "code") {
      const target = code.trim();
      if (!target) return;
      void run(async () => {
        const plugin = await request<InstalledPlugin>("import", { code: target, allowDowngrade: downgrade, installOnly });
        replacePreview(null);
        setCodePreview(null);
        setReport([{ key: plugin.meta.id, id: plugin.meta.id, plugin }]);
        await reload();
      });
    }
  };

  const apply = () => run(async () => {
    if (!preview) return;
    const result = await request<{ items: Outcome[] }>("distribution.apply", { token: preview.token, selected, allowDowngrade: downgrade, installOnly });
    token.current = null; setPreview(null); setReport(result.items); setUpdates([]); await reload();
  });

  const checkUpdates = () => void run(async () => {
    setReport([]);
    const result = await request<{ preview: Preview; statuses: UpdateStatus[] }>("updates.check", { ids: plugins.map(p => p.meta.id) });
    replacePreview(result.preview.items.length ? result.preview : null);
    if (!result.preview.items.length) void pluginCommand("distribution.discard", { token: result.preview.token });
    setUpdates(result.statuses);
  });

  const refreshSubscription = (subscription: { id: string; name: string; location: string }) => run(async () => {
    setUpdates([]); setReport([]);
    const nextPreview = await request<Preview>("subscriptions.refresh", { id: subscription.id });
    replacePreview(nextPreview, true);
  });

  return <>
    {host.updates.subscriptions.length > 0 && (
      <section className="hpp-subscriptions" aria-label="插件订阅">
        <div className="hpp-section-title">
          <div className="flex items-center gap-1.5">
            <h2>插件订阅</h2>
            <Tooltip text="管理远程插件订阅源。" />
          </div>
          <span>{host.updates.subscriptions.length} 个列表</span>
        </div>
        {host.updates.subscriptions.map(subscription => (
          <div className="hpp-subscription" key={subscription.id}>
            <div>
              <strong>{subscription.name}</strong>
              <small>{subscription.location}</small>
              {subscription.description && <p>{subscription.description}</p>}
            </div>
            <button disabled={busy} onClick={() => void refreshSubscription(subscription)}>
              刷新订阅 · {subscription.name}
            </button>
            <button disabled={busy} onClick={() => void run(async () => {
              await request("subscriptions.remove", { id: subscription.id });
              await host.refreshUpdates();
            })}>
              取消订阅 · {subscription.name}
            </button>
          </div>
        ))}
      </section>
    )}

    {host.updates.items.length > 0 && (
      <section className="hpp-update-queue" aria-label="插件更新队列">
        <div className="hpp-section-title">
          <div className="flex items-center gap-1.5">
            <h2>插件更新</h2>
            <Tooltip text="检测到可用的插件更新。可在播放结束后自动应用，或在此手动安装。" />
          </div>
        </div>
        {host.updates.items.map(item => (
          <div className="hpp-subscription" key={item.id}>
            <div>
              <strong>{item.name}</strong>
              <small>{item.error?.message || ({ available: "有可用更新", deferred: "等待播放结束后应用", installed: "已更新", current: "已是最新状态", failed: "更新失败" })[item.status]}</small>
            </div>
            {["available", "deferred"].includes(item.status) && (
              <button disabled={busy} onClick={() => void run(async () => {
                await request("updates.install", { ids: [item.id] });
                await host.refreshUpdates();
                await reload();
              })}>
                安装更新 · {item.name}
              </button>
            )}
            <button disabled={busy} onClick={() => void run(async () => {
              await request("updates.dismiss", { id: item.id });
              await host.refreshUpdates();
            })}>
              忽略更新 · {item.name}
            </button>
          </div>
        ))}
      </section>
    )}

    <section className="hpp-import" aria-label="添加插件">
      <div className="hpp-import-header">
        <div className="hpp-import-tabs" role="tablist" aria-label="导入机制">
          <button
            type="button"
            role="tab"
            aria-selected={importMode === "url"}
            className={`hpp-import-tab ${importMode === "url" ? "active" : ""}`}
            onClick={() => switchImportMode("url")}
          >
            在线 URL
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={importMode === "file"}
            className={`hpp-import-tab ${importMode === "file" ? "active" : ""}`}
            onClick={() => switchImportMode("file")}
          >
            本地文件
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={importMode === "code"}
            className={`hpp-import-tab ${importMode === "code" ? "active" : ""}`}
            onClick={() => switchImportMode("code")}
          >
            粘贴代码
          </button>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={app.strictSecurity}
            aria-label="严格安全模式"
            title="严格安全模式：用于插件与媒体请求。自建服务需要访问局域网时可关闭。"
            disabled={!app.strictSecurityReady || app.securityPending}
            onClick={() => void app.setStrictSecurity(!app.strictSecurity).catch(e => setError(pluginError(e)))}
            className={`hpp-switch-pill ${app.strictSecurity ? "is-on" : ""}`}
          >
            <span className="hpp-switch-knob" />
            <span className="hpp-switch-label">严格安全</span>
          </button>
          <Tooltip text="严格安全模式：用于插件与媒体请求。自建服务需要访问局域网时可关闭。" />

          <button className="hpp-check-updates-btn" disabled={busy || !plugins.length} onClick={checkUpdates}>
            检查插件更新
          </button>
        </div>
      </div>

      {importMode === "url" && (
        <form className="hpp-import-panel" onSubmit={e => { e.preventDefault(); handleImport(); }}>
          <input
            type="url"
            aria-label="插件或列表地址"
            placeholder="HTTPS 订阅清单或插件地址"
            value={url}
            onChange={e => setUrl(e.target.value)}
            disabled={busy}
          />
        </form>
      )}

      {importMode === "file" && (
        <div className="hpp-import-panel">
          <input
            type="text"
            aria-label="本地文件路径"
            placeholder="本地 .js 插件或 manifest.json 完整路径"
            value={filePath}
            onChange={e => setFilePath(e.target.value)}
            disabled={busy}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleImport(); } }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(async () => {
              const files = await invoke<string[]>("pick_plugin_files");
              if (files && files.length > 0) {
                setFilePath(files[0]);
                await readLocations(files);
              }
            })}
          >
            选择插件文件
          </button>
        </div>
      )}

      {importMode === "code" && (
        <div className="hpp-import-code-panel">
          <textarea
            aria-label="插件代码"
            placeholder="在此粘贴插件代码（export const meta = ...）"
            spellCheck={false}
            value={code}
            onChange={e => setCode(e.target.value)}
            rows={3}
            disabled={busy}
          />
        </div>
      )}

      <div className="hpp-import-actions">
        <button
          type="button"
          disabled={!canInspect}
          onClick={handleInspect}
        >
          详情
        </button>
        <button
          type="button"
          className="primary"
          disabled={!canImport}
          onClick={handleImport}
        >
          导入
        </button>
      </div>
    </section>

    {error && <div className="hpp-error" role="alert">{error}</div>}

    {preview && (
      <Modal open={true} onClose={() => replacePreview(null)} width={540}>
        <section className="hpp-modal-box" aria-label="插件导入预览">
          <div className="hpp-modal-header">
            <h3>{preview.name}（{preview.items.length} 个条目）</h3>
            <button className="hpp-modal-close" onClick={() => replacePreview(null)} aria-label="关闭">✕</button>
          </div>
          <div className="hpp-modal-body">
            {preview.description && <p className="hpp-muted mb-2 text-xs">{preview.description}</p>}
            {preview.subscriptions?.map(subscription => (
              <button key={subscription.location} className="mb-2 text-xs" disabled={busy || host.updates.subscriptions.some(s => s.location === subscription.location)} onClick={() => void run(async () => {
                await request("subscriptions.save", { token: preview.token, location: subscription.location });
                await host.refreshUpdates();
              })}>
                {host.updates.subscriptions.some(s => s.location === subscription.location) ? "已保存订阅" : `保存订阅 · ${subscription.name}`}
              </button>
            ))}
            <label className="hpp-check mb-2">
              <input type="checkbox" disabled={busy} checked={preview.items.some(i => !i.error) && preview.items.filter(i => !i.error).every(i => selected.includes(i.key))} onChange={e => setSelected(e.target.checked ? preview.items.filter(i => !i.error).map(i => i.key) : [])} />
              全选可安装条目
            </label>
            <div className="hpp-distribution-items">
              {preview.items.map(item => (
                <label key={item.key} className="hpp-distribution-item">
                  <input type="checkbox" aria-label={`选择 ${item.name}`} checked={selected.includes(item.key)} disabled={busy || !!item.error} onChange={e => setSelected(old => e.target.checked ? [...old, item.key] : old.filter(k => k !== item.key))} />
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.id}</small>
                    {item.description && <small>{item.description}</small>}
                    <small>{item.source}</small>
                    {item.error && <small className="hpp-danger">{item.error.message}</small>}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="hpp-modal-footer">
            <button disabled={busy} onClick={() => replacePreview(null)}>关闭</button>
            <button className="primary" disabled={busy || !selected.length} onClick={() => void apply()}>
              {preview.updatesOnly ? "安装所选更新" : "导入所选插件"}（{selected.length}）
            </button>
          </div>
        </section>
      </Modal>
    )}

    {codePreview && (
      <Modal open={true} onClose={() => setCodePreview(null)} width={500}>
        <div className="hpp-modal-box" aria-label="插件代码详情">
          <div className="hpp-modal-header">
            <div className="flex items-center gap-2">
              <h3>插件代码详情</h3>
              {codePreview.name && <span className="text-xs opacity-60">（{codePreview.name}）</span>}
            </div>
            <button className="hpp-modal-close" onClick={() => setCodePreview(null)} aria-label="关闭">✕</button>
          </div>
          <div className="hpp-modal-body">
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">插件名称</span>
              <span className="font-semibold">{codePreview.name || "未声明"}</span>
            </div>
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">插件 ID</span>
              <code>{codePreview.id || "未声明"}</code>
            </div>
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">版本</span>
              <span>{codePreview.version || "未声明"}</span>
            </div>
            {codePreview.description && (
              <div className="hpp-modal-item">
                <span className="hpp-modal-item-name">描述</span>
                <span className="text-xs opacity-75">{codePreview.description}</span>
              </div>
            )}
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">代码规模</span>
              <span className="text-xs opacity-60">{codePreview.lines} 行 · {codePreview.chars} 字符</span>
            </div>
            {!codePreview.id && (
              <p className="hpp-danger text-xs mt-2">提示：未在代码中识别到 export const meta.id，导入可能失败。</p>
            )}
          </div>
          <div className="hpp-modal-footer">
            <button disabled={busy} onClick={() => setCodePreview(null)}>关闭</button>
            <button
              className="primary"
              disabled={busy || !code.trim()}
              onClick={() => {
                setCodePreview(null);
                handleImport();
              }}
            >
              导入代码
            </button>
          </div>
        </div>
      </Modal>
    )}

    {!!report.length && (
      <Modal open={true} onClose={() => setReport([])} width={500}>
        <div className="hpp-modal-box" aria-label="插件导入结果">
          <div className="hpp-modal-header">
            <div className="flex items-center gap-2">
              <h3>导入结果</h3>
              <span className="text-xs opacity-50 font-normal">（{report.length} 项）</span>
            </div>
            <button className="hpp-modal-close" onClick={() => setReport([])} aria-label="关闭">✕</button>
          </div>
          <div className="hpp-modal-body">
            {report.map(item => {
              const isError = item.error || item.plugin?.error;
              const text = item.error ? item.error.message : item.plugin?.error ? `初始化失败：${item.plugin.error.message}` : item.plugin?.enabled ? "已安装并启用" : "已安装，未启用";
              return (
                <div key={item.key} className="hpp-modal-item">
                  <span className="hpp-modal-item-name">{item.plugin?.meta.name || item.id || "文件"}</span>
                  <span className={`hpp-modal-item-status ${isError ? "danger" : "success"}`}>
                    {text}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="hpp-modal-footer">
            <button className="primary" onClick={() => setReport([])}>
              确定
            </button>
          </div>
        </div>
      </Modal>
    )}

    {!!updates.length && (
      <Modal open={true} onClose={() => setUpdates([])} width={500}>
        <div className="hpp-modal-box" aria-label="插件更新检查结果">
          <div className="hpp-modal-header">
            <div className="flex items-center gap-2">
              <h3>更新检查</h3>
              <span className="text-xs opacity-50 font-normal">（{updates.length} 项）</span>
            </div>
            <button className="hpp-modal-close" onClick={() => setUpdates([])} aria-label="关闭">✕</button>
          </div>
          <div className="hpp-modal-body">
            {updates.map((item, i) => {
              const pluginName = plugins.find(p => p.meta.id === item.id)?.meta.name || item.id;
              const isFail = item.status === "failed";
              const isAvail = item.status === "available";
              const msg = item.error?.message || (isAvail ? "有可用更新，可选择安装" : item.status === "noSource" ? "未配置更新地址" : "已是最新状态");
              return (
                <div key={item.id + i} className="hpp-modal-item">
                  <span className="hpp-modal-item-name">{pluginName}</span>
                  <span className={`hpp-modal-item-status ${isFail ? "danger" : isAvail ? "success" : "muted"}`}>
                    {msg}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="hpp-modal-footer">
            <button className="primary" onClick={() => setUpdates([])}>
              确定
            </button>
          </div>
        </div>
      </Modal>
    )}
  </>;
}
