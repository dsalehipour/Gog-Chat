"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Mail,
  Calendar,
  HardDrive,
  RefreshCw,
  Loader2,
  ExternalLink,
  Sunrise,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Plus,
  Check,
  Clock,
  Trash2,
  Sparkles,
  RotateCcw,
  PenLine,
  Send,
  SkipForward,
  Edit3,
  Timer,
  Play,
  Pause,
  Archive,
  ChevronDown,
  AlarmClock,
} from "lucide-react";
import type { FollowUp, Routine, RoutineSchedule, EmailStyleProfile, Settings } from "@/lib/types";
import { getNextRunTime } from "@/lib/scheduler";

// ─── Types ──────────────────────────────────────────────────

interface BriefingItem {
  id: string;
  text: string;
  detail?: string;
  url?: string;
  startTime?: string;
  endTime?: string;
  from?: string;
  threadId?: string;
  isUnread?: boolean;
  date?: string;
}

interface BriefingSection {
  title: string;
  items: BriefingItem[];
}

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

interface FollowUpSuggestion {
  title: string;
  source: string;
  contactName?: string;
  contactEmail?: string;
  company?: string;
  lastAction?: string;
  dueDate: string | null;
  notes: string;
}

// ─── Props ──────────────────────────────────────────────────

interface Props {
  settings: Settings;
  followUps: FollowUp[];
  onFollowUpsUpdate: (fus: FollowUp[]) => void;
  routines: Routine[];
  onRoutinesUpdate: (routines: Routine[]) => void;
  onRunRoutineNow: (instruction: string) => void;
  emailStyle: EmailStyleProfile | null;
  onStyleUpdate: (profile: EmailStyleProfile) => void;
  onBriefingItemClick: (text: string) => void;
  scrollToSection?: string | null;
  onScrollHandled?: () => void;
}

// ─── Helpers ────────────────────────────────────────────────

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatEmailDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.replace(" ", "T"));
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function formatDuration(startTime?: string, endTime?: string): string {
  if (!startTime || !endTime) return "";
  try {
    const s = new Date(startTime).getTime();
    const e = new Date(endTime).getTime();
    const mins = Math.round((e - s) / 60000);
    if (mins < 60) return `${mins}min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return rem > 0 ? `${hrs}hr ${rem}min` : `${hrs}hr`;
  } catch {
    return "";
  }
}

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getWeekRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - dayOfWeek + offset * 7);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  return {
    start: fmt(startOfWeek),
    end: fmt(endOfWeek),
    label: `${startOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric" })} — ${endOfWeek.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
  };
}

function getMonthRange(offset: number): { start: string; end: string; label: string } {
  const now = new Date();
  const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const endOfMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0);
  return {
    start: fmt(target),
    end: fmt(endOfMonth),
    label: target.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$2</li>')
    .replace(/\n/g, "<br/>");
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type RangePreset = "this-week" | "last-week" | "this-month" | "last-month" | "custom";

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "this-week", label: "This Week" },
  { id: "last-week", label: "Last Week" },
  { id: "this-month", label: "This Month" },
  { id: "last-month", label: "Last Month" },
  { id: "custom", label: "Custom" },
];

const BRIEFING_CACHE_TTL = 5 * 60 * 1000;
const RECAP_CACHE_TTL = 24 * 60 * 60 * 1000;

// ─── Component ──────────────────────────────────────────────

