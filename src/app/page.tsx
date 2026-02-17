"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";
import SettingsPanel from "@/components/SettingsPanel";
import ServicePanel from "@/components/ServicePanel";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Conversation,
  type Message,
  type ToolExecution,
} from "@/lib/types";

interface StreamEvent {
  type: "text" | "tool_call" | "tool_result" | "error" | "done";
  content?: string;
  tool?: string;
  command?: string;
  output?: string;
  success?: boolean;
  status?: string;
}

export type SyncStatus = "idle" | "syncing" | "synced" | "error";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function loadFromStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveToStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

function mergeLocal(local: Conversation[], remote: Conversation[]): Conversation[] {
  const merged = new Map<string, Conversation>();
  for (const c of local) merged.set(c.id, c);
  for (const c of remote) {
    const existing = merged.get(c.id);
    if (!existing) {
      merged.set(c.id, c);
    } else if (c.updatedAt > existing.updatedAt) {
      merged.set(c.id, { ...c, driveFileId: c.driveFileId || existing.driveFileId });
    } else {
      merged.set(c.id, { ...existing, driveFileId: c.driveFileId || existing.driveFileId });
    }
  }
  return Array.from(merged.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export default function Home() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [gogStatus, setGogStatus] = useState<{
    installed: boolean;
    version?: string;
    accounts?: string[];
  } | null>(null);

  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [inputValue, setInputValue] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [streamToolCalls, setStreamToolCalls] = useState<StreamEvent[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [activeService, setActiveService] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);
  const skipNextSync = useRef(false);
  const conversationsRef = useRef<Conversation[]>([]);

  // Keep ref in sync for use in callbacks
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  // Backup conversations to server (local file)
  const backupToServer = useCallback(async (convos: Conversation[]) => {
    try {
      await fetch("/api/conversations/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations: convos }),
      });
    } catch {
      // Silent fail for backup - localStorage is still primary
    }
  }, []);

  // Push changed conversations to Google Drive
  const pushToDrive = useCallback(async (convos: Conversation[]) => {
    const withMessages = convos.filter((c) => c.messages.length > 0);
    if (withMessages.length === 0) return;

    setSyncStatus("syncing");
    try {
      const res = await fetch("/api/conversations/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations: withMessages }),
      });

      if (!res.ok) {
        setSyncStatus("error");
        return;
      }

      const data = await res.json();

      if (data.results && Array.isArray(data.results)) {
        // Flag to prevent this metadata-only update from re-triggering sync
        skipNextSync.current = true;
        setConversations((prev) => {
          const updated = prev.map((c) => {
            const result = data.results.find((r: { id: string; driveFileId: string }) => r.id === c.id);
            if (result?.success && result.driveFileId && result.driveFileId !== c.driveFileId) {
              return { ...c, driveFileId: result.driveFileId };
            }
            return c;
          });
          saveToStorage("gc_conversations", updated);
          return updated;
        });
      }

      setSyncStatus("synced");
      setTimeout(() => setSyncStatus("idle"), 3000);
    } catch {
      setSyncStatus("error");
      setTimeout(() => setSyncStatus("idle"), 5000);
    }
  }, []);

  // Debounced sync: schedules a Drive push after changes settle
  const scheduleDriveSync = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      pushToDrive(conversationsRef.current);
    }, 5000);
  }, [pushToDrive]);

  // Load persisted state + initial backup + Drive pull
  useEffect(() => {
    const loaded = loadFromStorage<Conversation[]>("gc_conversations", []);
    setSettings(loadFromStorage("gc_settings", DEFAULT_SETTINGS));
    setConversations(loaded);
    setActiveConvId(loadFromStorage("gc_activeConv", null));
    const saved = loadFromStorage<"light" | "dark">("gc_theme", "dark");
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);

    // Immediately back up to local server file
    if (loaded.length > 0) {
      backupToServer(loaded);
    }

    // Pull from Drive and merge
    (async () => {
      try {
        setSyncStatus("syncing");
        const res = await fetch("/api/conversations/sync");
        if (res.ok) {
          const data = await res.json();
          if (data.conversations && Array.isArray(data.conversations)) {
            skipNextSync.current = true;
            setConversations((prev) => {
              const merged = mergeLocal(prev, data.conversations);
              saveToStorage("gc_conversations", merged);
              backupToServer(merged);
              return merged;
            });
          }
        }
        setSyncStatus("synced");
        setTimeout(() => setSyncStatus("idle"), 3000);
      } catch {
        setSyncStatus("idle");
      }
      initialLoadDone.current = true;
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Check gog status
  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setGogStatus)
      .catch(() => setGogStatus({ installed: false }));
  }, []);

  // Persist changes + schedule Drive sync
  useEffect(() => {
    saveToStorage("gc_settings", settings);
  }, [settings]);

  useEffect(() => {
    saveToStorage("gc_conversations", conversations);
    if (initialLoadDone.current && conversations.length > 0) {
      if (skipNextSync.current) {
        skipNextSync.current = false;
        return;
      }
      backupToServer(conversations);
      scheduleDriveSync();
    }
  }, [conversations, backupToServer, scheduleDriveSync]);

  useEffect(() => {
    saveToStorage("gc_activeConv", activeConvId);
  }, [activeConvId]);

  const activeConversation = conversations.find((c) => c.id === activeConvId);

  const updateConversation = useCallback(
    (id: string, updater: (conv: Conversation) => Conversation) => {
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? updater(c) : c)),
      );
    },
    [],
  );

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      saveToStorage("gc_theme", next);
      return next;
    });
  }, []);

  const createConversation = useCallback((): string => {
    const id = generateId();
    const conv: Conversation = {
      id,
      title: "",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveConvId(id);
    return id;
  }, []);

  const handleSendMessage = useCallback(
    async (content: string) => {
      let convId = activeConvId;
      if (!convId) {
        convId = createConversation();
      }

      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      // Set title from first message
      updateConversation(convId, (conv) => ({
        ...conv,
        title: conv.title || content.slice(0, 60),
        messages: [...conv.messages, userMessage],
        updatedAt: Date.now(),
      }));

      // Prepare conversation history for API
      const currentConv = conversations.find((c) => c.id === convId);
      const allMessages = [
        ...(currentConv?.messages || []),
        userMessage,
      ];
      const apiMessages = allMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      setIsStreaming(true);
      setStreamContent("");
      setStreamToolCalls([]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            apiKey: settings.apiKey,
            model: settings.model,
            gogAccount: settings.gogAccount || undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Request failed");
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response stream");

        const decoder = new TextDecoder();
        let accText = "";
        let accToolCalls: StreamEvent[] = [];
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
              const event: StreamEvent = JSON.parse(line.slice(6));

              switch (event.type) {
                case "text":
                  accText += event.content || "";
                  setStreamContent(accText);
                  break;
                case "tool_call":
                case "tool_result":
                  accToolCalls = [...accToolCalls, event];
                  setStreamToolCalls(accToolCalls);
                  break;
                case "error":
                  accText += `\n\n**Error:** ${event.content}`;
                  setStreamContent(accText);
                  break;
                case "done":
                  break;
              }
            } catch {
              // skip malformed events
            }
          }
        }

        // Build assistant message from accumulated content
        const toolExecs: ToolExecution[] = accToolCalls
          .filter((tc) => tc.type === "tool_result")
          .map((tc) => ({
            command: tc.command || tc.tool || "",
            output: tc.output || "",
            success: tc.success ?? true,
          }));

        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: accText,
          toolCalls: toolExecs.length > 0 ? toolExecs : undefined,
          timestamp: Date.now(),
        };

        updateConversation(convId, (conv) => ({
          ...conv,
          messages: [...conv.messages, assistantMessage],
          updatedAt: Date.now(),
        }));
      } catch (err: unknown) {
        if ((err as Error).name === "AbortError") {
          const assistantMessage: Message = {
            id: generateId(),
            role: "assistant",
            content: streamContent || "(Stopped)",
            timestamp: Date.now(),
          };
          updateConversation(convId, (conv) => ({
            ...conv,
            messages: [...conv.messages, assistantMessage],
            updatedAt: Date.now(),
          }));
        } else {
          const errorMessage: Message = {
            id: generateId(),
            role: "assistant",
            content: `**Error:** ${(err as Error).message || "Something went wrong. Please try again."}`,
            timestamp: Date.now(),
          };
          updateConversation(convId, (conv) => ({
            ...conv,
            messages: [...conv.messages, errorMessage],
            updatedAt: Date.now(),
          }));
        }
      } finally {
        setIsStreaming(false);
        setStreamContent("");
        setStreamToolCalls([]);
        abortRef.current = null;
      }
    },
    [
      activeConvId,
      conversations,
      settings,
      createConversation,
      updateConversation,
      streamContent,
    ],
  );

  const handleArchiveConversation = useCallback(
    (id: string) => {
      updateConversation(id, (conv) => ({
        ...conv,
        archived: true,
        updatedAt: Date.now(),
      }));
      if (activeConvId === id) {
        setActiveConvId(null);
      }
    },
    [activeConvId, updateConversation],
  );

  const handleRestoreConversation = useCallback(
    (id: string) => {
      updateConversation(id, (conv) => ({
        ...conv,
        archived: false,
        updatedAt: Date.now(),
      }));
    },
    [updateConversation],
  );

  const handleServiceClick = useCallback(
    (serviceKey: string) => {
      setActiveService(serviceKey);
    },
    [],
  );

  const handleRenameConversation = useCallback(
    (id: string, title: string) => {
      updateConversation(id, (conv) => ({
        ...conv,
        title,
        updatedAt: Date.now(),
      }));
    },
    [updateConversation],
  );

  const handleToggleStar = useCallback(
    (id: string) => {
      updateConversation(id, (conv) => ({
        ...conv,
        starred: !conv.starred,
        updatedAt: Date.now(),
      }));
    },
    [updateConversation],
  );

  const handleStopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={setActiveConvId}
        onNew={() => {
          const id = createConversation();
          setActiveConvId(id);
        }}
        onRestore={handleRestoreConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        onServiceClick={handleServiceClick}
        theme={theme}
        onToggleTheme={toggleTheme}
        syncStatus={syncStatus}
      />

      <ChatInterface
        messages={activeConversation?.messages || []}
        conversation={activeConversation || null}
        onSendMessage={handleSendMessage}
        onRename={(title) => activeConvId && handleRenameConversation(activeConvId, title)}
        onToggleStar={() => activeConvId && handleToggleStar(activeConvId)}
        onArchive={() => activeConvId && handleArchiveConversation(activeConvId)}
        settings={settings}
        isStreaming={isStreaming}
        streamContent={streamContent}
        streamToolCalls={streamToolCalls}
        onStopStreaming={handleStopStreaming}
        onOpenSettings={() => setSettingsOpen(true)}
        gogInstalled={gogStatus?.installed ?? false}
        inputValue={inputValue}
        onInputChange={setInputValue}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onSave={(s) => {
          setSettings(s);
          setSettingsOpen(false);
        }}
        gogStatus={gogStatus}
        onGogStatusRefresh={() => {
          fetch("/api/status")
            .then((r) => r.json())
            .then(setGogStatus)
            .catch(() => {});
        }}
      />

      <ServicePanel
        service={activeService}
        onClose={() => setActiveService(null)}
        onSelectItem={(draft) => {
          const id = createConversation();
          setActiveConvId(id);
          setInputValue(draft);
          setActiveService(null);
        }}
      />
    </div>
  );
}
