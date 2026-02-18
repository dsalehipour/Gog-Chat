"use client";

import { useState, useRef, useEffect } from "react";
import {
  Plus,
  MessageSquare,
  Settings,
  Mail,
  Calendar,
  HardDrive,
  FileText,
  FileSpreadsheet,
  CheckSquare,
  Users,
  Sun,
  Moon,
  Star,
  Archive,
  ChevronDown,
  ChevronRight,
  ArchiveRestore,
  Cloud,
  CloudOff,
  Loader2,
  Check,
  Search,
  Sunrise,
  CalendarClock,
  ListChecks,
  Timer,
  PenLine,
} from "lucide-react";
import type { Conversation } from "@/lib/types";
import type { SyncStatus } from "@/app/page";

interface Props {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRestore: (id: string) => void;
  onOpenSettings: () => void;
  onServiceClick: (serviceKey: string) => void;
  onScrollToSection: (section: string) => void;
  onUnifiedSearch: (query: string) => void;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  syncStatus: SyncStatus;
  followUpCount: number;
  draftCount: number;
}

const SERVICE_ICONS = [
  { icon: FileSpreadsheet, label: "Sheets", color: "text-google-green", key: "sheets" },
  { icon: Mail, label: "Gmail", color: "text-google-red", key: "gmail" },
  { icon: Calendar, label: "Calendar", color: "text-google-blue", key: "calendar" },
  { icon: HardDrive, label: "Drive", color: "text-google-yellow", key: "drive" },
  { icon: FileText, label: "Docs", color: "text-google-blue", key: "docs" },
  { icon: CheckSquare, label: "Tasks", color: "text-google-green", key: "tasks" },
  { icon: Users, label: "Contacts", color: "text-google-red", key: "contacts" },
];

const FEATURE_NAV = [
  { icon: Sunrise, label: "Briefing", section: "briefing" },
  { icon: ListChecks, label: "Follow-ups", section: "followups" },
  { icon: PenLine, label: "Drafts", section: "drafts" },
  { icon: Timer, label: "Routines", section: "routines" },
  { icon: CalendarClock, label: "Recap", section: "recap" },
] as const;

