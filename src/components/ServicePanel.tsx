"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import {
  X,
  Search,
  Loader2,
  ExternalLink,
  FileSpreadsheet,
  Mail,
  Calendar,
  HardDrive,
  FileText,
  CheckSquare,
  Users,
  CornerDownLeft,
} from "lucide-react";

interface ServiceItem {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  date?: string;
}

const SERVICE_META: Record<string, { label: string; icon: typeof Mail; color: string; placeholder: string }> = {
  sheets: { label: "Google Sheets", icon: FileSpreadsheet, color: "text-google-green", placeholder: "Filter or search spreadsheets..." },
  gmail: { label: "Gmail", icon: Mail, color: "text-google-red", placeholder: "Filter or search emails..." },
  calendar: { label: "Calendar", icon: Calendar, color: "text-google-blue", placeholder: "Filter or search events..." },
  drive: { label: "Google Drive", icon: HardDrive, color: "text-google-yellow", placeholder: "Filter or search files..." },
  docs: { label: "Google Docs", icon: FileText, color: "text-google-blue", placeholder: "Filter or search documents..." },
  tasks: { label: "Tasks", icon: CheckSquare, color: "text-google-green", placeholder: "Filter or search tasks..." },
  contacts: { label: "Contacts", icon: Users, color: "text-google-red", placeholder: "Filter or search contacts..." },
};

interface Props {
  service: string | null;
  onClose: () => void;
  onSelectItem: (draft: string) => void;
}

export default function ServicePanel({ service, onClose, onSelectItem }: Props) {
  const [recentItems, setRecentItems] = useState<ServiceItem[]>([]);
  const [searchResults, setSearchResults] = useState<ServiceItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Load recent items when service changes
  useEffect(() => {
    if (!service) return;
    setRecentItems([]);
    setSearchResults(null);
    setSearch("");
    setLoading(true);

    fetch(`/api/services?service=${service}`)
      .then((r) => r.json())
      .then((data) => setRecentItems(data.items || []))
      .catch(() => setRecentItems([]))
      .finally(() => setLoading(false));

    setTimeout(() => searchRef.current?.focus(), 100);
  }, [service]);

  // Close on click outside
  useEffect(() => {
    if (!service) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [service, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!service) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [service, onClose]);

  // Client-side filter of recent items
  const filteredItems = useMemo(() => {
    if (!search.trim()) return recentItems;
    const q = search.toLowerCase();
    return recentItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        (item.subtitle || "").toLowerCase().includes(q) ||
        (item.date || "").toLowerCase().includes(q),
    );
  }, [recentItems, search]);

  // The items to display: search results if we've searched, otherwise filtered recent
  const displayItems = searchResults !== null ? searchResults : filteredItems;
  const isShowingSearchResults = searchResults !== null;

  if (!service) return null;

  const meta = SERVICE_META[service];
  if (!meta) return null;

  const Icon = meta.icon;

  // Full server-side search via gog
  const handleServerSearch = async () => {
    const q = search.trim();
    if (!q) {
      setSearchResults(null);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/services?service=${service}&query=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSearchResults(data.items || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    if (!value.trim()) {
      setSearchResults(null);
    }
  };

  const handleItemClick = (item: ServiceItem) => {
    const ref = item.url ? `[${item.title}](${item.url})` : `"${item.title}"`;
    const draft = `Re: ${ref} — `;
    onSelectItem(draft);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-black/30 backdrop-blur-sm">
      <div
        ref={panelRef}
        className="w-full max-w-lg bg-bg-secondary border border-border rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Icon size={18} className={meta.color} />
          <span className="font-medium text-sm">{meta.label}</span>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-bg-hover text-text-muted transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-4 py-3 border-b border-border">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleServerSearch();
              }}
              placeholder={meta.placeholder}
              className="w-full bg-bg-tertiary border border-border rounded-xl pl-9 pr-20 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:border-accent transition-colors"
            />
            {search.trim() && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-text-muted text-[10px]">
                <CornerDownLeft size={10} />
                <span>search</span>
              </div>
            )}
          </div>
        </div>

        {/* Items list */}
        <div className="max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
              <Loader2 size={16} className="animate-spin" />
              Loading recent items...
            </div>
          ) : searching ? (
            <div className="flex items-center justify-center gap-2 py-8 text-text-muted text-sm">
              <Loader2 size={16} className="animate-spin" />
              Searching...
            </div>
          ) : displayItems.length === 0 ? (
            <div className="text-center py-8 text-text-muted text-sm">
              {search.trim()
                ? isShowingSearchResults
                  ? "No results found"
                  : "No matches — press Enter to search with Google"
                : "No recent items found"}
            </div>
          ) : (
            <>
              <div className="px-4 pt-2 pb-1 text-[10px] font-medium text-text-muted uppercase tracking-wider">
                {isShowingSearchResults
                  ? `Search results (${displayItems.length})`
                  : search.trim()
                    ? `Filtered (${displayItems.length} of ${recentItems.length})`
                    : "Recently opened"}
              </div>
              {displayItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="group flex items-center gap-3 px-4 py-2.5 hover:bg-bg-hover cursor-pointer transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text truncate">{item.title}</div>
                    {(item.subtitle || item.date) && (
                      <div className="text-[11px] text-text-muted truncate">
                        {item.date || item.subtitle}
                      </div>
                    )}
                  </div>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      title="Open in Google"
                      className="p-1.5 rounded-md hover:bg-bg-tertiary text-text-muted opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t border-border">
          <p className="text-[10px] text-text-muted text-center">
                  Type to filter &middot; Enter to search Google &middot; Click to reference in chat &middot; <ExternalLink size={9} className="inline" /> to open
          </p>
        </div>
      </div>
    </div>
  );
}
