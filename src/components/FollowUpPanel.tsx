"use client";

import { useState } from "react";
import {
  X,
  ListChecks,
  Plus,
  Check,
  Clock,
  Trash2,
  Loader2,
  Sparkles,
  RotateCcw,
} from "lucide-react";
import type { FollowUp } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  followUps: FollowUp[];
  onUpdate: (followUps: FollowUp[]) => void;
  apiKey: string;
  model: string;
}

export default function FollowUpPanel({
  open,
  onClose,
  followUps,
  onUpdate,
  apiKey,
  model,
}: Props) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState<"pending" | "done" | "all">("pending");

  if (!open) return null;

  const filtered = followUps.filter((f) => {
    if (filter === "all") return true;
    return f.status === filter;
  });

  const pending = followUps.filter((f) => f.status === "pending");

  function addFollowUp() {
    if (!newTitle.trim()) return;
    const fu: FollowUp = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: newTitle.trim(),
      source: "manual",
      dueDate: newDue ? new Date(newDue).getTime() : undefined,
      status: "pending",
      notes: newNotes.trim() || undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    onUpdate([fu, ...followUps]);
    setNewTitle("");
    setNewDue("");
    setNewNotes("");
    setShowAdd(false);
  }

  function toggleStatus(id: string) {
    onUpdate(
      followUps.map((f) =>
        f.id === id
          ? { ...f, status: f.status === "done" ? "pending" : "done", updatedAt: Date.now() }
          : f,
      ),
    );
  }

  function removeFollowUp(id: string) {
    onUpdate(followUps.filter((f) => f.id !== id));
  }

  async function scanForFollowUps() {
    if (!apiKey) return;
    setScanning(true);
    try {
      const res = await fetch("/api/followups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model }),
      });
      if (res.ok) {
        const data = await res.json();
        const suggestions = data.suggestions || [];
        const newFollowUps: FollowUp[] = suggestions.map(
          (s: { title: string; source: string; dueDate: string | null; notes: string }) => ({
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            title: s.title,
            source: s.source === "email" || s.source === "calendar" ? s.source : "manual",
            dueDate: s.dueDate ? new Date(s.dueDate).getTime() : undefined,
            status: "pending" as const,
            notes: s.notes,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }),
        );
        if (newFollowUps.length > 0) {
          const existingTitles = new Set(followUps.map((f) => f.title.toLowerCase()));
          const unique = newFollowUps.filter(
            (f) => !existingTitles.has(f.title.toLowerCase()),
          );
          if (unique.length > 0) onUpdate([...unique, ...followUps]);
        }
      }
    } catch {
      // silently fail
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-fade-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <ListChecks size={18} className="text-accent" />
            <h2 className="text-lg font-semibold">Follow-ups</h2>
            {pending.length > 0 && (
              <span className="text-xs bg-accent/15 text-accent px-2 py-0.5 rounded-full font-medium">
                {pending.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Actions bar */}
        <div className="flex items-center gap-2 px-6 py-3 border-b border-border">
          <div className="flex gap-1 flex-1">
            {(["pending", "done", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  filter === f
                    ? "bg-accent/15 text-accent border border-accent/25"
                    : "text-text-secondary hover:bg-bg-hover"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={scanForFollowUps}
            disabled={scanning || !apiKey}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-xs font-medium hover:bg-accent/20 disabled:opacity-40 cursor-pointer transition-all"
            title="AI scan for follow-ups in your emails and calendar"
          >
            {scanning ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            AI Scan
          </button>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="p-1.5 rounded-lg bg-accent/10 text-accent hover:bg-accent/20 cursor-pointer transition-all"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="px-6 py-3 border-b border-border space-y-2 bg-bg-tertiary/30">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addFollowUp()}
              placeholder="What needs follow-up?"
              autoFocus
              className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-sm placeholder:text-text-muted focus:outline-none focus:border-accent transition-all"
            />
            <div className="flex gap-2">
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                className="bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-accent transition-all"
              />
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="flex-1 bg-bg-tertiary border border-border rounded-lg px-3 py-1.5 text-xs placeholder:text-text-muted focus:outline-none focus:border-accent transition-all"
              />
              <button
                onClick={addFollowUp}
                disabled={!newTitle.trim()}
                className="px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-medium hover:bg-accent-hover disabled:opacity-40 cursor-pointer transition-all"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {filtered.length === 0 && (
            <div className="text-center py-8">
              <ListChecks size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
              <p className="text-xs text-text-muted">
                {filter === "pending"
                  ? "No pending follow-ups"
                  : filter === "done"
                    ? "No completed follow-ups"
                    : "No follow-ups yet"}
              </p>
              {filter === "pending" && apiKey && (
                <button
                  onClick={scanForFollowUps}
                  disabled={scanning}
                  className="mt-3 text-xs text-accent hover:text-accent-hover cursor-pointer"
                >
                  Run AI scan to find follow-ups
                </button>
              )}
            </div>
          )}

          {filtered
            .sort((a, b) => {
              if (a.status === "done" && b.status !== "done") return 1;
              if (a.status !== "done" && b.status === "done") return -1;
              if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
              if (a.dueDate && !b.dueDate) return -1;
              return b.createdAt - a.createdAt;
            })
            .map((fu) => (
              <div
                key={fu.id}
                className={`group flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                  fu.status === "done"
                    ? "border-border/50 opacity-60"
                    : "border-border hover:border-accent/20"
                }`}
              >
                <button
                  onClick={() => toggleStatus(fu.id)}
                  className={`mt-0.5 shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center cursor-pointer transition-all ${
                    fu.status === "done"
                      ? "bg-success border-success text-white"
                      : "border-border hover:border-accent"
                  }`}
                >
                  {fu.status === "done" && <Check size={12} />}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${
                      fu.status === "done" ? "line-through text-text-muted" : "text-text"
                    }`}
                  >
                    {fu.title}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {fu.dueDate && (
                      <span className="flex items-center gap-1 text-[10px] text-text-muted">
                        <Clock size={9} />
                        {new Date(fu.dueDate).toLocaleDateString()}
                      </span>
                    )}
                    <span className="text-[10px] text-text-muted capitalize">
                      {fu.source}
                    </span>
                  </div>
                  {fu.notes && (
                    <p className="text-[11px] text-text-muted mt-1">{fu.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  {fu.status === "done" && (
                    <button
                      onClick={() => toggleStatus(fu.id)}
                      className="p-1 rounded hover:bg-bg-hover text-text-muted cursor-pointer"
                      title="Reopen"
                    >
                      <RotateCcw size={12} />
                    </button>
                  )}
                  <button
                    onClick={() => removeFollowUp(fu.id)}
                    className="p-1 rounded hover:bg-bg-hover text-text-muted hover:text-danger cursor-pointer"
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
