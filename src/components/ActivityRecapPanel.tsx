"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  apiKey: string;
  model: string;
}

type RangePreset = "this-week" | "last-week" | "this-month" | "last-month" | "custom";

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

function fmt(d: Date): string {
  return d.toISOString().split("T")[0];
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "this-week", label: "This Week" },
  { id: "last-week", label: "Last Week" },
  { id: "this-month", label: "This Month" },
  { id: "last-month", label: "Last Month" },
  { id: "custom", label: "Custom" },
];

export default function ActivityRecapPanel({
  open,
  onClose,
  apiKey,
  model,
}: Props) {
  const [preset, setPreset] = useState<RangePreset>("this-week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [customStart, setCustomStart] = useState(fmt(new Date()));
  const [customEnd, setCustomEnd] = useState(fmt(new Date()));
  const [summary, setSummary] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      setSummary("");
      setLoading(false);
    }
  }, [open]);

  if (!open) return null;

  function getRange(): { start: string; end: string; label: string } {
    switch (preset) {
      case "this-week":
        return getWeekRange(weekOffset);
      case "last-week":
        return getWeekRange(weekOffset - 1);
      case "this-month":
        return getMonthRange(monthOffset);
      case "last-month":
        return getMonthRange(monthOffset - 1);
      case "custom":
        return { start: customStart, end: customEnd, label: `${customStart} to ${customEnd}` };
    }
  }

  const range = getRange();

  async function generateRecap() {
    if (!apiKey) return;
    setLoading(true);
    setSummary("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/recap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: range.start,
          endDate: range.end,
          apiKey,
          model,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json();
        setSummary(`**Error:** ${err.error || "Failed to generate recap"}`);
        setLoading(false);
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
              setSummary(acc);
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setSummary(`**Error:** ${(err as Error).message}`);
      }
    } finally {
      setLoading(false);
    }
  }

  const isWeekPreset = preset === "this-week" || preset === "last-week";
  const isMonthPreset = preset === "this-month" || preset === "last-month";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <CalendarClock size={18} className="text-accent" />
            <h2 className="text-lg font-semibold">Activity Recap</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Controls */}
        <div className="px-6 py-4 border-b border-border space-y-3">
          {/* Preset tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setPreset(p.id);
                  setWeekOffset(0);
                  setMonthOffset(0);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  preset === p.id
                    ? "bg-accent/15 text-accent border border-accent/25"
                    : "bg-bg-tertiary border border-border text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {(isWeekPreset || isMonthPreset) && (
                <button
                  onClick={() =>
                    isWeekPreset
                      ? setWeekOffset((o) => o - 1)
                      : setMonthOffset((o) => o - 1)
                  }
                  className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
              )}
              <span className="text-sm font-medium min-w-[200px] text-center">
                {range.label}
              </span>
              {(isWeekPreset || isMonthPreset) && (
                <button
                  onClick={() =>
                    isWeekPreset
                      ? setWeekOffset((o) => o + 1)
                      : setMonthOffset((o) => o + 1)
                  }
                  className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              )}
            </div>

            <button
              onClick={generateRecap}
              disabled={loading || !apiKey}
              className="px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center gap-2"
            >
              {loading ? <Loader2 size={14} className="animate-spin" /> : null}
              {loading ? "Generating..." : "Generate Recap"}
            </button>
          </div>

          {/* Custom date inputs */}
          {preset === "custom" && (
            <div className="flex gap-3">
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">From</label>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">To</label>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="flex-1 overflow-y-auto p-6">
          {!summary && !loading && (
            <p className="text-center text-sm text-text-muted py-8">
              Select a time range and click Generate Recap to see what you accomplished.
            </p>
          )}
          {summary && (
            <div className="message-content prose prose-sm text-text text-sm leading-relaxed">
              <div dangerouslySetInnerHTML={{ __html: renderMarkdown(summary) }} />
            </div>
          )}
          {loading && !summary && (
            <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
              <Loader2 size={16} className="animate-spin" />
              Gathering your activity data...
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$2</h2>')
    .replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-5 mb-2">$1</h2>')
    .replace(/^- (.+)$/gm, '<li class="ml-4 list-disc text-sm">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 list-decimal text-sm">$2</li>')
    .replace(/\n/g, "<br/>");
}
