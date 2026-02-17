"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X,
  Key,
  Cpu,
  Plus,
  Trash2,
  Check,
  AlertCircle,
  ExternalLink,
  User,
  Upload,
  Shield,
  Loader2,
} from "lucide-react";
import { DEFAULT_MODELS, DEFAULT_SETTINGS, type Settings } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  onSave: (settings: Settings) => void;
  gogStatus: { installed: boolean; version?: string; accounts?: string[] } | null;
  onGogStatusRefresh?: () => void;
}

export default function SettingsPanel({
  open,
  onClose,
  settings,
  onSave,
  gogStatus,
  onGogStatusRefresh,
}: Props) {
  const [local, setLocal] = useState<Settings>(settings);
  const [newModel, setNewModel] = useState("");
  const [saved, setSaved] = useState(false);

  // Auth state
  const [hasCredentials, setHasCredentials] = useState<boolean | null>(null);
  const [credFileName, setCredFileName] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authMessage, setAuthMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocal(settings);
  }, [settings, open]);

  // Check if credentials are already stored when panel opens
  const checkCredentials = useCallback(async () => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });
      const data = await res.json();
      setHasCredentials(data.hasCredentials ?? false);
    } catch {
      setHasCredentials(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      checkCredentials();
      setAuthMessage(null);
    }
  }, [open, checkCredentials]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAuthLoading(true);
    setAuthMessage(null);

    try {
      const text = await file.text();
      setCredFileName(file.name);

      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "store-credentials", credentials: text }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setHasCredentials(true);
      setAuthMessage({ type: "success", text: "Credentials stored. Now enter your Google email and click Authorize." });
    } catch (err) {
      setAuthMessage({ type: "error", text: (err as Error).message });
    } finally {
      setAuthLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAuthorize = async () => {
    if (!authEmail.includes("@")) {
      setAuthMessage({ type: "error", text: "Enter a valid Google email address." });
      return;
    }

    setAuthLoading(true);
    setAuthMessage({ type: "success", text: "Opening browser for Google authorization... Complete the sign-in there." });

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "authorize", email: authEmail }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setAuthMessage({ type: "success", text: `Authorized ${authEmail} successfully!` });
      setLocal({ ...local, gogAccount: authEmail });

      // Refresh gog status to show the new account
      onGogStatusRefresh?.();
    } catch (err) {
      setAuthMessage({ type: "error", text: (err as Error).message });
    } finally {
      setAuthLoading(false);
    }
  };

  if (!open) return null;

  const handleSave = () => {
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addCustomModel = () => {
    const trimmed = newModel.trim();
    if (trimmed && !local.customModels.includes(trimmed)) {
      setLocal({
        ...local,
        customModels: [...local.customModels, trimmed],
      });
      setNewModel("");
    }
  };

  const removeCustomModel = (model: string) => {
    setLocal({
      ...local,
      customModels: local.customModels.filter((m) => m !== model),
      model: local.model === model ? DEFAULT_SETTINGS.model : local.model,
    });
  };

  const allModels = [
    ...DEFAULT_MODELS,
    ...local.customModels.map((id) => ({ id, label: id })),
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-fade-in shadow-2xl">
        <div className="sticky top-0 bg-bg-secondary border-b border-border px-6 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-muted hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* gog Status */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Terminal size={15} />
              gog CLI Status
            </h3>
            <div className={`flex items-start gap-3 p-3 rounded-xl border ${
              gogStatus?.installed
                ? "bg-success/5 border-success/20"
                : "bg-warning/5 border-warning/20"
            }`}>
              {gogStatus?.installed ? (
                <Check size={16} className="text-success mt-0.5" />
              ) : (
                <AlertCircle size={16} className="text-warning mt-0.5" />
              )}
              <div className="text-sm">
                {gogStatus?.installed ? (
                  <>
                    <p className="text-success font-medium">Installed {gogStatus.version ? `(${gogStatus.version})` : ""}</p>
                    {gogStatus.accounts && gogStatus.accounts.length > 0 && (
                      <p className="text-text-secondary mt-1">
                        Accounts: {gogStatus.accounts.join(", ")}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-warning font-medium">Not installed</p>
                    <p className="text-text-muted mt-1">
                      Install with:{" "}
                      <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-xs">
                        brew install steipete/tap/gogcli
                      </code>
                    </p>
                    <a
                      href="https://gogcli.sh"
                      target="_blank"
                      rel="noopener"
                      className="text-accent hover:text-accent-hover inline-flex items-center gap-1 mt-1"
                    >
                      Learn more <ExternalLink size={12} />
                    </a>
                  </>
                )}
              </div>
            </div>
          </section>

          {/* Google Authorization */}
          <section className="space-y-3">
            <h3 className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Shield size={15} />
              Google Authorization
            </h3>

            {gogStatus?.accounts && gogStatus.accounts.length > 0 ? (
              <div className="p-3 rounded-xl border bg-success/5 border-success/20">
                <div className="flex items-center gap-2 text-sm text-success font-medium">
                  <Check size={14} />
                  Authorized
                </div>
                <p className="text-xs text-text-secondary mt-1">
                  {gogStatus.accounts.join(", ")}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Step 1: Upload credentials */}
                <div className="space-y-2">
                  <p className="text-xs text-text-muted">
                    <strong className="text-text-secondary">Step 1:</strong> Upload the <code className="bg-bg-tertiary px-1 py-0.5 rounded text-[11px]">client_secret_...json</code> file from Google Cloud Console.
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={authLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-bg-tertiary text-sm text-text-secondary hover:bg-bg-hover hover:text-text transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {authLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                    {credFileName || (hasCredentials ? "Credentials stored — re-upload to replace" : "Upload credentials JSON")}
                  </button>
                </div>

                {/* Step 2: Authorize */}
                <div className="space-y-2">
                  <p className="text-xs text-text-muted">
                    <strong className="text-text-secondary">Step 2:</strong> Enter your Google email and authorize.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(e) => setAuthEmail(e.target.value)}
                      placeholder="you@gmail.com"
                      className="flex-1 bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
                    />
                    <button
                      onClick={handleAuthorize}
                      disabled={authLoading || !hasCredentials || !authEmail.includes("@")}
                      className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
                    >
                      {authLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                      Authorize
                    </button>
                  </div>
                </div>

                {/* Status message */}
                {authMessage && (
                  <div className={`p-3 rounded-xl border text-sm ${
                    authMessage.type === "success"
                      ? "bg-success/5 border-success/20 text-success"
                      : "bg-danger/5 border-danger/20 text-danger"
                  }`}>
                    {authMessage.text}
                  </div>
                )}

                <p className="text-[11px] text-text-muted">
                  Need a credentials file?{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener"
                    className="text-accent hover:text-accent-hover inline-flex items-center gap-0.5"
                  >
                    Google Cloud Console <ExternalLink size={10} />
                  </a>
                  {" "}→ Create OAuth client ID → Desktop app → Download JSON
                </p>
              </div>
            )}
          </section>

          {/* gog Account */}
          <section className="space-y-3">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <User size={15} />
              Google Account
            </label>
            <input
              type="email"
              value={local.gogAccount}
              onChange={(e) => setLocal({ ...local, gogAccount: e.target.value })}
              placeholder="you@gmail.com"
              className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
            />
            <p className="text-xs text-text-muted">
              The Google account to use with gog commands.
            </p>
          </section>

          {/* API Key */}
          <section className="space-y-3">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Key size={15} />
              Anthropic API Key
            </label>
            <input
              type="password"
              value={local.apiKey}
              onChange={(e) => setLocal({ ...local, apiKey: e.target.value })}
              placeholder="sk-ant-..."
              className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
            />
            <p className="text-xs text-text-muted">
              Your key is stored locally in your browser and sent directly to Anthropic.{" "}
              <a
                href="https://console.anthropic.com/settings/keys"
                target="_blank"
                rel="noopener"
                className="text-accent hover:text-accent-hover"
              >
                Get an API key
              </a>
            </p>
          </section>

          {/* Model Selection */}
          <section className="space-y-3">
            <label className="text-sm font-medium text-text-secondary flex items-center gap-2">
              <Cpu size={15} />
              Model
            </label>
            <select
              value={local.model}
              onChange={(e) => setLocal({ ...local, model: e.target.value })}
              className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all appearance-none cursor-pointer"
            >
              {allModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </section>

          {/* Custom Models */}
          <section className="space-y-3">
            <label className="text-sm font-medium text-text-secondary">
              Custom Models
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newModel}
                onChange={(e) => setNewModel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCustomModel()}
                placeholder="claude-3-haiku-20240307"
                className="flex-1 bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm font-mono placeholder:text-text-muted focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 transition-all"
              />
              <button
                onClick={addCustomModel}
                disabled={!newModel.trim()}
                className="px-3 py-2 rounded-xl bg-accent/15 border border-accent/25 text-accent hover:bg-accent/25 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Plus size={18} />
              </button>
            </div>
            {local.customModels.length > 0 && (
              <div className="space-y-1.5">
                {local.customModels.map((m) => (
                  <div
                    key={m}
                    className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-tertiary border border-border text-sm"
                  >
                    <code className="text-text-secondary text-xs">{m}</code>
                    <button
                      onClick={() => removeCustomModel(m)}
                      className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-danger transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="sticky bottom-0 bg-bg-secondary border-t border-border px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm text-text-secondary hover:text-text hover:bg-bg-hover transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className={`px-5 py-2 rounded-xl text-sm font-medium transition-all ${
              saved
                ? "bg-success/20 text-success border border-success/30"
                : "bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20"
            }`}
          >
            {saved ? (
              <span className="flex items-center gap-1.5">
                <Check size={14} /> Saved
              </span>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function Terminal({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <polyline points="4 17 10 11 4 5" />
      <line x1="12" y1="19" x2="20" y2="19" />
    </svg>
  );
}