export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRestore,
  onOpenSettings,
  onServiceClick,
  onScrollToSection,
  onUnifiedSearch,
  theme,
  onToggleTheme,
  syncStatus,
  followUpCount,
  draftCount,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);
  const starred = active.filter((c) => c.starred);
  const unstarred = active.filter((c) => !c.starred);

  const badgeCounts: Record<string, number> = {
    followups: followUpCount,
    drafts: draftCount,
  };

  const searchResults = searchQuery.trim()
    ? active.filter((c) =>
        (c.title || "New conversation").toLowerCase().includes(searchQuery.toLowerCase()),
      )
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, searchResults.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && selectedIndex < searchResults.length) {
        onSelect(searchResults[selectedIndex].id);
        setSearchQuery("");
        setDropdownOpen(false);
      } else if (searchQuery.trim()) {
        onUnifiedSearch(searchQuery.trim());
        setSearchQuery("");
        setDropdownOpen(false);
      }
    } else if (e.key === "Escape") {
      setDropdownOpen(false);
      setSearchQuery("");
    }
  };

  function highlightMatch(text: string, query: string): React.ReactNode {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-accent/30 text-accent">{text.slice(idx, idx + query.length)}</span>
        {text.slice(idx + query.length)}
      </>
    );
  }

  return (
    <div className="w-64 h-full bg-bg-secondary border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div
          className="flex items-center gap-2.5 mb-4 cursor-pointer"
          onClick={() => onScrollToSection("briefing")}
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-google-blue via-google-red to-google-yellow shadow-sm flex items-center justify-center">
            <span className="text-white font-bold text-sm">G</span>
          </div>
          <div>
            <h1 className="font-semibold text-sm tracking-tight">Gog Chat</h1>
            <p className="text-[10px] text-text-muted">Workspace AI Assistant</p>
          </div>
        </div>

        <button
          onClick={onNew}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 hover:border-accent/30 transition-all text-sm font-medium cursor-pointer"
        >
          <Plus size={16} />
          New Chat
        </button>
      </div>

      {/* Unified Search with conversation dropdown */}
      <div className="px-4 pt-3 pb-1" ref={searchRef}>
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(-1); setDropdownOpen(true); }}
            onKeyDown={handleSearchKeyDown}
            onFocus={() => { if (searchQuery.trim()) setDropdownOpen(true); }}
            placeholder="Search everything..."
            className="w-full bg-bg-tertiary border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs placeholder:text-text-muted focus:outline-none focus:border-accent/40 transition-all"
          />

          {dropdownOpen && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-bg-secondary border border-border rounded-lg shadow-xl z-30 max-h-60 overflow-y-auto">
              {searchResults.slice(0, 10).map((conv, i) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    onSelect(conv.id);
                    setSearchQuery("");
                    setDropdownOpen(false);
                  }}
                  className={`w-full text-left flex items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer ${
                    i === selectedIndex
                      ? "bg-accent/10 text-accent"
                      : "text-text-secondary hover:bg-bg-hover"
                  }`}
                >
                  <MessageSquare size={12} className="shrink-0 opacity-40" />
                  <span className="truncate">
                    {highlightMatch(conv.title || "New conversation", searchQuery)}
                  </span>
                </button>
              ))}
              <div className="border-t border-border px-3 py-2">
                <button
                  onClick={() => {
                    onUnifiedSearch(searchQuery.trim());
                    setSearchQuery("");
                    setDropdownOpen(false);
                  }}
                  className="w-full text-left text-[11px] text-accent hover:text-accent-hover cursor-pointer"
                >
                  Search Google services for &quot;{searchQuery}&quot;...
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Service icons strip */}
      <div className="px-4 py-2 border-b border-border">
        <div className="flex items-center justify-between">
          {SERVICE_ICONS.map(({ icon: Icon, label, color, key }) => (
            <div key={key} className="group relative">
              <button
                onClick={() => onServiceClick(key)}
                className={`p-1.5 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer ${color}`}
              >
                <Icon size={14} />
              </button>
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-bg-tertiary border border-border rounded-md text-[10px] text-text-secondary opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-20">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature nav + Conversations (single scrollable area) */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {FEATURE_NAV.map(({ icon: Icon, label, section }) => (
          <button
            key={section}
            onClick={() => onScrollToSection(section)}
            className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text hover:bg-bg-hover transition-all cursor-pointer relative"
          >
            <Icon size={14} className="shrink-0 opacity-60" />
            <span>{label}</span>
            {(badgeCounts[section] ?? 0) > 0 && (
              <span className="ml-auto text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full font-medium">
                {badgeCounts[section] > 9 ? "9+" : badgeCounts[section]}
              </span>
            )}
          </button>
        ))}
        {active.length === 0 && archived.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
            <p className="text-xs text-text-muted">No conversations yet</p>
          </div>
        )}

        {starred.length > 0 && (
          <>
            <div className="px-2 pt-5 pb-0.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
              Starred
            </div>
            {starred.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl cursor-pointer transition-all text-sm ${
                  conv.id === activeId
                    ? "bg-accent/10 border border-accent/20 text-text"
                    : "hover:bg-bg-hover text-text-secondary hover:text-text border border-transparent"
                }`}
              >
                <Star size={13} className="shrink-0 text-google-yellow fill-google-yellow" />
                <span className="flex-1 truncate text-xs">
                  {conv.title || "New conversation"}
                </span>
              </div>
            ))}
          </>
        )}

        {starred.length > 0 && unstarred.length > 0 && (
          <div className="px-2 pt-5 pb-0.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
            Recent
          </div>
        )}

        {unstarred.map((conv) => (
          <div
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl cursor-pointer transition-all text-sm ${
              conv.id === activeId
                ? "bg-accent/10 border border-accent/20 text-text"
                : "hover:bg-bg-hover text-text-secondary hover:text-text border border-transparent"
            }`}
          >
            <MessageSquare size={13} className="shrink-0 opacity-40" />
            <span className="flex-1 truncate text-xs">
              {conv.title || "New conversation"}
            </span>
          </div>
        ))}

        {/* Archived section */}
        {archived.length > 0 && (
          <>
            <button
              onClick={() => setShowArchived(!showArchived)}
              className="flex items-center gap-1.5 px-2 pt-5 pb-1 text-[10px] font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-secondary transition-colors w-full"
            >
              {showArchived ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              Archived ({archived.length})
            </button>
            {showArchived &&
              archived.map((conv) => (
                <div
                  key={conv.id}
                  className="group flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-sm text-text-muted border border-transparent"
                >
                  <Archive size={13} className="shrink-0 opacity-30" />
                  <span className="flex-1 truncate text-xs opacity-60">
                    {conv.title || "New conversation"}
                  </span>
                  <button
                    onClick={() => onRestore(conv.id)}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-bg-tertiary hover:text-accent transition-all cursor-pointer"
                    title="Restore"
                  >
                    <ArchiveRestore size={12} />
                  </button>
                </div>
              ))}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-border space-y-0.5">
        <div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-text-muted">
          {syncStatus === "syncing" && (
            <>
              <Loader2 size={12} className="animate-spin text-accent" />
              <span>Syncing to Drive...</span>
            </>
          )}
          {syncStatus === "synced" && (
            <>
              <Check size={12} className="text-success" />
              <span className="text-success">Saved to Drive</span>
            </>
          )}
          {syncStatus === "error" && (
            <>
              <CloudOff size={12} className="text-danger" />
              <span className="text-danger">Sync failed</span>
            </>
          )}
          {syncStatus === "idle" && (
            <>
              <Cloud size={12} className="opacity-40" />
              <span>Google Drive backup</span>
            </>
          )}
        </div>
        <button
          onClick={onToggleTheme}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-bg-hover transition-all text-sm text-text-secondary hover:text-text cursor-pointer"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
          {theme === "dark" ? "Light Mode" : "Dark Mode"}
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-bg-hover transition-all text-sm text-text-secondary hover:text-text cursor-pointer"
        >
          <Settings size={15} />
          Settings
        </button>
      </div>
    </div>
  );
}
