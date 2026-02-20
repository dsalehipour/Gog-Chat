"use client";

import { useState, useRef, useEffect } from "react";
import {
  X,
  Loader2,
  ExternalLink,
  Mail,
  Calendar,
  HardDrive,
  FileText,
  FileSpreadsheet,
  CheckSquare,
  Users,
  type LucideIcon,
} from "lucide-react";

interface ServiceItem {
  id: string;
  title: string;
  subtitle?: string;
  url?: string;
  date?: string;
}

interface Props {
  open: boolean;
  initialQuery: string;
  onClose: () => void;
  onSelectItem: (draft: string) => void;
}

const SERVICE_META: Record<string, { icon: LucideIcon; label: string; color: string }> = {
  sheets: { icon: FileSpreadsheet, label: "Sheets", color: "text-google-green" },
  gmail: { icon: Mail, label: "Gmail", color: "text-google-red" },
  calendar: { icon: Calendar, label: "Calendar", color: "text-google-blue" },
  drive: { icon: HardDrive, label: "Drive", color: "text-google-yellow" },
  docs: { icon: FileText, label: "Docs", color: "text-google-blue" },
  tasks: { icon: CheckSquare, label: "Tasks", color: "text-google-green" },
  contacts: { icon: Users, label: "Contacts", color: "text-google-red" },
};

const ALL_SERVICES = ["gmail", "calendar", "drive", "sheets", "docs", "tasks", "contacts"];

export default function UnifiedSearchPanel({
  open,
  initialQuery,
  onClose,
  onSelectItem,
}: Props) {
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<Record<string, ServiceItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      if (initialQuery) {
        doSearch(initialQuery);
      }
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setResults({});
      setSearched(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialQuery]);

  async function doSearch(q: string) {
    if (!q.trim()) return;
    setLoading(true);
    setSearched(true);

    const fetchPromises = ALL_SERVICES.map(async (service) => {
      try {
        const res = await fetch(
          `/api/services?service=${service}&query=${encodeURIComponent(q)}`,
        );
        if (res.ok) {
          const data = await res.json();
          return { service, items: data.items || [] };
        }
      } catch {
        // skip failed services
      }
      return { service, items: [] };
    });

    const settled = await Promise.all(fetchPromises);
    const grouped: Record<string, ServiceItem[]> = {};
    for (const { service, items } of settled) {
      if (items.length > 0) {
        grouped[service] = items;
      }
    }
    setResults(grouped);
    setLoading(false);
  }

  if (!open) return null;

  const totalResults = Object.values(results).reduce((n, arr) => n + arr.length, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-secondary border border-border rounded-2xl w-full max-w-2xl max-h-[70vh] flex flex-col animate-fade-in shadow-2xl">
        {/* Search header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) doSearch(query.trim());
              if (e.key === "Escape") onClose();
            }}
            placeholder="Search across all Google services..."
            className="flex-1 bg-transparent text-text placeholder:text-text-muted focus:outline-none text-sm"
          />
          {loading && <Loader2 size={16} className="animate-spin text-accent" />}
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-text transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-4">
          {!searched && !loading && (
            <p className="text-center text-sm text-text-muted py-8">
              Type a query and press Enter to search Gmail, Calendar, Drive, Sheets, Docs, Tasks, and Contacts.
            </p>
          )}

          {searched && !loading && totalResults === 0 && (
            <p className="text-center text-sm text-text-muted py-8">
              No results found for &ldquo;{query}&rdquo;
            </p>
          )}

          {Object.entries(results).map(([service, items]) => {
            const meta = SERVICE_META[service];
            if (!meta || items.length === 0) return null;
            const Icon = meta.icon;

            return (
              <div key={service} className="mb-4">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-text-secondary uppercase tracking-wider">
                  <Icon size={13} className={meta.color} />
                  {meta.label}
                  <span className="text-text-muted font-normal">({items.length})</span>
                </div>
                <div className="space-y-0.5">
                  {items.slice(0, 8).map((item) => (
                    <div
                      key={item.id}
                      className="group flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer"
                      onClick={() => {
                        const ref = item.url
                          ? `Re: [${item.title}](${item.url})`
                          : `Re: ${item.title}`;
                        onSelectItem(ref + " — ");
                      }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-text truncate">{item.title}</p>
                        {item.subtitle && (
                          <p className="text-xs text-text-muted truncate">
                            {item.subtitle}
                          </p>
                        )}
                      </div>
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener"
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-bg-tertiary text-text-muted hover:text-accent transition-all"
                        >
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {searched && totalResults > 0 && (
          <div className="px-5 py-2.5 border-t border-border text-[11px] text-text-muted text-center">
            Click an item to reference it in chat
          </div>
        )}
      </div>
    </div>
  );
}
