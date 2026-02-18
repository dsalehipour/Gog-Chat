"use client";

import { useState } from "react";
import {
  X,
  Timer,
  Plus,
  Trash2,
  Play,
  Pause,
  Clock,
} from "lucide-react";
import type { Routine, RoutineSchedule } from "@/lib/types";
import { getNextRunTime } from "@/lib/scheduler";

interface Props {
  open: boolean;
  onClose: () => void;
  routines: Routine[];
  onUpdate: (routines: Routine[]) => void;
  onRunNow: (instruction: string) => void;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function RoutinesPanel({
  open,
  onClose,
  routines,
  onUpdate,
  onRunNow,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [scheduleType, setScheduleType] = useState<RoutineSchedule["type"]>("daily");
  const [time, setTime] = useState("09:00");
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [onceDate, setOnceDate] = useState(
    new Date().toISOString().split("T")[0],
  );

  if (!open) return null;

  function resetForm() {
    setInstruction("");
    setScheduleType("daily");
    setTime("09:00");
    setDayOfWeek(1);
    setDayOfMonth(1);
    setOnceDate(new Date().toISOString().split("T")[0]);
    setShowAdd(false);
    setEditId(null);
  }

  function saveRoutine() {
    if (!instruction.trim()) return;

    const schedule: RoutineSchedule = {
      type: scheduleType,
      time,
      ...(scheduleType === "weekly" ? { dayOfWeek } : {}),
      ...(scheduleType === "monthly" ? { dayOfMonth } : {}),
      ...(scheduleType === "once" ? { onceDate } : {}),
    };

    if (editId) {
      onUpdate(
        routines.map((r) =>
          r.id === editId
            ? {
                ...r,
                instruction: instruction.trim(),
                schedule,
                nextRun: getNextRunTime({ ...r, schedule }),
              }
            : r,
        ),
      );
    } else {
      const newRoutine: Routine = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        instruction: instruction.trim(),
        schedule,
        enabled: true,
        nextRun: getNextRunTime({
          id: "",
          instruction: "",
          schedule,
          enabled: true,
          nextRun: 0,
          conversationIds: [],
          createdAt: Date.now(),
        }),
        conversationIds: [],
        createdAt: Date.now(),
      };
      onUpdate([newRoutine, ...routines]);
    }
    resetForm();
  }

  function startEdit(r: Routine) {
    setEditId(r.id);
    setInstruction(r.instruction);
    setScheduleType(r.schedule.type);
    setTime(r.schedule.time);
    setDayOfWeek(r.schedule.dayOfWeek ?? 1);
    setDayOfMonth(r.schedule.dayOfMonth ?? 1);
    setOnceDate(r.schedule.onceDate || new Date().toISOString().split("T")[0]);
    setShowAdd(true);
  }

  function toggleEnabled(id: string) {
    onUpdate(
      routines.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r,
      ),
    );
  }

  function removeRoutine(id: string) {
    onUpdate(routines.filter((r) => r.id !== id));
    if (editId === id) resetForm();
  }

  function formatSchedule(r: Routine): string {
    const { schedule: s } = r;
    if (s.type === "once") return `Once on ${s.onceDate} at ${s.time}`;
    if (s.type === "daily") return `Daily at ${s.time}`;
    if (s.type === "weekly")
      return `${DAYS[s.dayOfWeek ?? 0]}s at ${s.time}`;
    if (s.type === "monthly")
      return `${ordinal(s.dayOfMonth ?? 1)} of each month at ${s.time}`;
    return s.type;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Timer size={18} className="text-accent" />
            <h2 className="text-lg font-semibold">Scheduled Routines</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                resetForm();
                setShowAdd(true);
              }}
              className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer transition-all"
            >
              <Plus size={16} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Add/Edit form */}
        {showAdd && (
          <div className="px-6 py-4 border-b border-border space-y-3 bg-bg-tertiary/30">
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="What should the AI do? e.g. 'Summarize my unread emails and list action items'"
              rows={2}
              className="w-full bg-bg-tertiary border border-border rounded-xl px-4 py-2.5 text-sm resize-none placeholder:text-text-muted focus:outline-none focus:border-accent transition-all"
            />
            <div className="flex gap-2 flex-wrap">
              {(["once", "daily", "weekly", "monthly"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setScheduleType(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    scheduleType === t
                      ? "bg-accent/15 text-accent border border-accent/25"
                      : "bg-bg-tertiary border border-border text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex gap-3 items-end">
              <div className="space-y-1">
                <label className="text-[10px] text-text-muted">Time</label>
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all"
                />
              </div>
              {scheduleType === "weekly" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted">Day</label>
                  <select
                    value={dayOfWeek}
                    onChange={(e) => setDayOfWeek(Number(e.target.value))}
                    className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all"
                  >
                    {DAYS.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {scheduleType === "monthly" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted">Day of month</label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(Number(e.target.value))}
                    className="w-20 bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all"
                  />
                </div>
              )}
              {scheduleType === "once" && (
                <div className="space-y-1">
                  <label className="text-[10px] text-text-muted">Date</label>
                  <input
                    type="date"
                    value={onceDate}
                    onChange={(e) => setOnceDate(e.target.value)}
                    className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent transition-all"
                  />
                </div>
              )}
              <button
                onClick={saveRoutine}
                disabled={!instruction.trim()}
                className="px-4 py-1.5 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:opacity-40 cursor-pointer transition-all"
              >
                {editId ? "Save" : "Create"}
              </button>
              <button
                onClick={resetForm}
                className="px-3 py-1.5 rounded-lg text-sm text-text-secondary hover:bg-bg-hover cursor-pointer transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {routines.length === 0 && !showAdd && (
            <div className="text-center py-8">
              <Timer size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">
                No routines set up yet
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="mt-3 text-xs text-accent hover:text-accent-hover cursor-pointer"
              >
                Create your first routine
              </button>
            </div>
          )}

          {routines.map((r) => (
            <div
              key={r.id}
              className={`group rounded-xl border p-3 transition-all ${
                r.enabled
                  ? "border-border hover:border-accent/20"
                  : "border-border/50 opacity-50"
              }`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleEnabled(r.id)}
                  className={`mt-0.5 p-1 rounded-lg cursor-pointer transition-all ${
                    r.enabled
                      ? "text-accent bg-accent/10"
                      : "text-text-muted bg-bg-tertiary"
                  }`}
                  title={r.enabled ? "Pause" : "Resume"}
                >
                  {r.enabled ? <Play size={12} /> : <Pause size={12} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text line-clamp-2">{r.instruction}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="flex items-center gap-1 text-[10px] text-text-muted">
                      <Clock size={9} />
                      {formatSchedule(r)}
                    </span>
                    {r.lastRun && (
                      <span className="text-[10px] text-text-muted">
                        Last: {new Date(r.lastRun).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => onRunNow(r.instruction)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-accent cursor-pointer"
                    title="Run now"
                  >
                    <Play size={12} />
                  </button>
                  <button
                    onClick={() => startEdit(r)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer"
                    title="Edit"
                  >
                    <Clock size={12} />
                  </button>
                  <button
                    onClick={() => removeRoutine(r.id)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-danger cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
