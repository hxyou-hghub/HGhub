import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { pluginCommand, pluginError, type InstalledPlugin } from "./client";
import type { PluginFailure } from "./protocol";
import { usePluginRequests } from "./usePluginRequests";
import { useHost } from "./HostContext";
import { Tooltip, Modal } from "../components/ui";
import { useStore } from "../store";
import { IClose, IDownload, ILink, ICheck, IRefresh, IFileText, IInfo } from "../icons";

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

function getItemDisplay(item: ImportItem) {
  let title = item.name;
  let subtitle = "";

  if (item.name.startsWith("http://") || item.name.startsWith("https://")) {
    try {
      const u = new URL(item.name);
      const segments = u.pathname.split("/").filter(Boolean);
      title = segments.length > 0 ? segments[segments.length - 1] : u.hostname;
      subtitle = item.name;
    } catch {
      title = item.name;
    }
  } else if (item.name.includes("/") || item.name.includes("\\")) {
    const segments = item.name.split(/[/\\]/).filter(Boolean);
    title = segments.length > 0 ? segments[segments.length - 1] : item.name;
    subtitle = item.name;
  } else {
    title = item.name;
    if (item.source && item.source !== item.name) {
      subtitle = item.source;
    } else if (item.id && item.id !== item.name) {
      subtitle = item.id;
    }
  }

  return { title, subtitle };
}

