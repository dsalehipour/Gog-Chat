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
  Plus,
  Check,
  Clock,
  Trash2,
  Timer,
  Play,
  Pause,
  Archive,
  ChevronDown,
  AlarmClock,
  Users,
  X,
  ShieldAlert,
  Lightbulb,
  Sparkles,
  Video,
} from "lucide-react";
import type { Routine, RoutineSchedule, Settings } from "@/lib/types";
import { getNextRunTime } from "@/lib/scheduler";

// ─── Types ──────────────────────────────────────────────────

interface EventAttendee {
  name: string;
  email: string;
  status: string;
  organizer?: boolean;
  self?: boolean;
}

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
  organizer?: { name: string; email: string };
  attendees?: EventAttendee[];
}

interface BriefingSection {
  title: string;
  items: BriefingItem[];
}

// ─── Props ──────────────────────────────────────────────────

interface Props {
  settings: Settings;
  routines: Routine[];
  onRoutinesUpdate: (routines: Routine[]) => void;
  onRunRoutineNow: (instruction: string) => void;
  onBriefingItemClick: (text: string) => void;
  onOpenThread?: (threadId: string) => void;
  activeThreadId?: string | null;
  scrollToSection?: string | null;
  onScrollHandled?: () => void;
  scrollToTop?: number;
  removedThreadId?: string | null;
  onRemovedThreadHandled?: () => void;
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
  routines,
  onRoutinesUpdate,
  onRunRoutineNow,
  onBriefingItemClick,
  onOpenThread,
  activeThreadId,
  scrollToSection,
  onScrollHandled,
  scrollToTop,
  removedThreadId,
  onRemovedThreadHandled,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // ── Briefing state ──
  const [briefingSections, setBriefingSections] = useState<BriefingSection[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingTimestamp, setBriefingTimestamp] = useState<number | null>(null);
  const briefingLoadedRef = useRef(false);
  const [, setTick] = useState(0);
  const [calDayOffset, setCalDayOffset] = useState(0);
  const [calLoading, setCalLoading] = useState(false);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);
  const [hoveredEmailId, setHoveredEmailId] = useState<string | null>(null);
  const [emailPreviews, setEmailPreviews] = useState<Record<string, { from: string; to: string; cc: string; bodyPreview: string; loading?: boolean }>>({});
  const [spamConfirmId, setSpamConfirmId] = useState<string | null>(null);
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

  const [refreshAllLoading, setRefreshAllLoading] = useState(false);

  // ── Routines state ──
  const [showRoutineForm, setShowRoutineForm] = useState(false);
  const [routineEditId, setRoutineEditId] = useState<string | null>(null);
  const [routineInstruction, setRoutineInstruction] = useState("");
  const [routineScheduleType, setRoutineScheduleType] = useState<RoutineSchedule["type"]>("daily");
  const [routineTime, setRoutineTime] = useState("09:00");
  const [routineDayOfWeek, setRoutineDayOfWeek] = useState(1);
  const [routineDayOfMonth, setRoutineDayOfMonth] = useState(1);
  const [routineOnceDate, setRoutineOnceDate] = useState(fmt(new Date()));

  // ── Routine suggestions ──
  interface RoutineSuggestion { title: string; instruction: string; schedule: string; }
  const ROUTINE_SUGGESTIONS_KEY = "gc_routine_suggestions";
  const ROUTINE_SUGGESTIONS_TTL = 12 * 60 * 60 * 1000;

  const readRoutineSuggestionsCache = useCallback((): RoutineSuggestion[] | null => {
    try {
      const raw = localStorage.getItem(ROUTINE_SUGGESTIONS_KEY);
      if (!raw) return null;
      const { suggestions, ts } = JSON.parse(raw) as { suggestions: RoutineSuggestion[]; ts: number };
      if (Date.now() - ts > ROUTINE_SUGGESTIONS_TTL) return null;
      return suggestions;
    } catch { return null; }
  }, []);

  const writeRoutineSuggestionsCache = useCallback((suggestions: RoutineSuggestion[]) => {
    try {
      localStorage.setItem(ROUTINE_SUGGESTIONS_KEY, JSON.stringify({ suggestions, ts: Date.now() }));
    } catch { /* quota */ }
  }, []);

  const [routineSuggestions, setRoutineSuggestions] = useState<RoutineSuggestion[] | null>(null);
  const [routineSuggestionsLoading, setRoutineSuggestionsLoading] = useState(false);
  const routineSuggestionsRequested = useRef(false);

  useEffect(() => {
    const cached = readRoutineSuggestionsCache();
    if (cached) setRoutineSuggestions(cached);
  }, [readRoutineSuggestionsCache]);

  const fetchRoutineSuggestions = useCallback(async (bypassCache = false) => {
    if (!settings.apiKey) return;
    if (!bypassCache) {
      const cached = readRoutineSuggestionsCache();
      if (cached) { setRoutineSuggestions(cached); return; }
    }
    setRoutineSuggestionsLoading(true);
    try {
      const res = await fetch("/api/routine-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: settings.apiKey, model: settings.lightModel || settings.model }),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.suggestions) && data.suggestions.length >= 4) {
          setRoutineSuggestions(data.suggestions);
          writeRoutineSuggestionsCache(data.suggestions);
        }
      }
    } catch { /* ignore */ }
    setRoutineSuggestionsLoading(false);
  }, [settings.apiKey, settings.lightModel, settings.model, readRoutineSuggestionsCache, writeRoutineSuggestionsCache]);

  useEffect(() => {
    if (settings.apiKey && !routineSuggestionsRequested.current) {
      routineSuggestionsRequested.current = true;
      fetchRoutineSuggestions();
    }
  }, [settings.apiKey, fetchRoutineSuggestions]);

  function applyRoutineSuggestion(s: RoutineSuggestion) {
    setRoutineInstruction(s.instruction);
    setRoutineScheduleType(s.schedule as RoutineSchedule["type"]);
    setRoutineTime("09:00");
    setShowRoutineForm(true);
    setRoutineEditId(null);
  }

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

  useEffect(() => {
    if (scrollToTop && containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [scrollToTop]);

  useEffect(() => {
    if (removedThreadId) {
      setBriefingSections((prev) =>
        prev.map((s) =>
          s.title === "Inbox"
            ? { ...s, items: s.items.filter((i) => i.threadId !== removedThreadId && i.id !== removedThreadId) }
            : s,
        ),
      );
      onRemovedThreadHandled?.();
    }
  }, [removedThreadId, onRemovedThreadHandled]);

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

  const briefingTimestampRef = useRef<number | null>(null);
  useEffect(() => {
    briefingTimestampRef.current = briefingTimestamp;
  }, [briefingTimestamp]);

  const activeThreadIdRef = useRef(activeThreadId);
  useEffect(() => { activeThreadIdRef.current = activeThreadId; }, [activeThreadId]);

  useEffect(() => {
    const handler = () => {
      if (document.hidden) return;
      if (activeThreadIdRef.current) return;
      const staleMins = settings.briefingStaleMinutes ?? 2;
      const lastFetch = briefingTimestampRef.current;
      if (staleMins > 0 && lastFetch && Date.now() - lastFetch >= staleMins * 60_000) {
        fetchBriefing(true);
      }
    };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, [settings.briefingStaleMinutes, fetchBriefing]);

  // Periodic staleness check while tab is visible (complements the tab-return check)
  useEffect(() => {
    const staleMins = settings.briefingStaleMinutes ?? 2;
    if (staleMins <= 0) return;
    const id = setInterval(() => {
      if (document.hidden) return;
      if (activeThreadIdRef.current) return;
      const lastFetch = briefingTimestampRef.current;
      if (lastFetch && Date.now() - lastFetch >= staleMins * 60_000) {
        fetchBriefing(true);
      }
    }, 30_000);
    return () => clearInterval(id);
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

  const fetchEmailPreview = useCallback(async (threadId: string) => {
    if (emailPreviews[threadId]) return;
    setEmailPreviews((prev) => ({ ...prev, [threadId]: { from: "", to: "", cc: "", bodyPreview: "", loading: true } }));
    try {
      const res = await fetch(`/api/email/preview?threadId=${threadId}`);
      if (res.ok) {
        const data = await res.json();
        setEmailPreviews((prev) => ({ ...prev, [threadId]: { ...data, loading: false } }));
      } else {
        setEmailPreviews((prev) => ({ ...prev, [threadId]: { from: "", to: "", cc: "", bodyPreview: "", loading: false } }));
      }
    } catch {
      setEmailPreviews((prev) => ({ ...prev, [threadId]: { from: "", to: "", cc: "", bodyPreview: "", loading: false } }));
    }
  }, [emailPreviews]);

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

  const reportSpam = async (threadId: string) => {
    try {
      await fetch("/api/briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "spam", threadId }),
      });
      setBriefingSections((prev) =>
        prev.map((s) =>
          s.title === "Inbox"
            ? { ...s, items: s.items.filter((i) => i.threadId !== threadId && i.id !== threadId) }
            : s,
        ),
      );
      setSpamConfirmId(null);
      setHoveredEmailId(null);
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
        body: JSON.stringify({ startDate: start, endDate: end, apiKey: settings.apiKey, model: settings.lightModel || settings.model }),
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
  }, [settings.apiKey, settings.lightModel, settings.model]);

  useEffect(() => {
    if (!recapAutoLoadedRef.current) {
      recapAutoLoadedRef.current = true;
      const now = new Date();
      if (now.getDay() <= 1) {
        setRecapPreset("last-week");
      }
    }
  }, [settings.apiKey, generateRecap]);

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

  const emailSection = briefingSections.find((s) => s.title === "Inbox");
  const calendarSection = briefingSections.find((s) => s.title === "Today's Events");
  const driveSection = briefingSections.find((s) => s.title === "Recent Files");

  return (
    <div ref={containerRef} className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 xl:px-16 py-8 space-y-12">

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
              onClick={() => {
                setRefreshAllLoading(true);
                fetchBriefing(true).finally(() => setRefreshAllLoading(false));
              }}
              disabled={refreshAllLoading}
              className="ml-auto flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-accent/10 transition-all text-text-muted hover:text-accent cursor-pointer disabled:opacity-40"
              title="Refresh all sections"
            >
              <RefreshCw size={14} className={refreshAllLoading ? "animate-refresh" : ""} />
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
                      const preview = emailPreviews[tid];
                      return (
                        <li
                          key={item.id}
                          className="group relative"
                          onMouseEnter={() => { setHoveredEmailId(tid); fetchEmailPreview(tid); }}
                          onMouseLeave={() => { setHoveredEmailId(null); setSpamConfirmId(null); }}
                        >
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpenThread?.(tid)}
                            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenThread?.(tid); } }}
                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer text-left ${
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
                            <div className="shrink-0 flex flex-col items-end gap-0.5 ml-2">
                              {item.date && (
                                <span className={`text-[10px] tabular-nums leading-none ${item.isUnread ? "text-text-secondary font-medium" : "text-text-muted/60"}`}>
                                  {formatEmailDate(item.date)}
                                </span>
                              )}
                              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setSnoozeCustom(false); setSnoozeOpenId(snoozeOpenId === tid ? null : tid); }}
                                  className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-accent transition-all cursor-pointer"
                                  title="Snooze"
                                >
                                  <AlarmClock size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); archiveEmail(tid); }}
                                  className="p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-accent transition-all cursor-pointer"
                                  title="Archive"
                                >
                                  <Archive size={12} />
                                </button>
                              </div>
                            </div>
                          </div>

                          {hoveredEmailId === tid && (
                            <div
                              className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-secondary border border-border rounded-xl shadow-xl p-4 space-y-3 min-w-[320px] overflow-hidden"
                              onMouseEnter={() => setHoveredEmailId(tid)}
                              onMouseLeave={() => setHoveredEmailId(null)}
                            >
                              {preview?.loading ? (
                                <div className="flex items-center gap-2 text-text-muted text-xs py-2">
                                  <Loader2 size={12} className="animate-spin" />
                                  Loading preview...
                                </div>
                              ) : preview ? (
                                <>
                                  {(() => {
                                    function parseHeader(raw: string) {
                                      return raw.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map((part) => {
                                        const trimmed = part.trim();
                                        const m = trimmed.match(/^"?(.+?)"?\s*<([^>]+)>$/);
                                        return { name: m ? m[1].replace(/"/g, "").trim() : "", email: m ? m[2] : trimmed };
                                      }).filter((r) => r.email);
                                    }
                                    return (
                                      <div className="space-y-1.5">
                                        {preview.from && (
                                          <div className="flex items-start gap-2">
                                            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider shrink-0 mt-0.5 w-8">From</span>
                                            <div className="flex flex-wrap gap-1">
                                              {parseHeader(preview.from).map((r, i) => (
                                                <span key={i} className="text-[11px] text-text font-medium bg-bg-tertiary px-1.5 py-0.5 rounded">
                                                  {r.name && r.name !== r.email ? r.name + " " : ""}<span className="text-text-muted font-normal">{r.email}</span>
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {preview.to && (
                                          <div className="flex items-start gap-2">
                                            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider shrink-0 mt-0.5 w-8">To</span>
                                            <div className="flex flex-wrap gap-1">
                                              {parseHeader(preview.to).map((r, i) => (
                                                <span key={i} className="text-[11px] text-text bg-bg-tertiary px-1.5 py-0.5 rounded">
                                                  {r.name && r.name !== r.email ? r.name + " " : ""}<span className="text-text-muted">{r.email}</span>
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                        {preview.cc && (
                                          <div className="flex items-start gap-2">
                                            <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider shrink-0 mt-0.5 w-8">Cc</span>
                                            <div className="flex flex-wrap gap-1">
                                              {parseHeader(preview.cc).map((r, i) => (
                                                <span key={i} className="text-[11px] text-text bg-bg-tertiary px-1.5 py-0.5 rounded">
                                                  {r.name && r.name !== r.email ? r.name + " " : ""}<span className="text-text-muted">{r.email}</span>
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  {preview.bodyPreview && (
                                    <div className="border-t border-border pt-3">
                                      <p className="text-[11px] text-text-secondary whitespace-pre-wrap break-words leading-relaxed max-h-48 overflow-y-auto overflow-x-hidden">
                                        {preview.bodyPreview}
                                      </p>
                                    </div>
                                  )}
                                  <div className="border-t border-border pt-2 flex items-center justify-between">
                                    <a
                                      href={item.url || `https://mail.google.com/mail/u/0/#inbox/${tid}`}
                                      target="_blank"
                                      rel="noopener"
                                      className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-accent hover:bg-accent/10 transition-colors"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <ExternalLink size={11} />
                                      View in Gmail
                                    </a>
                                    {spamConfirmId !== tid ? (
                                      <button
                                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSpamConfirmId(tid); }}
                                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] text-text-muted hover:text-danger hover:bg-danger/10 transition-colors cursor-pointer"
                                      >
                                        <ShieldAlert size={11} />
                                        Report spam
                                      </button>
                                    ) : (
                                      <div className="flex items-center gap-2 px-2 py-1 rounded-lg bg-danger/10 border border-danger/20">
                                        <ShieldAlert size={11} className="text-danger shrink-0" />
                                        <span className="text-[11px] text-danger whitespace-nowrap">Mark as spam?</span>
                                        <button
                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); reportSpam(tid); }}
                                          className="px-2 py-0.5 rounded bg-danger text-white text-[11px] font-medium hover:bg-red-500 transition-colors cursor-pointer"
                                        >
                                          Yes, spam
                                        </button>
                                        <button
                                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSpamConfirmId(null); }}
                                          className="px-2 py-0.5 rounded bg-bg-tertiary text-text-muted text-[11px] hover:bg-bg-hover transition-colors cursor-pointer"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          )}
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

                        const hasAttendees = item.attendees && item.attendees.length > 0;
                        const hasMeet = !!item.meetUrl;
                        const hasDescription = !!item.description;
                        const hasTooltipData = hasAttendees || hasMeet || hasDescription;
                        const minsUntilStart = eventStart ? Math.round((eventStart - now) / 60000) : Infinity;
                        const isSoon = isToday && minsUntilStart >= 0 && minsUntilStart <= 15;

                        let hasExternal = false;
                        if (hasAttendees) {
                          const selfEmail = item.attendees!.find((a) => a.self)?.email;
                          const userDomain = selfEmail?.split("@")[1]?.toLowerCase();
                          if (userDomain && !userDomain.startsWith("gmail.") && !userDomain.startsWith("googlemail.")) {
                            hasExternal = item.attendees!.some(
                              (a) => !a.self && a.email && a.email.split("@")[1]?.toLowerCase() !== userDomain,
                            );
                          }
                        }

                        items.push(
                          <li
                            key={item.id}
                            className="group relative"
                            onMouseEnter={() => hasTooltipData && setHoveredEventId(item.id)}
                            onMouseLeave={() => setHoveredEventId(null)}
                          >
                            <a
                              href={item.url || "https://calendar.google.com"}
                              target="_blank"
                              rel="noopener"
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer ${
                                isSoon ? "bg-accent/10 border border-accent/25 ring-1 ring-accent/15" : ""
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`text-xs truncate flex-1 ${isSoon ? "text-text font-semibold" : "text-text"}`}>{item.text}</p>
                                  {hasMeet && (
                                    <Video size={11} className="shrink-0 text-google-blue" title="Has meeting link" />
                                  )}
                                  {hasExternal && (
                                    <span className="text-[9px] font-medium text-google-yellow bg-google-yellow/10 border border-google-yellow/20 px-1.5 py-0.5 rounded-full shrink-0">
                                      External
                                    </span>
                                  )}
                                  {isSoon && (
                                    <span className="text-[9px] font-semibold text-accent bg-accent/15 px-1.5 py-0.5 rounded-full shrink-0 animate-pulse">
                                      {minsUntilStart <= 1 ? "Now" : `${minsUntilStart}m`}
                                    </span>
                                  )}
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

                            {hasTooltipData && hoveredEventId === item.id && (
                              <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-secondary border border-border rounded-xl shadow-xl p-3 space-y-2 min-w-[260px]"
                                onMouseEnter={() => setHoveredEventId(item.id)}
                                onMouseLeave={() => setHoveredEventId(null)}
                              >
                                {hasMeet && (
                                  <a
                                    href={item.meetUrl}
                                    target="_blank"
                                    rel="noopener"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-google-blue/10 border border-google-blue/20 hover:bg-google-blue/20 transition-colors"
                                  >
                                    <Video size={14} className="text-google-blue shrink-0" />
                                    <span className="text-xs font-medium text-google-blue">Join meeting</span>
                                    <ExternalLink size={9} className="text-google-blue/60 ml-auto shrink-0" />
                                  </a>
                                )}
                                {hasDescription && (
                                  <div className={hasMeet || hasAttendees ? "pb-1" : ""}>
                                    <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-1">Description</p>
                                    <p className="text-[11px] text-text-secondary leading-relaxed whitespace-pre-wrap break-words line-clamp-6">{item.description}</p>
                                  </div>
                                )}
                                {item.organizer && (
                                  <div className="flex items-center gap-2 pb-2 border-b border-border">
                                    <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Organizer</span>
                                    <span className="text-[11px] text-text">{item.organizer.name}</span>
                                    {item.organizer.email && item.organizer.name !== item.organizer.email && (
                                      <span className="text-[10px] text-text-muted">{item.organizer.email}</span>
                                    )}
                                  </div>
                                )}
                                {hasAttendees && (
                                  <div className="space-y-1">
                                    {(() => {
                                      const selfDomain = item.attendees!.find((a) => a.self)?.email?.split("@")[1]?.toLowerCase();
                                      const isOrgDomain = selfDomain && !selfDomain.startsWith("gmail.") && !selfDomain.startsWith("googlemail.");
                                      return [...item.attendees!].sort((a, b) => (b.organizer ? 1 : 0) - (a.organizer ? 1 : 0)).map((a) => {
                                        const isExternal = isOrgDomain && !a.self && a.email?.split("@")[1]?.toLowerCase() !== selfDomain;
                                        return (
                                          <div key={a.email} className="flex items-center gap-2">
                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                              a.status === "accepted" ? "bg-success" :
                                              a.status === "declined" ? "bg-danger" :
                                              a.status === "tentative" ? "bg-google-yellow" :
                                              "bg-text-muted/40"
                                            }`} />
                                            <span className="text-[11px] text-text truncate flex-1">
                                              {a.name}
                                              {a.self && <span className="text-text-muted ml-1">(you)</span>}
                                              {a.organizer && <span className="text-accent ml-1 text-[10px]">organizer</span>}
                                              {isExternal && <span className="text-google-yellow ml-1 text-[9px]">external</span>}
                                            </span>
                                            <span className={`text-[10px] shrink-0 ${
                                              a.status === "accepted" ? "text-success" :
                                              a.status === "declined" ? "text-danger" :
                                              a.status === "tentative" ? "text-google-yellow" :
                                              "text-text-muted"
                                            }`}>
                                              {a.status === "accepted" ? "Accepted" :
                                               a.status === "declined" ? "Declined" :
                                               a.status === "tentative" ? "Maybe" :
                                               "No response"}
                                            </span>
                                          </div>
                                        );
                                      });
                                    })()}
                                  </div>
                                )}
                              </div>
                            )}
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
                <p className="text-[11px] text-text-muted/60 mt-1">Pick an idea below or create your own</p>
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

          {/* Routine ideas */}
          <div className="mt-3">
            <div className="flex items-center gap-2 mb-2">
              <Lightbulb size={13} className="text-amber-400" />
              <span className="text-xs font-medium text-text-secondary">Ideas for you</span>
              {routineSuggestionsLoading && <Loader2 size={11} className="animate-spin text-text-muted" />}
              <button
                onClick={() => { setRoutineSuggestions(null); routineSuggestionsRequested.current = false; fetchRoutineSuggestions(true); }}
                className="ml-auto flex items-center gap-1 text-[10px] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
                title="Refresh ideas"
              >
                <Sparkles size={10} />
                New ideas
              </button>
            </div>
            {routineSuggestionsLoading && !routineSuggestions ? (
              <div className="grid grid-cols-2 gap-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className="rounded-xl border border-border bg-bg-tertiary/50 p-3 animate-pulse h-[72px]" />
                ))}
              </div>
            ) : routineSuggestions && routineSuggestions.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {routineSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => applyRoutineSuggestion(s)}
                    className="group/idea text-left rounded-xl border border-border hover:border-accent/30 bg-bg-tertiary/30 hover:bg-accent/5 p-3 transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-accent/70">{s.schedule}</span>
                    </div>
                    <p className="text-xs font-medium text-text group-hover/idea:text-accent transition-colors leading-snug">{s.title}</p>
                    <p className="text-[11px] text-text-muted mt-0.5 line-clamp-2 leading-snug">{s.instruction}</p>
                  </button>
                ))}
              </div>
            ) : !routineSuggestionsLoading ? (
              <button
                onClick={() => fetchRoutineSuggestions()}
                className="w-full rounded-xl border border-dashed border-border hover:border-accent/30 p-4 text-center transition-all cursor-pointer group/gen"
              >
                <Sparkles size={16} className="mx-auto mb-1.5 text-text-muted group-hover/gen:text-accent transition-colors" />
                <p className="text-xs text-text-muted group-hover/gen:text-text-secondary transition-colors">Generate routine ideas personalized to your workspace</p>
              </button>
            ) : null}
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
