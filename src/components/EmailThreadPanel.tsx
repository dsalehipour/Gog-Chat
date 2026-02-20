"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Loader2,
  Send,
  Sparkles,
  ShieldAlert,
  PenLine,
  RefreshCw,
  Archive,
  AlarmClock,
  Calendar,
} from "lucide-react";
import type { EmailStyleProfile, Settings as AppSettings } from "@/lib/types";

interface ThreadMessage {
  id: string;
  from: string;
  to: string;
  cc: string;
  date: string;
  snippet: string;
  body: string;
  labelIds: string[];
}

interface Props {
  threadId: string;
  onClose: () => void;
  onOpenSettings: () => void;
  settings: AppSettings;
  emailStyle: EmailStyleProfile | null;
  onThreadAction?: (threadId: string, action: "archive" | "spam" | "snooze") => void;
}

function parseSender(raw: string): { name: string; email: string } {
  const m = raw.match(/^"?(.+?)"?\s*<([^>]+)>$/);
  if (m) return { name: m[1].replace(/"/g, "").trim(), email: m[2] };
  return { name: "", email: raw.trim() };
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    }
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch {
    return dateStr;
  }
}

export default function EmailThreadPanel({
  threadId,
  onClose,
  onOpenSettings,
  settings,
  emailStyle,
  onThreadAction,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [messages, setMessages] = useState<ThreadMessage[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [draftText, setDraftText] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`gc_draft_${threadId}`) || "";
  });
  const [draftLoading, setDraftLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [spamConfirm, setSpamConfirm] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [snoozeCustom, setSnoozeCustom] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState("");
  const [snoozeTime, setSnoozeTime] = useState("08:00");
  const scrollRef = useRef<HTMLDivElement>(null);
  const snoozeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const fetchThread = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/email/preview?threadId=${threadId}&full=true`);
      if (res.ok) {
        const data = await res.json();
        setSubject(data.subject || "");
        setMessages(data.messages || []);
        if (data.messages?.length > 0) {
          setExpandedIds(new Set([data.messages[data.messages.length - 1].id]));
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [threadId]);

  useEffect(() => {
    fetchThread();
    setDraftText(localStorage.getItem(`gc_draft_${threadId}`) || "");
    setSent(false);
    setSpamConfirm(false);
  }, [fetchThread, threadId]);

  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [loading]);

  useEffect(() => {
    if (draftText) {
      localStorage.setItem(`gc_draft_${threadId}`, draftText);
    } else {
      localStorage.removeItem(`gc_draft_${threadId}`);
    }
  }, [draftText, threadId]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAutoDraft = async () => {
    if (!settings.apiKey || messages.length === 0) return;
    setDraftLoading(true);
    try {
      const lastMsg = messages[messages.length - 1];
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate-draft",
          apiKey: settings.apiKey,
          model: settings.model,
          emailId: lastMsg.id,
          styleProfile: emailStyle || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDraftText(data.draft || "");
      }
    } catch { /* ignore */ }
    finally { setDraftLoading(false); }
  };

  const handleSend = async () => {
    if (!draftText.trim() || messages.length === 0) return;
    setSending(true);
    try {
      const lastMsg = messages[messages.length - 1];
      const sender = parseSender(lastMsg.from);
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send-draft",
          emailId: lastMsg.id,
          threadId,
          draftText: draftText.trim(),
          subject,
          to: sender.email,
        }),
      });
      if (res.ok) {
        setSent(true);
        setDraftText("");
        localStorage.removeItem(`gc_draft_${threadId}`);
      }
    } catch { /* ignore */ }
    finally { setSending(false); }
  };

  const handleReportSpam = async () => {
    try {
      await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "spam", threadId }),
      });
      onThreadAction?.(threadId, "spam");
      onClose();
    } catch { /* ignore */ }
  };

  const handleArchive = async () => {
    try {
      await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", threadId }),
      });
      onThreadAction?.(threadId, "archive");
      onClose();
    } catch { /* ignore */ }
  };

  const handleSnooze = async (wakeAt: number) => {
    setSnoozeOpen(false);
    try {
      await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", threadId }),
      });
      const snoozed = JSON.parse(localStorage.getItem("gc_snoozed_emails") || "[]");
      snoozed.push({ threadId, wakeAt, subject, snoozedAt: Date.now() });
      localStorage.setItem("gc_snoozed_emails", JSON.stringify(snoozed));
      onThreadAction?.(threadId, "snooze");
      onClose();
    } catch { /* ignore */ }
  };

  function getSnoozeOptions(): { label: string; time: number }[] {
    const now = new Date();
    const later = new Date(now);
    later.setHours(later.getHours() + 3);
    const tomorrow8am = new Date(now);
    tomorrow8am.setDate(tomorrow8am.getDate() + 1);
    tomorrow8am.setHours(8, 0, 0, 0);
    const nextMon = new Date(now);
    nextMon.setDate(nextMon.getDate() + ((8 - nextMon.getDay()) % 7 || 7));
    nextMon.setHours(8, 0, 0, 0);
    const opts: { label: string; time: number }[] = [];
    if (later.getDate() === now.getDate()) {
      opts.push({ label: `Later today · ${later.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`, time: later.getTime() });
    }
    opts.push({ label: `Tomorrow · ${tomorrow8am.toLocaleDateString("en-US", { weekday: "short" })} 8:00 AM`, time: tomorrow8am.getTime() });
    if (nextMon.getTime() > tomorrow8am.getTime() + 86400000) {
      opts.push({ label: `Next week · Mon 8:00 AM`, time: nextMon.getTime() });
    }
    return opts;
  }

  // Close snooze dropdown on outside click
  useEffect(() => {
    if (!snoozeOpen) return;
    const handler = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [snoozeOpen]);

  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${threadId}`;

  return (
    <div className="h-full flex flex-col border-l border-border bg-bg-secondary">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0 space-y-2">
        <div className="flex items-start gap-2">
          <h3 className="flex-1 min-w-0 text-sm font-semibold text-text">{subject || "Loading..."}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-muted hover:text-text cursor-pointer shrink-0"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1 flex-wrap relative">
          <button
            onClick={handleArchive}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
            title="Archive"
          >
            <Archive size={12} />
            Archive
          </button>
          <div className="relative" ref={snoozeRef}>
            <button
              onClick={() => { setSnoozeCustom(false); setSnoozeOpen(!snoozeOpen); }}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
              title="Snooze"
            >
              <AlarmClock size={12} />
              Snooze
            </button>
            {snoozeOpen && (
              <div className="absolute left-0 top-full mt-1 z-50 bg-bg-secondary border border-border rounded-xl shadow-xl py-1 min-w-[220px]">
                <p className="px-3 py-1.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">Snooze until</p>
                {getSnoozeOptions().map((opt) => (
                  <button
                    key={opt.time}
                    onClick={() => handleSnooze(opt.time)}
                    className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <AlarmClock size={11} className="text-text-muted shrink-0" />
                    {opt.label}
                  </button>
                ))}
                <div className="border-t border-border mt-1 pt-1">
                  {!snoozeCustom ? (
                    <button
                      onClick={() => {
                        const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
                        setSnoozeDate(tmrw.toISOString().split("T")[0]);
                        setSnoozeTime("08:00");
                        setSnoozeCustom(true);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors cursor-pointer flex items-center gap-2"
                    >
                      <Calendar size={11} className="text-text-muted shrink-0" />
                      Pick date &amp; time
                    </button>
                  ) : (
                    <div className="px-3 py-2 space-y-2">
                      <div className="flex gap-1.5">
                        <input type="date" value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} className="flex-1 bg-bg-tertiary border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent" />
                        <input type="time" value={snoozeTime} onChange={(e) => setSnoozeTime(e.target.value)} className="w-20 bg-bg-tertiary border border-border rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-accent" />
                      </div>
                      <button
                        onClick={() => {
                          if (!snoozeDate) return;
                          const wakeAt = new Date(`${snoozeDate}T${snoozeTime || "08:00"}`).getTime();
                          if (wakeAt > Date.now()) handleSnooze(wakeAt);
                        }}
                        disabled={!snoozeDate}
                        className="w-full px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-40 cursor-pointer transition-all"
                      >
                        Set snooze
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          {!spamConfirm ? (
            <button
              onClick={() => setSpamConfirm(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
              title="Report spam"
            >
              <ShieldAlert size={12} />
              Spam
            </button>
          ) : (
            <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-danger/10 border border-danger/20">
              <ShieldAlert size={11} className="text-danger shrink-0" />
              <span className="text-[11px] text-danger whitespace-nowrap">Mark as spam?</span>
              <button
                onClick={handleReportSpam}
                className="px-2 py-0.5 rounded bg-danger text-white text-[11px] font-medium hover:bg-red-500 transition-colors cursor-pointer"
              >
                Yes
              </button>
              <button
                onClick={() => setSpamConfirm(false)}
                className="px-2 py-0.5 rounded bg-bg-tertiary text-text-muted text-[11px] hover:bg-bg-hover transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
          <a
            href={gmailUrl}
            target="_blank"
            rel="noopener"
            className="ml-auto text-[10px] text-accent hover:text-accent-hover inline-flex items-center gap-1 shrink-0"
          >
            View in Gmail <ExternalLink size={9} />
          </a>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-text-muted text-sm">
            <Loader2 size={16} className="animate-spin" />
            Loading thread...
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-text-muted py-8">No messages found</p>
        ) : (
          messages.map((msg) => {
            const sender = parseSender(msg.from);
            const isExpanded = expandedIds.has(msg.id);
            return (
              <div
                key={msg.id}
                className="rounded-xl border border-border overflow-hidden"
              >
                <button
                  onClick={() => toggleExpand(msg.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-bg-hover transition-colors cursor-pointer text-left"
                >
                  {isExpanded ? <ChevronDown size={12} className="shrink-0 text-text-muted" /> : <ChevronRight size={12} className="shrink-0 text-text-muted" />}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-text truncate block">
                      {sender.name || sender.email}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted shrink-0">{formatDate(msg.date)}</span>
                </button>
                {isExpanded && (
                  <div className="px-3 pb-3 space-y-2">
                    <div className="text-[10px] text-text-muted space-y-0.5 border-t border-border pt-2">
                      <p><span className="font-medium uppercase tracking-wider">From</span> {msg.from}</p>
                      <p><span className="font-medium uppercase tracking-wider">To</span> {msg.to}</p>
                      {msg.cc && <p><span className="font-medium uppercase tracking-wider">Cc</span> {msg.cc}</p>}
                    </div>
                    <div className="text-xs text-text whitespace-pre-wrap break-words leading-relaxed px-3 py-2">
                      {msg.body || msg.snippet || "(No content)"}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Reply area */}
      {!loading && messages.length > 0 && (
        <div className="shrink-0 border-t border-border px-4 py-3 space-y-2">
          {sent ? (
            <div className="flex items-center gap-2 text-success text-sm py-2">
              <Send size={14} /> Reply sent
            </div>
          ) : (
            <>
              <textarea
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
                placeholder="Write a reply..."
                rows={3}
                className="w-full bg-bg-tertiary border border-border rounded-xl px-3 py-2 text-sm resize-none placeholder:text-text-muted focus:outline-none focus:border-accent transition-all"
              />
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleAutoDraft}
                  disabled={draftLoading || !settings.apiKey}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 disabled:opacity-40 cursor-pointer transition-all"
                >
                  {draftLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  Auto-draft
                </button>
                <button
                  onClick={handleSend}
                  disabled={sending || !draftText.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-40 cursor-pointer transition-all"
                >
                  {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  Send email
                </button>
                {draftText.trim() && (
                  <button
                    onClick={() => handleAutoDraft()}
                    disabled={draftLoading}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs text-text-muted hover:bg-bg-hover cursor-pointer transition-all"
                  >
                    <RefreshCw size={11} />
                    Regenerate
                  </button>
                )}
                <button
                  onClick={onOpenSettings}
                  className="ml-auto flex items-center gap-1 text-[10px] text-text-muted hover:text-accent cursor-pointer transition-colors"
                >
                  <PenLine size={10} />
                  Writing style
                </button>
              </div>
            </>
          )}

          
        </div>
      )}
    </div>
  );
}