export default function DashboardView({
  settings,
  followUps,
  onFollowUpsUpdate,
  routines,
  onRoutinesUpdate,
  onRunRoutineNow,
  emailStyle,
  onStyleUpdate,
  onBriefingItemClick,
  scrollToSection,
  onScrollHandled,
}: Props) {
  // ── Briefing state ──
  const [briefingSections, setBriefingSections] = useState<BriefingSection[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingTimestamp, setBriefingTimestamp] = useState<number | null>(null);
  const briefingLoadedRef = useRef(false);
  const [, setTick] = useState(0);
  const [calDayOffset, setCalDayOffset] = useState(0);
  const [calLoading, setCalLoading] = useState(false);
  const [snoozeOpenId, setSnoozeOpenId] = useState<string | null>(null);
  const [snoozeCustom, setSnoozeCustom] = useState(false);
  const [snoozeDate, setSnoozeDate] = useState("");
  const [snoozeTime, setSnoozeTime] = useState("08:00");
  const snoozeRef = useRef<HTMLDivElement>(null);

  // ── Recap state ──
  const [recapPreset, setRecapPreset] = useState<RangePreset>("this-week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [customStart, setCustomStart] = useState(fmt(new Date()));
  const [customEnd, setCustomEnd] = useState(fmt(new Date()));
  const [recapSummary, setRecapSummary] = useState("");
  const [recapLoading, setRecapLoading] = useState(false);
  const recapAbortRef = useRef<AbortController | null>(null);
  const recapAutoLoadedRef = useRef(false);

  // ── Follow-ups state ──
  const [followUpScanning, setFollowUpScanning] = useState(false);
  const followUpAutoScannedRef = useRef(false);

  // ── Drafts state ──
  const [draftEmails, setDraftEmails] = useState<DraftEmail[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [analyzingStyle, setAnalyzingStyle] = useState(false);
  const [editingStyleRaw, setEditingStyleRaw] = useState(false);
  const [styleEditText, setStyleEditText] = useState("");
  const [styleExpanded, setStyleExpanded] = useState(false);
  const draftsLoadedRef = useRef(false);
  const styleAnalyzedRef = useRef(false);

  // ── Routines state ──
  const [showRoutineForm, setShowRoutineForm] = useState(false);
  const [routineEditId, setRoutineEditId] = useState<string | null>(null);
  const [routineInstruction, setRoutineInstruction] = useState("");
  const [routineScheduleType, setRoutineScheduleType] = useState<RoutineSchedule["type"]>("daily");
  const [routineTime, setRoutineTime] = useState("09:00");
  const [routineDayOfWeek, setRoutineDayOfWeek] = useState(1);
  const [routineDayOfMonth, setRoutineDayOfMonth] = useState(1);
  const [routineOnceDate, setRoutineOnceDate] = useState(fmt(new Date()));

  // ── Scroll handling ──
  useEffect(() => {
    if (scrollToSection) {
      const el = document.getElementById(scrollToSection);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      onScrollHandled?.();
    }
  }, [scrollToSection, onScrollHandled]);

  // ── Briefing fetch ──
  const fetchBriefing = useCallback(async (force = false) => {
    if (!force) {
      try {
        const cached = localStorage.getItem("gc_briefing_cache");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Date.now() - parsed.timestamp < BRIEFING_CACHE_TTL) {
            setBriefingSections(parsed.sections);
            setBriefingTimestamp(parsed.timestamp);
            return;
          }
        }
      } catch { /* ignore */ }
    }

    setBriefingLoading(true);
    try {
      const res = await fetch("/api/briefing");
      if (res.ok) {
        const data = await res.json();
        const now = Date.now();
        setBriefingSections(data.sections);
        setBriefingTimestamp(now);
        localStorage.setItem("gc_briefing_cache", JSON.stringify({ sections: data.sections, timestamp: now }));
      }
    } catch { /* ignore */ }
    finally { setBriefingLoading(false); }
  }, []);

  useEffect(() => {
    if (!briefingLoadedRef.current) {
      briefingLoadedRef.current = true;
      fetchBriefing();
    }
  }, [fetchBriefing]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const mins = settings.briefingRefreshMinutes ?? 60;
    if (mins <= 0) return;
    const id = setInterval(() => fetchBriefing(true), mins * 60_000);
    return () => clearInterval(id);
  }, [settings.briefingRefreshMinutes, fetchBriefing]);

  const hiddenAtRef = useRef<number | null>(null);
  useEffect(() => {
    const handler = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
      } else {
        const staleMins = settings.briefingStaleMinutes ?? 2;
        if (staleMins > 0 && hiddenAtRef.current && Date.now() - hiddenAtRef.current >= staleMins * 60_000) {
          fetchBriefing(true);
        }
        hiddenAtRef.current = null;
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [settings.briefingStaleMinutes, fetchBriefing]);

  const fetchCalendarDay = useCallback(async (offset: number) => {
    setCalLoading(true);
    try {
      const url = offset === 0
        ? "/api/briefing"
        : `/api/briefing?date=${(() => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().split("T")[0]; })()}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const calSection = (data.sections as BriefingSection[])?.find((s) => s.title === "Today's Events");
        if (calSection) {
          setBriefingSections((prev) => prev.map((s) => (s.title === "Today's Events" ? calSection : s)));
        }
      }
    } catch { /* ignore */ }
    finally { setCalLoading(false); }
  }, []);

  const prevCalOffset = useRef(0);
  useEffect(() => {
    if (calDayOffset !== 0) {
      fetchCalendarDay(calDayOffset);
    } else if (prevCalOffset.current !== 0) {
      fetchCalendarDay(0);
    }
    prevCalOffset.current = calDayOffset;
  }, [calDayOffset, fetchCalendarDay]);

  const archiveEmail = async (threadId: string) => {
    try {
      await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "archive", threadId }),
      });
      setBriefingSections((prev) =>
        prev.map((s) =>
          s.title === "Inbox"
            ? { ...s, items: s.items.filter((i) => i.threadId !== threadId && i.id !== threadId) }
            : s,
        ),
      );
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

  const snoozeEmail = async (threadId: string, wakeAt: number, subject: string) => {
    setSnoozeOpenId(null);
    try {
      const res = await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snooze", threadId }),
      });
      if (res.ok) {
        const snoozed = JSON.parse(localStorage.getItem("gc_snoozed_emails") || "[]");
        snoozed.push({ threadId, wakeAt, subject, snoozedAt: Date.now() });
        localStorage.setItem("gc_snoozed_emails", JSON.stringify(snoozed));
        setBriefingSections((prev) =>
          prev.map((s) =>
            s.title === "Inbox"
              ? { ...s, items: s.items.filter((i) => (i.threadId || i.id) !== threadId) }
              : s,
          ),
        );
      }
    } catch { /* ignore */ }
  };

  // Check for snoozed emails that need to come back
  useEffect(() => {
    const checkSnoozes = async () => {
      try {
        const snoozed = JSON.parse(localStorage.getItem("gc_snoozed_emails") || "[]") as { threadId: string; wakeAt: number; subject: string }[];
        const now = Date.now();
        const due = snoozed.filter((s) => s.wakeAt <= now);
        if (due.length === 0) return;
        const remaining = snoozed.filter((s) => s.wakeAt > now);
        for (const item of due) {
          try {
            await fetch("/api/briefing", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "unsnooze", threadId: item.threadId }),
            });
          } catch { /* ignore */ }
        }
        localStorage.setItem("gc_snoozed_emails", JSON.stringify(remaining));
        if (due.length > 0) fetchBriefing(true);
      } catch { /* ignore */ }
    };
    checkSnoozes();
    const interval = setInterval(checkSnoozes, 60_000);
    return () => clearInterval(interval);
  }, [fetchBriefing]);

  // Close snooze dropdown on outside click
  useEffect(() => {
    if (!snoozeOpenId) return;
    const handler = (e: MouseEvent) => {
      if (snoozeRef.current && !snoozeRef.current.contains(e.target as Node)) {
        setSnoozeOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [snoozeOpenId]);

  // ── Recap ──
  function getRecapRange(): { start: string; end: string; label: string } {
    switch (recapPreset) {
      case "this-week": return getWeekRange(weekOffset);
      case "last-week": return getWeekRange(weekOffset - 1);
      case "this-month": return getMonthRange(monthOffset);
      case "last-month": return getMonthRange(monthOffset - 1);
      case "custom": return { start: customStart, end: customEnd, label: `${customStart} to ${customEnd}` };
    }
  }

  const generateRecap = useCallback(async (start: string, end: string) => {
    if (!settings.apiKey) return;

    const cacheKey = `gc_recap_cache_${start}_${end}`;
    try {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.timestamp < RECAP_CACHE_TTL) {
          setRecapSummary(parsed.summary);
          return;
        }
      }
    } catch { /* ignore */ }

    setRecapLoading(true);
    setRecapSummary("");

    const controller = new AbortController();
    recapAbortRef.current = controller;

    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: start, endDate: end, apiKey: settings.apiKey, model: settings.model }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        setRecapSummary(`**Error:** ${err.error || "Failed to generate recap"}`);
        setRecapLoading(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let acc = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "text") {
              acc += event.content || "";
              setRecapSummary(acc);
            }
          } catch { /* skip */ }
        }
      }

      localStorage.setItem(cacheKey, JSON.stringify({ summary: acc, timestamp: Date.now() }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setRecapSummary(`**Error:** ${(err as Error).message}`);
      }
    } finally {
      setRecapLoading(false);
    }
  }, [settings.apiKey, settings.model]);

  useEffect(() => {
    if (!recapAutoLoadedRef.current) {
      recapAutoLoadedRef.current = true;
      const now = new Date();
      if (now.getDay() <= 1) {
        setRecapPreset("last-week");
      }
    }
  }, [settings.apiKey, generateRecap]);

  // ── Follow-ups ──
  const scanForFollowUps = useCallback(async () => {
    if (!settings.apiKey) return;
    setFollowUpScanning(true);
    try {
      const res = await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: settings.apiKey, model: settings.model }),
      });
      if (res.ok) {
        const data = await res.json();
        const suggestions: FollowUpSuggestion[] = data.suggestions || [];
        const newFollowUps: FollowUp[] = suggestions.map((s) => ({
          id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
          title: s.title,
          source: (s.source === "email" || s.source === "calendar" ? s.source : "manual") as FollowUp["source"],
          dueDate: s.dueDate ? new Date(s.dueDate).getTime() : undefined,
          status: "pending" as const,
          notes: [
            s.contactName && s.contactEmail ? `${s.contactName} <${s.contactEmail}>` : s.contactName || s.contactEmail || "",
            s.company ? `@ ${s.company}` : "",
            s.lastAction ? `Last: ${s.lastAction}` : "",
            s.notes || "",
          ].filter(Boolean).join(" · "),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }));
        const manualItems = followUps.filter((f) => f.source === "manual");
        const doneItems = followUps.filter((f) => f.status === "done");
        const kept = [...manualItems, ...doneItems.filter((d) => d.source !== "manual")];
        const keptTitles = new Set(kept.map((f) => f.title.toLowerCase()));
        const unique = newFollowUps.filter((f) => !keptTitles.has(f.title.toLowerCase()));
        onFollowUpsUpdate([...unique, ...kept]);
        localStorage.setItem("gc_followup_scan_ts", String(Date.now()));
      }
    } catch { /* ignore */ }
    finally { setFollowUpScanning(false); }
  }, [settings.apiKey, settings.model, followUps, onFollowUpsUpdate]);

  useEffect(() => {
    if (!followUpAutoScannedRef.current && settings.apiKey) {
      followUpAutoScannedRef.current = true;
      scanForFollowUps();
    }
  }, [settings.apiKey, scanForFollowUps]);

  function toggleFollowUpStatus(id: string) {
    onFollowUpsUpdate(
      followUps.map((f) =>
        f.id === id ? { ...f, status: f.status === "done" ? "pending" : "done", updatedAt: Date.now() } : f,
      ),
    );
  }

  function removeFollowUp(id: string) {
    onFollowUpsUpdate(followUps.filter((f) => f.id !== id));
  }

  // ── Drafts ──
  const fetchDraftEmails = useCallback(async () => {
    if (!settings.apiKey) return;
    setDraftsLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("apiKey", settings.apiKey);
      if (settings.model) params.set("model", settings.model);
      const res = await fetch(`/api/drafts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDraftEmails(data.emails || []);
      }
    } catch { /* ignore */ }
    finally { setDraftsLoading(false); }
  }, [settings.apiKey, settings.model]);

  const analyzeStyle = useCallback(async () => {
    if (!settings.apiKey) return;
    setAnalyzingStyle(true);
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "analyze-style", apiKey: settings.apiKey, model: settings.model }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.profile) onStyleUpdate(data.profile);
      }
    } catch { /* ignore */ }
    finally { setAnalyzingStyle(false); }
  }, [settings.apiKey, settings.model, onStyleUpdate]);

  useEffect(() => {
    if (!draftsLoadedRef.current && settings.apiKey) {
      draftsLoadedRef.current = true;
      fetchDraftEmails();
    }
  }, [fetchDraftEmails, settings.apiKey]);

  useEffect(() => {
    if (!styleAnalyzedRef.current && settings.apiKey && !emailStyle) {
      styleAnalyzedRef.current = true;
      analyzeStyle();
    }
  }, [settings.apiKey, emailStyle, analyzeStyle]);

  async function generateDraft(email: DraftEmail) {
    if (!settings.apiKey) return;
    setDrafts((prev) => ({
      ...prev,
      [email.id]: { emailId: email.id, draft: "", loading: true, editing: false, sent: false, skipped: false },
    }));

    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-draft", apiKey: settings.apiKey, model: settings.model, emailId: email.id, styleProfile: emailStyle }),
      });
      if (res.ok) {
        const data = await res.json();
        setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], draft: data.draft || "", loading: false } }));
      }
    } catch {
      setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], draft: "Failed to generate draft.", loading: false } }));
    }
  }

  async function sendDraft(email: DraftEmail) {
    const ds = drafts[email.id];
    if (!ds?.draft) return;
    setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], loading: true } }));
    try {
      const res = await fetch("/api/drafts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-draft", emailId: email.id, threadId: email.threadId, draftText: ds.draft, subject: email.subject, to: email.from }),
      });
      if (res.ok) {
        setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], sent: true, loading: false } }));
      }
    } catch {
      setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], loading: false } }));
    }
  }

  // ── Routines ──
  function resetRoutineForm() {
    setRoutineInstruction("");
    setRoutineScheduleType("daily");
    setRoutineTime("09:00");
    setRoutineDayOfWeek(1);
    setRoutineDayOfMonth(1);
    setRoutineOnceDate(fmt(new Date()));
    setShowRoutineForm(false);
    setRoutineEditId(null);
  }

  function saveRoutine() {
    if (!routineInstruction.trim()) return;
    const schedule: RoutineSchedule = {
      type: routineScheduleType,
      time: routineTime,
      ...(routineScheduleType === "weekly" ? { dayOfWeek: routineDayOfWeek } : {}),
      ...(routineScheduleType === "monthly" ? { dayOfMonth: routineDayOfMonth } : {}),
      ...(routineScheduleType === "once" ? { onceDate: routineOnceDate } : {}),
    };

    if (routineEditId) {
      onRoutinesUpdate(routines.map((r) =>
        r.id === routineEditId ? { ...r, instruction: routineInstruction.trim(), schedule, nextRun: getNextRunTime({ ...r, schedule }) } : r,
      ));
    } else {
      const newRoutine: Routine = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        instruction: routineInstruction.trim(),
        schedule,
        enabled: true,
        nextRun: getNextRunTime({ id: "", instruction: "", schedule, enabled: true, nextRun: 0, conversationIds: [], createdAt: Date.now() }),
        conversationIds: [],
        createdAt: Date.now(),
      };
      onRoutinesUpdate([newRoutine, ...routines]);
    }
    resetRoutineForm();
  }

  function startEditRoutine(r: Routine) {
    setRoutineEditId(r.id);
    setRoutineInstruction(r.instruction);
    setRoutineScheduleType(r.schedule.type);
    setRoutineTime(r.schedule.time);
    setRoutineDayOfWeek(r.schedule.dayOfWeek ?? 1);
    setRoutineDayOfMonth(r.schedule.dayOfMonth ?? 1);
    setRoutineOnceDate(r.schedule.onceDate || fmt(new Date()));
    setShowRoutineForm(true);
  }

  function formatSchedule(r: Routine): string {
    const { schedule: s } = r;
    if (s.type === "once") return `Once on ${s.onceDate} at ${s.time}`;
    if (s.type === "daily") return `Daily at ${s.time}`;
    if (s.type === "weekly") return `${DAYS[s.dayOfWeek ?? 0]}s at ${s.time}`;
    if (s.type === "monthly") return `${ordinal(s.dayOfMonth ?? 1)} of each month at ${s.time}`;
    return s.type;
  }

  // ── Derived ──
  const recapRange = getRecapRange();
  const isWeekPreset = recapPreset === "this-week" || recapPreset === "last-week";
  const isMonthPreset = recapPreset === "this-month" || recapPreset === "last-month";
  const pendingFollowUps = followUps.filter((f) => f.status === "pending");
  const doneFollowUps = followUps.filter((f) => f.status === "done");
  const activeDraftEmails = draftEmails.filter((e) => !drafts[e.id]?.sent && !drafts[e.id]?.skipped);

  const emailSection = briefingSections.find((s) => s.title === "Inbox");
  const calendarSection = briefingSections.find((s) => s.title === "Today's Events");
  const driveSection = briefingSections.find((s) => s.title === "Recent Files");

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 py-8 space-y-12">

        {/* ═══════════ BRIEFING ═══════════ */}
        <section id="briefing">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-google-blue via-google-red to-google-yellow flex items-center justify-center shadow-lg">
              <Sunrise size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">Good {getTimeOfDay()}</h2>
              <p className="text-xs text-text-muted">
                Your daily briefing
                {briefingTimestamp && <span className="ml-1.5 opacity-60">· updated {timeAgo(briefingTimestamp)}</span>}
              </p>
            </div>
            <button
              onClick={() => { fetchBriefing(true); scanForFollowUps(); fetchDraftEmails(); }}
              disabled={briefingLoading || followUpScanning || draftsLoading}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/10 transition-all text-text-muted hover:text-accent cursor-pointer disabled:opacity-40"
              title="Refresh all sections"
            >
              <RefreshCw size={14} className={briefingLoading || followUpScanning || draftsLoading ? "animate-refresh" : ""} />
              <span className="text-[10px] font-medium">Refresh all</span>
            </button>
          </div>

          {briefingLoading && briefingSections.length === 0 ? (
            <div className="flex items-center gap-2 text-text-muted text-sm py-8">
              <Loader2 size={16} className="animate-spin" />
              Loading your briefing...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Inbox */}
              <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Mail size={15} className="text-google-red" />
                  <h3 className="text-sm font-medium">
                    <a href="https://mail.google.com" target="_blank" rel="noopener" className="hover:text-accent transition-colors inline-flex items-center gap-1">
                      Inbox
                      <ExternalLink size={10} className="opacity-50" />
                    </a>
                    {(emailSection?.items.length ?? 0) > 0 && (
                      <span className="text-text-muted font-normal ml-1.5">({emailSection!.items.length})</span>
                    )}
                  </h3>
                  {briefingTimestamp && <span className="ml-auto text-[10px] text-text-muted opacity-50">{timeAgo(briefingTimestamp)}</span>}
                </div>
                {!emailSection || emailSection.items.length === 0 ? (
                  <p className="text-xs text-text-muted">All caught up</p>
                ) : (
                  <ul className="space-y-1">
                    {emailSection.items.slice(0, 8).map((item) => {
                      const tid = item.threadId || item.id;
                      return (
                        <li key={item.id} className="group relative">
                          <a
                            href={item.url || `https://mail.google.com/mail/u/0/#inbox/${tid}`}
                            target="_blank"
                            rel="noopener"
                            className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer ${
                              item.isUnread
                                ? "bg-bg-secondary/80"
                                : ""
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs ${item.isUnread ? "text-text font-semibold" : "text-text-secondary"}`}>{item.text}</p>
                              {item.detail && (() => {
                                const match = item.detail.match(/^(.+?)\s*<([^>]+)>$/);
                                const name = match ? match[1].trim() : item.detail;
                                const email = match ? match[2] : null;
                                return (
                                  <p className="text-[11px] truncate">
                                    <span className={item.isUnread ? "text-text-secondary font-medium" : "text-text-muted"}>{name}</span>
                                    {email && <span className="text-text-muted/50 text-[10px]"> {email}</span>}
                                  </p>
                                );
                              })()}
                            </div>
                            {item.date && (
                              <span className={`shrink-0 text-[10px] tabular-nums ${item.isUnread ? "text-text-secondary font-medium" : "text-text-muted/60"}`}>
                                {formatEmailDate(item.date)}
                              </span>
                            )}
                            <div className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSnoozeCustom(false); setSnoozeOpenId(snoozeOpenId === tid ? null : tid); }}
                                className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-accent transition-all cursor-pointer"
                                title="Snooze"
                              >
                                <AlarmClock size={12} />
                              </button>
                              <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); archiveEmail(tid); }}
                                className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-accent transition-all cursor-pointer"
                                title="Archive"
                              >
                                <Archive size={12} />
                              </button>
                            </div>
                          </a>
                          {snoozeOpenId === tid && (
                            <div
                              ref={snoozeRef}
                              className="absolute right-2 top-full mt-1 z-50 bg-bg-secondary border border-border rounded-xl shadow-xl py-1 min-w-[220px]"
                            >
                              <p className="px-3 py-1.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">Snooze until</p>
                              {getSnoozeOptions().map((opt) => (
                                <button
                                  key={opt.time}
                                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); snoozeEmail(tid, opt.time, item.text); }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-text hover:bg-bg-hover transition-colors cursor-pointer flex items-center gap-2"
                                >
                                  <AlarmClock size={11} className="text-text-muted shrink-0" />
                                  {opt.label}
                                </button>
                              ))}
                              <div className="border-t border-border mt-1 pt-1">
                                {!snoozeCustom ? (
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault(); e.stopPropagation();
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
                                  <div className="px-3 py-2 space-y-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
                                    <div className="flex gap-1.5">
                                      <input
                                        type="date"
                                        value={snoozeDate}
                                        onChange={(e) => setSnoozeDate(e.target.value)}
                                        min={new Date().toISOString().split("T")[0]}
                                        className="flex-1 bg-bg-tertiary border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
                                      />
                                      <input
                                        type="time"
                                        value={snoozeTime}
                                        onChange={(e) => setSnoozeTime(e.target.value)}
                                        className="w-[90px] bg-bg-tertiary border border-border rounded-lg px-2 py-1 text-xs text-text focus:outline-none focus:border-accent"
                                      />
                                    </div>
                                    <button
                                      onClick={() => {
                                        if (!snoozeDate) return;
                                        const wakeAt = new Date(`${snoozeDate}T${snoozeTime || "08:00"}`).getTime();
                                        if (wakeAt > Date.now()) snoozeEmail(tid, wakeAt, item.text);
                                      }}
                                      disabled={!snoozeDate}
                                      className="w-full px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium cursor-pointer disabled:opacity-40 hover:bg-accent/90 transition-colors"
                                    >
                                      Snooze
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Calendar Events */}
              <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar size={15} className="text-google-blue" />
                  <h3 className="text-sm font-medium flex items-center gap-1.5">
                    <a href="https://calendar.google.com" target="_blank" rel="noopener" className="hover:text-accent transition-colors inline-flex items-center gap-1">
                      {(() => {
                        const d = new Date(); d.setDate(d.getDate() + calDayOffset);
                        if (calDayOffset === 0) return "Today";
                        if (calDayOffset === 1) return "Tomorrow";
                        if (calDayOffset === -1) return "Yesterday";
                        return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
                      })()}
                      <ExternalLink size={10} className="opacity-50" />
                    </a>
                    {(calendarSection?.items.length ?? 0) > 0 && (
                      <span className="text-text-muted font-normal">({calendarSection!.items.length})</span>
                    )}
                  </h3>
                  <div className="ml-auto flex items-center gap-1">
                    <button
                      onClick={() => setCalDayOffset((o) => o - 1)}
                      disabled={calLoading}
                      className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text cursor-pointer disabled:opacity-40 transition-colors"
                      title="Previous day"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {calDayOffset !== 0 && (
                      <button
                        onClick={() => setCalDayOffset(0)}
                        disabled={calLoading}
                        className="px-1.5 py-0.5 rounded text-[10px] font-medium text-accent hover:bg-accent/10 cursor-pointer disabled:opacity-40 transition-colors"
                      >
                        Today
                      </button>
                    )}
                    <button
                      onClick={() => setCalDayOffset((o) => o + 1)}
                      disabled={calLoading}
                      className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-text cursor-pointer disabled:opacity-40 transition-colors"
                      title="Next day"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
                {calLoading ? (
                  <div className="flex items-center gap-2 text-text-muted text-xs py-4 justify-center">
                    <Loader2 size={14} className="animate-spin" /> Loading...
                  </div>
                ) : !calendarSection || calendarSection.items.length === 0 ? (
                  <p className="text-xs text-text-muted">No events {calDayOffset === 0 ? "today" : "this day"}</p>
                ) : (
                  <ul className="space-y-1">
                    {(() => {
                      const events = calendarSection.items.slice(0, 8);
                      const now = Date.now();
                      const isToday = calDayOffset === 0;
                      let nowLineRendered = false;

                      const nowLine = (
                        <li key="now-line" className="flex items-center gap-2 py-0.5">
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
                          <div className="flex-1 h-px bg-red-500/70" />
                          <span className="text-[9px] font-medium text-red-500 shrink-0">
                            {new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                          </span>
                        </li>
                      );

                      const items: React.ReactNode[] = [];

                      events.forEach((item, idx) => {
                        const eventStart = item.startTime ? new Date(item.startTime).getTime() : 0;

                        if (isToday && !nowLineRendered && eventStart > now) {
                          items.push(nowLine);
                          nowLineRendered = true;
                        }

                        const dur = formatDuration(item.startTime, item.endTime);
                        let durationMins = 0;
                        try {
                          if (item.startTime && item.endTime) {
                            durationMins = Math.round((new Date(item.endTime).getTime() - new Date(item.startTime).getTime()) / 60000);
                          }
                        } catch { /* ignore */ }
                        const barPct = durationMins > 0 ? Math.min(Math.max(durationMins / 120, 0.15), 1) : 0;

                        items.push(
                          <li key={item.id} className="group">
                            <a
                              href={item.url || "https://calendar.google.com"}
                              target="_blank"
                              rel="noopener"
                              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer"
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-xs text-text truncate flex-1">{item.text}</p>
                                  {item.detail && <span className="text-xs font-semibold text-accent shrink-0">{item.detail}</span>}
                                </div>
                                {barPct > 0 && (
                                  <div className="flex items-center gap-2 mt-1">
                                    <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                                      <div
                                        className="h-full rounded-full bg-google-blue/50"
                                        style={{ width: `${barPct * 100}%` }}
                                      />
                                    </div>
                                    {dur && <span className="text-[10px] font-medium text-text-secondary shrink-0 w-12 text-right">{dur}</span>}
                                  </div>
                                )}
                              </div>
                              <ExternalLink size={10} className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted" />
                            </a>
                          </li>
                        );

                        if (isToday && !nowLineRendered && idx === events.length - 1) {
                          items.push(nowLine);
                          nowLineRendered = true;
                        }
                      });

                      return items;
                    })()}
                  </ul>
                )}
              </div>

              {/* Recent Files */}
              <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-2 sm:col-span-2">
                <div className="flex items-center gap-2 mb-2">
                  <HardDrive size={15} className="text-google-yellow" />
                  <h3 className="text-sm font-medium">
                    Recent Files
                    {(driveSection?.items.length ?? 0) > 0 && (
                      <span className="text-text-muted font-normal ml-1.5">({driveSection!.items.length})</span>
                    )}
                  </h3>
                  {briefingTimestamp && <span className="ml-auto text-[10px] text-text-muted opacity-50">{timeAgo(briefingTimestamp)}</span>}
                </div>
                {!driveSection || driveSection.items.length === 0 ? (
                  <p className="text-xs text-text-muted">No recent files</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {driveSection.items.map((item) => (
                      <a
                        key={item.id}
                        href={item.url || "#"}
                        target="_blank"
                        rel="noopener"
                        className="group flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-text truncate">{item.text}</p>
                          {item.detail && <p className="text-[10px] text-text-muted">{item.detail}</p>}
                        </div>
                        <ExternalLink size={10} className="shrink-0 opacity-0 group-hover:opacity-100 text-text-muted" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ═══════════ FOLLOW-UPS ═══════════ */}
        <section id="followups">
          <div className="flex items-center gap-3 mb-4">
            <ListChecks size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Follow-ups</h2>
            {pendingFollowUps.length > 0 && (
              <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium">{pendingFollowUps.length}</span>
            )}
            <button
              onClick={scanForFollowUps}
              disabled={followUpScanning || !settings.apiKey}
              className="ml-auto p-2 rounded-lg hover:bg-accent/10 transition-all text-text-muted hover:text-accent cursor-pointer disabled:opacity-40"
              title="Scan for follow-ups"
            >
              <RefreshCw size={16} className={followUpScanning ? "animate-refresh" : ""} />
            </button>
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-2 min-h-[80px]">
            {followUpScanning && pendingFollowUps.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-text-muted text-sm">
                <Loader2 size={16} className="animate-spin" />
                Scanning for follow-ups...
              </div>
            )}

            {!followUpScanning && pendingFollowUps.length === 0 && doneFollowUps.length === 0 && (
              <p className="text-center text-xs text-text-muted py-6">No follow-ups found. Hit refresh to scan your emails.</p>
            )}

            {pendingFollowUps
              .sort((a, b) => {
                if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
                if (a.dueDate) return -1;
                return b.createdAt - a.createdAt;
              })
              .map((fu) => (
                <div key={fu.id} className="group flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border hover:border-accent/20 transition-all">
                  <button
                    onClick={() => toggleFollowUpStatus(fu.id)}
                    className="mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 border-border hover:border-accent flex items-center justify-center cursor-pointer transition-all"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text">{fu.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {fu.dueDate && (
                        <span className="flex items-center gap-1 text-[10px] text-text-muted">
                          <Clock size={9} />
                          {new Date(fu.dueDate).toLocaleDateString()}
                        </span>
                      )}
                      <span className="text-[10px] text-text-muted capitalize">{fu.source}</span>
                    </div>
                    {fu.notes && <p className="text-[11px] text-text-muted mt-1">{fu.notes}</p>}
                  </div>
                  <button onClick={() => removeFollowUp(fu.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-hover text-text-muted hover:text-danger cursor-pointer transition-all">
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}

            {doneFollowUps.length > 0 && (
              <div className="pt-2 border-t border-border mt-2 space-y-1">
                <p className="text-[10px] text-text-muted uppercase tracking-wider px-3">Completed</p>
                {doneFollowUps.slice(0, 5).map((fu) => (
                  <div key={fu.id} className="group flex items-start gap-3 px-3 py-1.5 rounded-xl opacity-50">
                    <button
                      onClick={() => toggleFollowUpStatus(fu.id)}
                      className="mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 bg-success border-success text-white flex items-center justify-center cursor-pointer transition-all"
                    >
                      <Check size={12} />
                    </button>
                    <p className="text-sm text-text-muted line-through flex-1">{fu.title}</p>
                    <button onClick={() => toggleFollowUpStatus(fu.id)} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-hover text-text-muted cursor-pointer" title="Reopen">
                      <RotateCcw size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* ═══════════ DRAFTS ═══════════ */}
        <section id="drafts">
          <div className="flex items-center gap-3 mb-4">
            <PenLine size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Email Drafts</h2>
            {activeDraftEmails.length > 0 && (
              <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium">{activeDraftEmails.length}</span>
            )}
            <button
              onClick={fetchDraftEmails}
              disabled={draftsLoading}
              className="ml-auto p-2 rounded-lg hover:bg-accent/10 transition-all text-text-muted hover:text-accent cursor-pointer disabled:opacity-40"
              title="Refresh drafts"
            >
              <RefreshCw size={16} className={draftsLoading ? "animate-refresh" : ""} />
            </button>
          </div>

          {/* Style profile (collapsed by default) */}
          {emailStyle ? (
            <div className="rounded-xl border border-accent/20 bg-accent/5 mb-4 overflow-hidden">
              <button
                onClick={() => setStyleExpanded(!styleExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-accent/10 transition-colors"
              >
                <p className="text-xs font-medium text-accent">Your Writing Style</p>
                <ChevronDown size={14} className={`text-accent/60 transition-transform ${styleExpanded ? "rotate-180" : ""}`} />
              </button>
              {styleExpanded && (
                <div className="px-4 pb-4 border-t border-accent/10">
                  <div className="flex justify-end gap-3 mt-2 mb-1">
                    <button
                      onClick={analyzeStyle}
                      disabled={analyzingStyle || !settings.apiKey}
                      className="text-[10px] text-accent/70 hover:text-accent cursor-pointer disabled:opacity-40 flex items-center gap-1"
                    >
                      <RefreshCw size={10} className={analyzingStyle ? "animate-refresh" : ""} />
                      Re-analyze
                    </button>
                    <button
                      onClick={() => { setEditingStyleRaw(!editingStyleRaw); setStyleEditText(emailStyle.raw); }}
                      className="text-[10px] text-accent/70 hover:text-accent cursor-pointer"
                    >
                      {editingStyleRaw ? "Cancel" : "Edit"}
                    </button>
                  </div>
                  {editingStyleRaw ? (
                    <div className="space-y-2">
                      <textarea
                        value={styleEditText}
                        onChange={(e) => setStyleEditText(e.target.value)}
                        rows={3}
                        className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => { onStyleUpdate({ ...emailStyle, raw: styleEditText }); setEditingStyleRaw(false); }}
                        className="px-3 py-1 rounded-lg bg-accent text-white text-xs cursor-pointer"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] text-text-secondary space-y-0.5">
                      <p><span className="text-text-muted">Tone:</span> {emailStyle.tone}, {emailStyle.formalityLevel}</p>
                      <p><span className="text-text-muted">Greetings:</span> {emailStyle.greetingPatterns?.join(", ")}</p>
                      <p><span className="text-text-muted">Sign-offs:</span> {emailStyle.signOffPatterns?.join(", ")}</p>
                      <p className="text-text-muted italic mt-1">{emailStyle.raw}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : settings.apiKey ? (
            <div className="rounded-xl border border-dashed border-accent/30 bg-accent/5 p-3 mb-4 flex items-center justify-between">
              <p className="text-xs text-text-muted">Analyze your sent emails to personalize drafts</p>
              <button
                onClick={analyzeStyle}
                disabled={analyzingStyle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 disabled:opacity-40 cursor-pointer transition-all"
              >
                {analyzingStyle ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                Learn My Style
              </button>
            </div>
          ) : null}

          <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-3 min-h-[80px]">
            {draftsLoading && draftEmails.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-6 text-text-muted text-sm">
                <Loader2 size={16} className="animate-spin" />
                Loading emails...
              </div>
            )}

            {!draftsLoading && draftEmails.length === 0 && (
              <p className="text-center text-xs text-text-muted py-6">No important unread emails to draft replies for</p>
            )}

            {activeDraftEmails.map((email) => {
              const ds = drafts[email.id];
              return (
                <div key={email.id} className="rounded-xl border border-border p-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-text truncate flex-1">{email.subject}</p>
                      {email.date && <span className="text-[10px] text-text-muted ml-2 shrink-0">{email.date}</span>}
                    </div>
                    <p className="text-xs text-text-muted">{email.from}</p>
                    {email.snippet && <p className="text-xs text-text-secondary mt-1 line-clamp-2">{email.snippet}</p>}
                  </div>

                  {!ds ? (
                    <button
                      onClick={() => generateDraft(email)}
                      disabled={!settings.apiKey}
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
                      <Check size={14} /> Sent
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {ds.editing ? (
                        <textarea
                          value={ds.draft}
                          onChange={(e) => setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], draft: e.target.value } }))}
                          rows={4}
                          className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:border-accent transition-all"
                        />
                      ) : (
                        <div className="bg-bg-tertiary rounded-xl px-4 py-3 text-sm text-text whitespace-pre-wrap">{ds.draft}</div>
                      )}
                      <div className="flex gap-2 flex-wrap">
                        <button onClick={() => sendDraft(email)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover cursor-pointer transition-all">
                          <Send size={12} /> Send
                        </button>
                        <button onClick={() => setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], editing: !prev[email.id].editing } }))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border text-xs text-text-secondary hover:bg-bg-hover cursor-pointer transition-all">
                          <Edit3 size={12} /> {ds.editing ? "Preview" : "Edit"}
                        </button>
                        <button onClick={() => generateDraft(email)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary border border-border text-xs text-text-secondary hover:bg-bg-hover cursor-pointer transition-all">
                          <RefreshCw size={12} /> Regenerate
                        </button>
                        <button onClick={() => setDrafts((prev) => ({ ...prev, [email.id]: { ...prev[email.id], skipped: true } }))} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-text-muted hover:bg-bg-hover cursor-pointer transition-all ml-auto">
                          <SkipForward size={12} /> Skip
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ═══════════ ROUTINES ═══════════ */}
        <section id="routines">
          <div className="flex items-center gap-3 mb-4">
            <Timer size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Scheduled Routines</h2>
            <button
              onClick={() => { resetRoutineForm(); setShowRoutineForm(true); }}
              className="ml-auto p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer transition-all"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Add/Edit form */}
          {showRoutineForm && (
            <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-3 mb-4">
              <textarea
                value={routineInstruction}
                onChange={(e) => setRoutineInstruction(e.target.value)}
                placeholder="What should the AI do? e.g. 'Summarize my unread emails and list action items'"
                rows={2}
                className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm resize-none placeholder:text-text-muted focus:outline-none focus:border-accent transition-all"
              />
              <div className="flex gap-2 flex-wrap">
                {(["once", "daily", "weekly", "monthly"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setRoutineScheduleType(t)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                      routineScheduleType === t
                        ? "bg-accent/15 text-accent border border-accent/25"
                        : "bg-bg-tertiary border border-border text-text-secondary hover:bg-bg-hover"
                    }`}
                  >
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex gap-3 items-end flex-wrap">
                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted">Time</label>
                  <input type="time" value={routineTime} onChange={(e) => setRoutineTime(e.target.value)} className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all" />
                </div>
                {routineScheduleType === "weekly" && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-text-muted">Day</label>
                    <select value={routineDayOfWeek} onChange={(e) => setRoutineDayOfWeek(Number(e.target.value))} className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all">
                      {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                    </select>
                  </div>
                )}
                {routineScheduleType === "monthly" && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-text-muted">Day of month</label>
                    <input type="number" min={1} max={31} value={routineDayOfMonth} onChange={(e) => setRoutineDayOfMonth(Number(e.target.value))} className="w-20 bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all" />
                  </div>
                )}
                {routineScheduleType === "once" && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-text-muted">Date</label>
                    <input type="date" value={routineOnceDate} onChange={(e) => setRoutineOnceDate(e.target.value)} className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all" />
                  </div>
                )}
                <button onClick={saveRoutine} disabled={!routineInstruction.trim()} className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 cursor-pointer transition-all">
                  {routineEditId ? "Save" : "Create"}
                </button>
                <button onClick={resetRoutineForm} className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover cursor-pointer transition-all">
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-2 min-h-[80px]">
            {routines.length === 0 && !showRoutineForm && (
              <div className="text-center py-6">
                <Timer size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
                <p className="text-xs text-text-muted">No routines set up yet</p>
                <button onClick={() => setShowRoutineForm(true)} className="mt-3 text-xs text-accent hover:text-accent-hover cursor-pointer">
                  Create your first routine
                </button>
              </div>
            )}

            {routines.map((r) => (
              <div key={r.id} className={`group rounded-xl border p-3 transition-all ${r.enabled ? "border-border hover:border-accent/20" : "border-border/50 opacity-50"}`}>
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => onRoutinesUpdate(routines.map((x) => x.id === r.id ? { ...x, enabled: !x.enabled } : x))}
                    className={`mt-0.5 p-1 rounded-lg cursor-pointer transition-all ${r.enabled ? "text-accent bg-accent/10" : "text-text-muted bg-bg-tertiary"}`}
                    title={r.enabled ? "Pause" : "Resume"}
                  >
                    {r.enabled ? <Play size={12} /> : <Pause size={12} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-text line-clamp-2">{r.instruction}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex items-center gap-1 text-[10px] text-text-muted"><Clock size={9} />{formatSchedule(r)}</span>
                      {r.lastRun && <span className="text-[10px] text-text-muted">Last: {new Date(r.lastRun).toLocaleString()}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => onRunRoutineNow(r.instruction)} className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent cursor-pointer" title="Run now"><Play size={12} /></button>
                    <button onClick={() => startEditRoutine(r)} className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer" title="Edit"><Clock size={12} /></button>
                    <button onClick={() => { onRoutinesUpdate(routines.filter((x) => x.id !== r.id)); if (routineEditId === r.id) resetRoutineForm(); }} className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-danger cursor-pointer" title="Delete"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ═══════════ RECAP ═══════════ */}
        <section id="recap">
          <div className="flex items-center gap-3 mb-4">
            <CalendarClock size={20} className="text-accent" />
            <h2 className="text-lg font-semibold">Activity Recap</h2>
          </div>

          <div className="space-y-3 mb-4">
            <div className="flex gap-1.5 flex-wrap">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { setRecapPreset(p.id); setWeekOffset(0); setMonthOffset(0); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    recapPreset === p.id
                      ? "bg-accent/15 text-accent border border-accent/25"
                      : "bg-bg-tertiary border border-border text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {(isWeekPreset || isMonthPreset) && (
                  <button onClick={() => isWeekPreset ? setWeekOffset((o) => o - 1) : setMonthOffset((o) => o - 1)} className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer">
                    <ChevronLeft size={16} />
                  </button>
                )}
                <span className="text-sm font-medium min-w-[200px] text-center">{recapRange.label}</span>
                {(isWeekPreset || isMonthPreset) && (
                  <button onClick={() => isWeekPreset ? setWeekOffset((o) => o + 1) : setMonthOffset((o) => o + 1)} className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer">
                    <ChevronRight size={16} />
                  </button>
                )}
              </div>
              <button
                onClick={() => generateRecap(recapRange.start, recapRange.end)}
                disabled={recapLoading || !settings.apiKey}
                className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
              >
                {recapLoading ? <Loader2 size={14} className="animate-spin" /> : null}
                {recapLoading ? "Generating..." : "Generate Recap"}
              </button>
            </div>

            {recapPreset === "custom" && (
              <div className="flex gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted">From</label>
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted">To</label>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all" />
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary/50 p-6 min-h-[120px]">
            {!recapSummary && !recapLoading && (
              <p className="text-center text-sm text-text-muted py-4">
                Select a time range and click Generate Recap to see what you accomplished.
              </p>
            )}
            {recapSummary && (
              <div className="message-content prose prose-sm text-text text-sm leading-relaxed">
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(recapSummary) }} />
              </div>
            )}
            {recapLoading && !recapSummary && (
              <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
                <Loader2 size={16} className="animate-spin" />
                Gathering your activity data...
              </div>
            )}
          </div>
        </section>

        <div className="h-8" />
      </div>
    </div>
  );
}
