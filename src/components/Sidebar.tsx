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
  LayoutDashboard,
  ArrowBigUp,
  Command,
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
  onGoHome: () => void;
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


export default function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRestore,
  onOpenSettings,
  onServiceClick,
  onScrollToSection,
  onGoHome,
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
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const active = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);
  const starred = active.filter((c) => c.starred);
  const unstarred = active.filter((c) => !c.starred);

  const totalBadge = followUpCount + draftCount;

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
      if (searchAreaRef.current && !searchAreaRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        onNew();
      } else if (meta && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onGoHome();
      } else if (meta && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => inputRef.current?.focus(), 120);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onNew, onGoHome]);

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
          className="flex items-center gap-2.5 cursor-pointer"
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

      </div>

      {/* Nav + Conversations (single scrollable area) */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        <button
          onClick={() => { setSearchOpen(false); onNew(); }}
          className="group w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text hover:bg-bg-hover transition-all cursor-pointer"
        >
          <Plus size={14} className="shrink-0 opacity-60" />
          <span>New Chat</span>
          <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-text-secondary shadow-sm"><Command size={11} /></kbd>
            <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-text-secondary shadow-sm"><ArrowBigUp size={12} /></kbd>
            <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-[11px] text-text-secondary font-semibold shadow-sm">O</kbd>
          </span>
        </button>
        <button
          onClick={() => { setSearchOpen(false); onGoHome(); }}
          className="group w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text hover:bg-bg-hover transition-all cursor-pointer relative"
        >
          <LayoutDashboard size={14} className="shrink-0 opacity-60" />
          <span>Dashboard</span>
          {totalBadge > 0 ? (
            <span className="ml-auto text-[10px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full font-medium">
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          ) : (
            <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-text-secondary shadow-sm"><Command size={11} /></kbd>
              <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-text-secondary shadow-sm"><ArrowBigUp size={12} /></kbd>
              <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-[11px] text-text-secondary font-semibold shadow-sm">K</kbd>
            </span>
          )}
        </button>

        {/* Search row + expandable panel */}
        <div ref={searchAreaRef} className="relative">
          <button
            onClick={() => {
              setSearchOpen((o) => !o);
              setTimeout(() => inputRef.current?.focus(), 120);
            }}
            className="group w-full flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs text-text-secondary hover:text-text hover:bg-bg-hover transition-all cursor-pointer"
          >
            <Search size={14} className="shrink-0 opacity-60" />
            <span>Search</span>
            <span className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-text-secondary shadow-sm"><Command size={11} /></kbd>
              <kbd className="min-w-[20px] h-[20px] flex items-center justify-center rounded-md bg-bg-tertiary border border-border/80 text-[11px] text-text-secondary font-semibold shadow-sm">K</kbd>
            </span>
          </button>

          <div
            className="overflow-hidden transition-all duration-200 ease-in-out"
            style={{ maxHeight: searchOpen ? "200px" : "0px", opacity: searchOpen ? 1 : 0 }}
          >
            <div className="px-1 pt-1.5 pb-1 space-y-2" ref={searchRef}>
              <div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setSelectedIndex(-1); setDropdownOpen(true); }}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={() => { if (searchQuery.trim()) setDropdownOpen(true); }}
                    placeholder="Search everything..."
                    className="w-full bg-bg-tertiary border border-border rounded-lg pl-7 pr-3 py-1.5 text-xs placeholder:text-text-muted focus:outline-none focus:border-accent/40 transition-all"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between px-0.5">
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
          </div>

          {dropdownOpen && searchResults.length > 0 && (
            <div className="absolute left-1 right-1 bg-bg-secondary border border-border rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto" style={{ top: "calc(100%)" }}>
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
                onClick={() => { setSearchOpen(false); onSelect(conv.id); }}
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
            onClick={() => { setSearchOpen(false); onSelect(conv.id); }}
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
