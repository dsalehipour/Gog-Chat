"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  Square,
  Sparkles,
  ArrowDown,
  AlertTriangle,
  Settings,
  Star,
  Pencil,
  Archive,
  Check,
  X,
} from "lucide-react";
import MessageBubble from "./MessageBubble";
import type { Message, Settings as SettingsType, Conversation } from "@/lib/types";

interface StreamEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  content?: string;
  tool?: string;
  command?: string;
  output?: string;
  success?: boolean;
  status?: string;
}

interface Props {
  messages: Message[];
  conversation: Conversation | null;
  onSendMessage: (content: string) => void;
  onRename: (title: string) => void;
  onToggleStar: () => void;
  onArchive: () => void;
  settings: SettingsType;
  isStreaming: boolean;
  streamContent: string;
  streamToolCalls: StreamEvent[];
  onStopStreaming: () => void;
  onOpenSettings: () => void;
  gogInstalled: boolean;
  inputValue: string;
  onInputChange: (value: string) => void;
}

export default function ChatInterface({
  messages,
  conversation,
  onSendMessage,
  onRename,
  onToggleStar,
  onArchive,
  settings,
  isStreaming,
  streamContent,
  streamToolCalls,
  onStopStreaming,
  onOpenSettings,
  gogInstalled,
  inputValue,
  onInputChange,
}: Props) {
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent, streamToolCalls, scrollToBottom]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      setShowScrollBtn(distFromBottom > 200);
    };
    el.addEventListener("scroll", handleScroll);
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming) return;
    onSendMessage(trimmed);
    onInputChange("");
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const resizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    const capped = Math.min(el.scrollHeight, 300);
    el.style.height = capped + "px";
    el.style.overflowY = el.scrollHeight > 300 ? "auto" : "hidden";
  };

  const handleInputFieldChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onInputChange(e.target.value);
    resizeTextarea(e.target);
  };

  // Re-measure height when inputValue changes externally (e.g. service panel draft)
  useEffect(() => {
    if (inputRef.current) resizeTextarea(inputRef.current);
  }, [inputValue]);

  const startRename = () => {
    setRenameValue(conversation?.title || "");
    setRenaming(true);
  };

  const confirmRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(trimmed);
    setRenaming(false);
  };

  const confirmArchive = () => {
    onArchive();
    setArchiveConfirm(false);
  };

  const hasApiKey = !!settings.apiKey;

  const SUGGESTIONS = [
    "Show me my unread emails from today",
    "What events do I have this week?",
    "List my recent Google Drive files",
    "Show my task lists",
  ];

  return (
    <div className="flex-1 flex flex-col h-full relative">
      {/* Conversation top bar */}
      {conversation && messages.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-bg-secondary/50 min-h-[44px]">
          {renaming ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="flex-1 min-w-0 bg-bg-tertiary border border-border rounded-lg px-3 py-1 text-sm text-text focus:outline-none focus:border-accent"
              />
              <button
                onClick={confirmRename}
                className="p-1 rounded-lg hover:bg-bg-hover text-success transition-colors cursor-pointer"
                title="Save"
              >
                <Check size={15} />
              </button>
              <button
                onClick={() => setRenaming(false)}
                className="p-1 rounded-lg hover:bg-bg-hover text-text-muted transition-colors cursor-pointer"
                title="Cancel"
              >
                <X size={15} />
              </button>
            </div>
          ) : (
            <>
              <span className="flex-1 truncate text-sm text-text-secondary">
                {conversation.title || "New conversation"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggleStar}
                  className="p-1.5 rounded-lg hover:bg-bg-hover transition-colors cursor-pointer"
                  title={conversation.starred ? "Unstar" : "Star"}
                >
                  <Star
                    size={15}
                    className={
                      conversation.starred
                        ? "text-google-yellow fill-google-yellow"
                        : "text-text-muted"
                    }
                  />
                </button>
                <button
                  onClick={startRename}
                  className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted transition-colors cursor-pointer"
                  title="Rename"
                >
                  <Pencil size={14} />
                </button>
                {archiveConfirm ? (
                  <div className="flex items-center gap-1 ml-1 px-2 py-0.5 rounded-lg bg-danger/10 border border-danger/20">
                    <span className="text-xs text-danger whitespace-nowrap">Archive?</span>
                    <button
                      onClick={confirmArchive}
                      className="p-0.5 rounded hover:bg-danger/20 text-danger transition-colors cursor-pointer"
                      title="Confirm archive"
                    >
                      <Check size={13} />
                    </button>
                    <button
                      onClick={() => setArchiveConfirm(false)}
                      className="p-0.5 rounded hover:bg-bg-hover text-text-muted transition-colors cursor-pointer"
                      title="Cancel"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setArchiveConfirm(true)}
                    className="p-1.5 rounded-lg hover:bg-bg-hover text-text-muted hover:text-danger transition-colors cursor-pointer"
                    title="Archive"
                  >
                    <Archive size={14} />
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Warning banners */}
      {(!hasApiKey || !gogInstalled) && (
        <div className="border-b border-border">
          {!hasApiKey && (
            <div className="flex items-center gap-3 px-6 py-3 bg-warning/5 border-b border-warning/10">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <p className="text-sm text-warning/90 flex-1">
                Add your Anthropic API key to get started.
              </p>
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-warning/10 text-warning text-xs font-medium hover:bg-warning/20 transition-colors"
              >
                <Settings size={12} />
                Settings
              </button>
            </div>
          )}
          {!gogInstalled && (
            <div className="flex items-center gap-3 px-6 py-3 bg-warning/5">
              <AlertTriangle size={16} className="text-warning shrink-0" />
              <p className="text-sm text-warning/90 flex-1">
                gog CLI not detected. Install:{" "}
                <code className="bg-bg-tertiary px-1.5 py-0.5 rounded text-xs">
                  brew install steipete/tap/gogcli
                </code>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Messages area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto py-6 space-y-6"
      >
      <div className="max-w-4xl mx-auto pl-3 pr-4 sm:pl-4 sm:pr-6 lg:pl-6 lg:pr-10 xl:pl-10 xl:pr-16 space-y-6">
        {messages.length === 0 && !isStreaming && (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-google-blue via-google-red to-google-yellow flex items-center justify-center mb-6 shadow-lg">
              <Sparkles size={28} className="text-white" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Gog Chat</h2>
            <p className="text-text-secondary text-sm mb-8 leading-relaxed">
              Manage your Gmail, Calendar, Drive, Docs, Sheets, Tasks, and
              Contacts using natural language.
            </p>
            <div className="grid grid-cols-2 gap-2 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    if (!isStreaming && hasApiKey) onSendMessage(s);
                  }}
                  disabled={!hasApiKey}
                  className="text-left px-3.5 py-3 rounded-xl border border-border hover:border-accent/30 hover:bg-accent/5 transition-all text-xs text-text-secondary hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            toolCalls={msg.toolCalls?.map((tc) => ({
              type: "tool_result" as const,
              command: tc.command,
              output: tc.output,
              success: tc.success,
            }))}
          />
        ))}

        {isStreaming && (
          <MessageBubble
            role="assistant"
            content={streamContent}
            toolCalls={streamToolCalls.filter(
              (tc): tc is typeof tc & { type: "tool_call" | "tool_result" } =>
                tc.type === "tool_call" || tc.type === "tool_result",
            )}
            isStreaming={true}
          />
        )}

        <div ref={messagesEndRef} />
      </div>
      </div>

      {/* Scroll to bottom */}
      {showScrollBtn && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-28 left-1/2 -translate-x-1/2 p-2 rounded-full bg-bg-tertiary border border-border shadow-lg hover:bg-bg-hover transition-all z-10"
        >
          <ArrowDown size={16} className="text-text-secondary" />
        </button>
      )}

      {/* Input area */}
      <div className="border-t border-border-light p-4 bg-bg-secondary">
        <div className="max-w-3xl mx-auto relative">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={handleInputFieldChange}
            onKeyDown={handleKeyDown}
            placeholder={
              hasApiKey
                ? "Ask about your emails, calendar, files..."
                : "Add your API key in Settings to get started..."
            }
            disabled={!hasApiKey}
            rows={1}
            className="w-full bg-input-bg text-input-text border-2 border-input-border rounded-2xl pl-4 pr-14 py-3.5 text-sm resize-none overflow-hidden placeholder:text-input-placeholder focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-black/10"
          />
          <div className="absolute right-3 bottom-3.5">
            {isStreaming ? (
              <button
                onClick={onStopStreaming}
                className="p-2 rounded-xl bg-danger text-white hover:bg-red-500 transition-colors"
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!inputValue.trim() || !hasApiKey}
                className="p-2 rounded-xl bg-accent text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
        <p className="text-center text-[10px] text-text-muted mt-2">
          Powered by {settings.model} &middot; Commands run via gog CLI
        </p>
      </div>
    </div>
  );
}
