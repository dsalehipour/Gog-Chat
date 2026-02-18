"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  PenLine,
  RefreshCw,
  Loader2,
  Send,
  SkipForward,
  Edit3,
  Check,
  Sparkles,
} from "lucide-react";
import type { EmailStyleProfile } from "@/lib/types";

interface DraftEmail {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
}

interface DraftState {
  emailId: string;
  draft: string;
  loading: boolean;
  editing: boolean;
  sent: boolean;
  skipped: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  model: string;
  styleProfile: EmailStyleProfile | null;
  onStyleUpdate: (profile: EmailStyleProfile) => void;
}

export default function DraftQueuePanel({
  open,
  onClose,
  apiKey,
  model,
  styleProfile,
  onStyleUpdate,
}: Props) {
  const [emails, setEmails] = useState<DraftEmail[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [analyzingStyle, setAnalyzingStyle] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoadingEmails(true);
    try {
      const res = await fetch("/api/drafts");
      if (res.ok) {
        const data = await res.json();
        setEmails(data.emails || []);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingEmails(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchEmails();
    } else {
      setEmails([]);
      setDrafts({});
    }
  }, [open, fetchEmails]);

  if (!open) return null;

  async function analyzeStyle() {
    if (!apiKey) return;
    setAnalyzingStyle(true);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze-style", apiKey, model }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) onStyleUpdate(data.profile);
      }
    } catch {
      // silently fail
    } finally {
      setAnalyzingStyle(false);
    }
  }

  async function generateDraft(email: DraftEmail) {
    if (!apiKey) return;
    setDrafts((prev) => ({
      ...prev,
      [email.id]: {
        emailId: email.id,
        draft: "",
        loading: true,
        editing: false,
        sent: false,
        skipped: false,
      },
    }));

    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-draft",
          apiKey,
          model,
          emailId: email.id,
          styleProfile,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts((prev) => ({
          ...prev,
          [email.id]: {
            ...prev[email.id],
            draft: data.draft || "",
            loading: false,
          },
        }));
      }
    } catch {
      setDrafts((prev) => ({
        ...prev,
        [email.id]: { ...prev[email.id], draft: "Failed to generate draft.", loading: false },
      }));
    }
  }

  async function sendDraft(email: DraftEmail) {
    const draftState = drafts[email.id];
    if (!draftState?.draft) return;

    setDrafts((prev) => ({
      ...prev,
      [email.id]: { ...prev[email.id], loading: true },
    }));

    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-draft",
          emailId: email.id,
          threadId: email.threadId,
          draftText: draftState.draft,
          subject: email.subject,
          to: email.from,
        }),
      });
      if (res.ok) {
        setDrafts((prev) => ({
          ...prev,
          [email.id]: { ...prev[email.id], sent: true, loading: false },
        }));
      }
    } catch {
      setDrafts((prev) => ({
        ...prev,
        [email.id]: { ...prev[email.id], loading: false },
      }));
    }
  }

  const activeEmails = emails.filter(
    (e) => !drafts[e.id]?.sent && !drafts[e.id]?.skipped,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <PenLine size={18} className="text-accent" />
            <h2 className="text-lg font-semibold">Email Drafts</h2>
            {activeEmails.length > 0 && (
              <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium">
                {activeEmails.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={analyzeStyle}
              disabled={analyzingStyle || !apiKey}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border text-xs text-text-secondary hover:bg-bg-hover disabled:opacity-40 cursor-pointer transition-all"
              title="Analyze your email writing style"
            >
              {analyzingStyle ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Sparkles size={12} />
              )}
              {styleProfile ? "Refresh Style" : "Learn My Style"}
            </button>
            <button
              onClick={fetchEmails}
              disabled={loadingEmails}
              className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted cursor-pointer transition-all"
            >
              {loadingEmails ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Style indicator */}
        {styleProfile && (
          <div className="px-6 py-2 border-b border-border bg-accent/5">
            <p className="text-[11px] text-accent">
              Style: {styleProfile.tone}, {styleProfile.formalityLevel}
              {styleProfile.signOffPatterns?.length > 0 &&
                ` (signs off with "${styleProfile.signOffPatterns[0]}")`}
            </p>
          </div>
        )}

        {/* Email list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loadingEmails && emails.length === 0 && (
            <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
              <Loader2 size={16} className="animate-spin" />
              Loading emails...
            </div>
          )}

          {!loadingEmails && emails.length === 0 && (
            <div className="text-center py-8">
              <PenLine size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">No unread emails to draft replies for</p>
            </div>
          )}

          {activeEmails.map((email) => {
            const ds = drafts[email.id];
            return (
              <div
                key={email.id}
                className="rounded-xl border border-border p-4 space-y-3"
              >
                {/* Email header */}
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-text truncate flex-1">
                      {email.subject}
                    </p>
                    {email.date && (
                      <span className="text-[10px] text-text-muted ml-2 shrink-0">
                        {email.date}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-text-muted">{email.from}</p>
                  {email.snippet && (
                    <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                      {email.snippet}
                    </p>
                  )}
                </div>

                {/* Draft area */}
                {!ds ? (
                  <button
                    onClick={() => generateDraft(email)}
                    disabled={!apiKey}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 disabled:opacity-40 cursor-pointer transition-all"
                  >
                    <PenLine size={14} />
                    Generate Draft Reply
                  </button>
                ) : ds.loading ? (
                  <div className="flex items-center gap-2 text-text-muted text-sm py-2">
                    <Loader2 size={14} className="animate-spin" />
                    {ds.draft ? "Sending..." : "Generating draft..."}
                  </div>
                ) : ds.sent ? (
                  <div className="flex items-center gap-2 text-success text-sm py-2">
                    <Check size={14} />
                    Sent
                  </div>
                ) : (
                  <div className="space-y-2">
                    {ds.editing ? (
                      <textarea
                        value={ds.draft}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [email.id]: { ...prev[email.id], draft: e.target.value },
                          }))
                        }
                        rows={4}
                        className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-accent transition-all"
                      />
                    ) : (
                      <div className="bg-bg-tertiary rounded-xl px-4 py-3 text-sm text-text whitespace-pre-wrap">
                        {ds.draft}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendDraft(email)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover cursor-pointer transition-all"
                      >
                        <Send size={12} />
                        Send
                      </button>
                      <button
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [email.id]: {
                              ...prev[email.id],
                              editing: !prev[email.id].editing,
                            },
                          }))
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border text-xs text-text-secondary hover:bg-bg-hover cursor-pointer transition-all"
                      >
                        <Edit3 size={12} />
                        {ds.editing ? "Preview" : "Edit"}
                      </button>
                      <button
                        onClick={() => generateDraft(email)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border text-xs text-text-secondary hover:bg-bg-hover cursor-pointer transition-all"
                      >
                        <RefreshCw size={12} />
                        Regenerate
                      </button>
                      <button
                        onClick={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [email.id]: { ...prev[email.id], skipped: true },
                          }))
                        }
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:bg-bg-hover cursor-pointer transition-all ml-auto"
                      >
                        <SkipForward size={12} />
                        Skip
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
