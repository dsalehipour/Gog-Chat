"use client";

import { useState } from "react";
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
  theme: "light" | "dark";
  onToggleTheme: () => void;
  syncStatus: SyncStatus;
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
  theme,
  onToggleTheme,
  syncStatus,
}: Props) {
  const [showArchived, setShowArchived] = useState(false);

  const active = conversations.filter((c) => !c.archived);
  const archived = conversations.filter((c) => c.archived);
  const starred = active.filter((c) => c.starred);
  const unstarred = active.filter((c) => !c.starred);

  return (
    <div className="w-64 h-full bg-bg-secondary border-r border-border flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2.5 mb-4">
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

      {/* Quick actions strip */}
      <div className="px-4 py-3 border-b border-border">
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

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-1">
        {active.length === 0 && archived.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare size={24} className="text-text-muted mx-auto mb-2 opacity-40" />
            <p className="text-xs text-text-muted">No conversations yet</p>
          </div>
        )}

        {starred.length > 0 && (
          <>
            <div className="px-2 pt-1 pb-0.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
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
          <div className="px-2 pt-2 pb-0.5 text-[10px] font-medium text-text-muted uppercase tracking-wider">
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
              className="flex items-center gap-1.5 px-2 pt-3 pb-1 text-[10px] font-medium text-text-muted uppercase tracking-wider cursor-pointer hover:text-text-secondary transition-colors w-full"
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
        {/* Sync status */}
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
