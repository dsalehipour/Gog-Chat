"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Mail,
  Calendar,
  CheckSquare,
  HardDrive,
  RefreshCw,
  Loader2,
  ExternalLink,
  Sunrise,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

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
  organizer?: { name: string; email: string };
  attendees?: EventAttendee[];
}

interface BriefingSection {
  title: string;
  items: BriefingItem[];
}

interface CachedBriefing {
  sections: BriefingSection[];
  timestamp: number;
}

const SECTION_ICONS: Record<string, LucideIcon> = {
  "Unread Emails": Mail,
  "Today's Events": Calendar,
  "Pending Tasks": CheckSquare,
  "Recent Files": HardDrive,
};

const SECTION_COLORS: Record<string, string> = {
  "Unread Emails": "text-google-red",
  "Today's Events": "text-google-blue",
  "Pending Tasks": "text-google-green",
  "Recent Files": "text-google-yellow",
};

const CACHE_TTL = 5 * 60 * 1000;

interface Props {
  onItemClick: (text: string) => void;
}

export default function BriefingPanel({ onItemClick }: Props) {
  const [briefing, setBriefing] = useState<CachedBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [hoveredEventId, setHoveredEventId] = useState<string | null>(null);

  const fetchBriefing = useCallback(async (force = false) => {
    if (!force && briefing && Date.now() - briefing.timestamp < CACHE_TTL) return;

    setLoading(true);
    try {
      const res = await fetch("/api/briefing");
      if (res.ok) {
        const data = await res.json();
        setBriefing({ sections: data.sections, timestamp: data.timestamp });
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [briefing]);

  useEffect(() => {
    fetchBriefing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto px-4">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-google-blue via-google-red to-google-yellow flex items-center justify-center mb-4 shadow-lg">
        <Sunrise size={28} className="text-white" />
      </div>
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold">Good {getTimeOfDay()}</h2>
        <button
          onClick={() => fetchBriefing(true)}
          disabled={loading}
          className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-text-muted hover:text-text cursor-pointer disabled:opacity-40"
          title="Refresh briefing"
        >
          {loading ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </div>

      {loading && !briefing ? (
        <div className="flex items-center gap-2 text-text-muted text-sm py-8">
          <Loader2 size={16} className="animate-spin" />
          Loading your briefing...
        </div>
      ) : briefing ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full mb-6">
          {briefing.sections.map((section) => {
            const Icon = SECTION_ICONS[section.title] || Mail;
            const color = SECTION_COLORS[section.title] || "text-accent";
            return (
              <div
                key={section.title}
                className="rounded-xl border border-border bg-bg-secondary/50 p-4 space-y-2"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Icon size={15} className={color} />
                  <h3 className="text-sm font-medium">
                    {section.title}
                    {section.items.length > 0 && (
                      <span className="text-text-muted font-normal ml-1.5">
                        ({section.items.length})
                      </span>
                    )}
                  </h3>
                </div>
                {section.items.length === 0 ? (
                  <p className="text-xs text-text-muted">Nothing here</p>
                ) : (
                  <ul className="space-y-1.5">
                    {section.items.slice(0, 5).map((item) => {
                      const isCalendar = section.title.includes("Events");
                      const hasAttendees = isCalendar && item.attendees && item.attendees.length > 0;

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

                      return (
                        <li
                          key={item.id}
                          className="group relative"
                          onMouseEnter={() => hasAttendees && setHoveredEventId(item.id)}
                          onMouseLeave={() => setHoveredEventId(null)}
                        >
                          <button
                            onClick={() =>
                              onItemClick(
                                item.url
                                  ? `Tell me about [${item.text}](${item.url})`
                                  : `Tell me about "${item.text}"`,
                              )
                            }
                            className="w-full text-left flex items-start gap-2 px-2 py-1 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-xs text-text truncate flex-1">
                                  {item.text}
                                </p>
                                {hasExternal && (
                                  <span className="text-[9px] font-medium text-google-yellow bg-google-yellow/10 border border-google-yellow/20 px-1.5 py-0.5 rounded-full shrink-0">
                                    External
                                  </span>
                                )}
                              </div>
                              {item.detail && (
                                <p className="text-[10px] text-text-muted truncate">
                                  {item.detail}
                                </p>
                              )}
                            </div>
                            {item.url && (
                              <a
                                href={item.url}
                                target="_blank"
                                rel="noopener"
                                onClick={(e) => e.stopPropagation()}
                                className="shrink-0 opacity-0 group-hover:opacity-100 p-0.5 text-text-muted hover:text-accent transition-all"
                              >
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </button>
                          {hasAttendees && hoveredEventId === item.id && (
                            <div
                              className="absolute left-0 right-0 top-full mt-1 z-50 bg-bg-secondary border border-border rounded-xl shadow-xl p-3 space-y-2 min-w-[240px]"
                              onMouseEnter={() => setHoveredEventId(item.id)}
                              onMouseLeave={() => setHoveredEventId(null)}
                            >
                              {item.organizer && (
                                <div className="flex items-center gap-2 pb-2 border-b border-border">
                                  <span className="text-[10px] font-medium text-text-muted uppercase tracking-wider">Organizer</span>
                                  <span className="text-[11px] text-text">{item.organizer.name}</span>
                                </div>
                              )}
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
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted mb-6">
          Your daily briefing will appear here.
        </p>
      )}

      <p className="text-xs text-text-muted text-center">
        Ask anything about your Gmail, Calendar, Drive, Sheets, Tasks, and more.
      </p>
    </div>
  );
}

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