function Checkbox({
  checked,
  disabled,
  onChange,
  "aria-label": ariaLabel,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={e => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={`w-4 h-4 rounded-[5px] flex items-center justify-center transition-all shrink-0 select-none ${
        disabled
          ? "border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] opacity-35 cursor-not-allowed"
          : checked
          ? "bg-primary border border-primary text-on-primary shadow-xs cursor-pointer"
          : "border border-black/25 dark:border-white/30 bg-s1 hover:border-primary cursor-pointer"
      }`}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
          <path d="M1.5 4L3.8 6.3L8.5 1.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

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
        <div className="hpp-import-header-tools flex items-center gap-2.5">
          <button
            type="button"
            role="switch"
            aria-checked={!app.strictSecurity}
            aria-label="调试模式"
            title="调试模式：开启后允许插件与媒体请求访问局域网与本机，便于调试自建服务。开发态默认开启，生产态默认关闭。"
            disabled={!app.strictSecurityReady || app.securityPending}
            onClick={() => void app.setStrictSecurity(!app.strictSecurity).catch(e => setError(pluginError(e)))}
            className={`hpp-switch-pill ${!app.strictSecurity ? "is-on" : ""}`}
          >
            <span className="hpp-switch-knob" />
            <span className="hpp-switch-label">调试模式</span>
          </button>

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

    {preview && (() => {
      const installableItems = preview.items.filter(i => !i.error);
      const installableCount = installableItems.length;
      const allInstallableSelected = installableCount > 0 && installableItems.every(i => selected.includes(i.key));

      return (
        <Modal open={true} onClose={() => replacePreview(null)} width={540}>
          <div className="flex flex-col w-full text-on" aria-label="插件导入预览">
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-black/[0.06] dark:border-white/[0.08]">
              <div className="flex items-center gap-2.5 min-w-0">
                <h3 className="text-base font-semibold text-on tracking-tight">{preview.name}</h3>
                <span className="text-[11.5px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-mut font-normal shrink-0">
                  {preview.items.length} 个条目
                </span>
              </div>
              <button
                type="button"
                onClick={() => replacePreview(null)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-mut hover:text-on hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="关闭"
              >
                <IClose size={14} />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 flex flex-col gap-3.5 overflow-y-auto max-h-[62vh]">
              {preview.subscriptions?.map(subscription => {
                const isSaved = host.updates.subscriptions.some(s => s.location === subscription.location);
                return (
                  <div key={subscription.location} className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-black/[0.025] dark:bg-white/[0.03] border border-black/[0.05] dark:border-white/[0.06]">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <ILink size={13} className="text-primary shrink-0" />
                      <span className="truncate text-xs text-mut">
                        订阅源：<strong className="text-on font-medium">{subscription.name}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline font-medium shrink-0 disabled:opacity-50 cursor-pointer"
                      disabled={busy || isSaved}
                      onClick={() => void run(async () => {
                        await request("subscriptions.save", { token: preview.token, location: subscription.location });
                        await host.refreshUpdates();
                      })}
                    >
                      {isSaved ? "已保存" : "保存订阅"}
                    </button>
                  </div>
                );
              })}

              {/* Toolbar */}
              <div className="flex items-center justify-between px-0.5 text-xs text-mut">
                <label className="flex items-center gap-2.5 cursor-pointer select-none text-on font-medium hover:opacity-85">
                  <Checkbox
                    checked={allInstallableSelected}
                    disabled={busy || installableCount === 0}
                    onChange={checked => setSelected(checked ? installableItems.map(i => i.key) : [])}
                    aria-label="全选可安装条目"
                  />
                  <span>全选可安装条目</span>
                </label>
                <span className="text-[11.5px] text-mut">
                  {installableCount > 0 ? `已选 ${selected.length} / ${installableCount}` : "暂无可安装条目"}
                </span>
              </div>

              {/* Grouped Card Container */}
              <div className="rounded-xl border border-black/[0.07] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.02] overflow-hidden divide-y divide-black/[0.06] dark:divide-white/[0.06]">
                {preview.items.map(item => {
                  const isSelected = selected.includes(item.key);
                  const hasError = !!item.error;
                  const { title: itemTitle, subtitle: itemSubtitle } = getItemDisplay(item);

                  return (
                    <div
                      key={item.key}
                      className={`flex items-start gap-3.5 px-4 py-3.5 transition-colors select-none ${
                        hasError ? "bg-red-500/[0.015]" : "hover:bg-black/[0.025] dark:hover:bg-white/[0.035] cursor-pointer"
                      } ${isSelected ? "bg-primary/[0.05]" : ""}`}
                      onClick={() => {
                        if (!hasError && !busy) {
                          setSelected(old => isSelected ? old.filter(k => k !== item.key) : [...old, item.key]);
                        }
                      }}
                    >
                      <div className="pt-0.5 shrink-0">
                        <Checkbox
                          checked={isSelected}
                          disabled={busy || hasError}
                          onChange={checked => setSelected(old => checked ? [...old, item.key] : old.filter(k => k !== item.key))}
                          aria-label={`选择 ${itemTitle}`}
                        />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-[13.5px] text-on tracking-tight truncate">
                              {itemTitle}
                            </span>
                            {item.version && (
                              <span className="text-[10.5px] px-1.5 py-0.5 rounded font-mono bg-black/[0.04] dark:bg-white/[0.06] text-mut shrink-0">
                                v{item.version}
                              </span>
                            )}
                          </div>

                          {hasError ? (
                            <span className="text-[11px] font-medium text-red-500 dark:text-red-400 bg-red-500/10 dark:bg-red-500/15 px-2 py-0.5 rounded-full shrink-0">
                              不可用
                            </span>
                          ) : item.installedVersion ? (
                            <span className="text-[11px] font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full shrink-0">
                              有更新
                            </span>
                          ) : (
                            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full shrink-0">
                              可安装
                            </span>
                          )}
                        </div>

                        {itemSubtitle && (
                          <p className="text-[11.5px] text-mut/80 font-mono mt-0.5 truncate" title={itemSubtitle}>
                            {itemSubtitle}
                          </p>
                        )}

                        {item.description && (
                          <p className="text-xs text-mut mt-1 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        )}

                        {item.error && (
                          <div className="flex items-start gap-1.5 mt-2 text-xs text-red-500 dark:text-red-400 leading-relaxed">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-1.5" />
                            <span className="break-all">{item.error.message}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-center gap-3 px-6 py-3.5 border-t border-black/[0.06] dark:border-white/[0.08] bg-black/[0.015] dark:bg-white/[0.015]">
              <button
                type="button"
                disabled={busy}
                onClick={() => replacePreview(null)}
                className="px-5 py-2 text-xs font-medium text-mut hover:text-on rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                关闭
              </button>
              <button
                type="button"
                className="primary px-6 py-2 text-xs font-semibold rounded-lg bg-primary text-on-primary hover:opacity-90 active:scale-98 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs cursor-pointer flex items-center gap-1.5"
                disabled={busy || !selected.length}
                onClick={() => void apply()}
              >
                <span>{preview.updatesOnly ? "安装所选更新" : "导入所选插件"}</span>
                {selected.length > 0 && <span className="opacity-90 font-mono">({selected.length})</span>}
              </button>
            </div>
          </div>
        </Modal>
      );
    })()}

    {codePreview && (
      <Modal open={true} onClose={() => setCodePreview(null)} width={480}>
        <div className="hpp-modal-box" aria-label="插件代码详情">
          <div className="hpp-modal-header">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-on truncate">代码详情</h3>
              {codePreview.name && <span className="text-xs text-mut truncate">（{codePreview.name}）</span>}
            </div>
            <button className="hpp-modal-close" onClick={() => setCodePreview(null)} aria-label="关闭">
              <IClose size={14} />
            </button>
          </div>
          <div className="hpp-modal-body">
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">插件名称</span>
              <span className="font-medium text-xs">{codePreview.name || "未声明"}</span>
            </div>
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">插件 ID</span>
              <code className="text-xs">{codePreview.id || "未声明"}</code>
            </div>
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">版本</span>
              <span className="text-xs">{codePreview.version || "未声明"}</span>
            </div>
            {codePreview.description && (
              <div className="hpp-modal-item">
                <span className="hpp-modal-item-name">描述</span>
                <span className="text-xs text-mut line-clamp-2">{codePreview.description}</span>
              </div>
            )}
            <div className="hpp-modal-item">
              <span className="hpp-modal-item-name">规模</span>
              <span className="text-xs text-mut">{codePreview.lines} 行 · {codePreview.chars} 字符</span>
            </div>
            {!codePreview.id && (
              <p className="text-xs text-red-500 mt-1">提示：未在代码中识别到 export const meta.id，导入可能失败。</p>
            )}
          </div>
          <div className="hpp-modal-footer justify-center">
            <button type="button" disabled={busy} onClick={() => setCodePreview(null)}>取消</button>
            <button
              type="button"
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
      <Modal open={true} onClose={() => setReport([])} width={480}>
        <div className="hpp-modal-box" aria-label="插件导入结果">
          <div className="hpp-modal-header">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-on truncate">导入结果</h3>
              <span className="text-xs text-mut font-normal">（{report.length}）</span>
            </div>
            <button className="hpp-modal-close" onClick={() => setReport([])} aria-label="关闭">
              <IClose size={14} />
            </button>
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
          <div className="hpp-modal-footer justify-center">
            <button type="button" className="primary" onClick={() => setReport([])}>
              完成
            </button>
          </div>
        </div>
      </Modal>
    )}

    {!!updates.length && (
      <Modal open={true} onClose={() => setUpdates([])} width={480}>
        <div className="hpp-modal-box" aria-label="插件更新检查结果">
          <div className="hpp-modal-header">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-on truncate">更新检查</h3>
              <span className="text-xs text-mut font-normal">（{updates.length}）</span>
            </div>
            <button className="hpp-modal-close" onClick={() => setUpdates([])} aria-label="关闭">
              <IClose size={14} />
            </button>
          </div>
          <div className="hpp-modal-body">
            {updates.map((item, i) => {
              const pluginName = plugins.find(p => p.meta.id === item.id)?.meta.name || item.id;
              const isFail = item.status === "failed";
              const isAvail = item.status === "available";
              const msg = item.error?.message || (isAvail ? "有可用更新" : item.status === "noSource" ? "未配置更新地址" : "已是最新");
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
          <div className="hpp-modal-footer justify-center">
            <button type="button" className="primary" onClick={() => setUpdates([])}>
              完成
            </button>
          </div>
        </div>
      </Modal>
    )}
  </>;
}
