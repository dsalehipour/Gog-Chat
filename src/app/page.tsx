"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Sidebar from "@/components/Sidebar";
import ChatInterface from "@/components/ChatInterface";
import DashboardView from "@/components/DashboardView";
import SettingsPanel from "@/components/SettingsPanel";
import ServicePanel from "@/components/ServicePanel";
import UnifiedSearchPanel from "@/components/UnifiedSearchPanel";
import EmailThreadPanel from "@/components/EmailThreadPanel";
import {
  DEFAULT_SETTINGS,
  type Settings,
  type Conversation,
  type Message,
  type ToolExecution,
  type Routine,
  type EmailStyleProfile,
} from "@/lib/types";
import { isDue, getNextRunTime } from "@/lib/scheduler";

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
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (typeof fallback === "object" && fallback !== null && !Array.isArray(fallback)) {
      return { ...fallback, ...parsed };
    }
    return parsed;
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
  // --- Core state ---
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

  // --- Feature state ---
  const [unifiedSearchOpen, setUnifiedSearchOpen] = useState(false);
  const [unifiedSearchQuery, setUnifiedSearchQuery] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [emailStyle, setEmailStyle] = useState<EmailStyleProfile | null>(null);

  // Email thread sidebar
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [removedThreadId, setRemovedThreadId] = useState<string | null>(null);
  const [emailPanelWidth, setEmailPanelWidth] = useState(420);
  const resizingRef = useRef(false);

  // Dashboard scroll-to target
  const [scrollToSection, setScrollToSection] = useState<string | null>(null);
  const [dashScrollTop, setDashScrollTop] = useState(0);

  // --- Refs ---
  const abortRef = useRef<AbortController | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDone = useRef(false);
  const skipNextSync = useRef(false);
  const conversationsRef = useRef<Conversation[]>([]);
  const routineCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevActiveConvIdRef = useRef<string | null>(null);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const newWidth = Math.max(320, Math.min(window.innerWidth - 500, window.innerWidth - e.clientX));
      setEmailPanelWidth(newWidth);
    };
    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    const prevId = prevActiveConvIdRef.current;
    prevActiveConvIdRef.current = activeConvId;
    if (prevId && prevId !== activeConvId) {
      setConversations((prev) => {
        const old = prev.find((c) => c.id === prevId);
        if (old && old.messages.length === 0 && !old.title && !old.starred) {
          return prev.filter((c) => c.id !== prevId);
        }
        return prev;
      });
    }
  }, [activeConvId]);

  // --- Persistence helpers ---
  const backupToServer = useCallback(async (convos: Conversation[]) => {
    try {
      await fetch("/api/conversations/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversations: convos }),
      });
    } catch { /* Silent */ }
  }, []);

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
        skipNextSync.current = true;
        setConversations((prev) => {
          const updated = prev.map((c) => {
            const result = data.results.find(
              (r: { id: string; driveFileId: string }) => r.id === c.id,
            );
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

  const scheduleDriveSync = useCallback(() => {
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => {
      pushToDrive(conversationsRef.current);
    }, 5000);
  }, [pushToDrive]);

  // --- Load persisted state ---
  useEffect(() => {
    const loaded = loadFromStorage<Conversation[]>("gc_conversations", []);
    setSettings(loadFromStorage("gc_settings", DEFAULT_SETTINGS));
    setConversations(loaded);
    setActiveConvId(loadFromStorage("gc_activeConv", null));
    setRoutines(loadFromStorage<Routine[]>("gc_routines", []));
    setEmailStyle(loadFromStorage<EmailStyleProfile | null>("gc_email_style", null));

    const saved = loadFromStorage<"light" | "dark">("gc_theme", "dark");
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);

    if (loaded.length > 0) {
      backupToServer(loaded);
    }

    const savedSettings = loadFromStorage("gc_settings", DEFAULT_SETTINGS);
    if (savedSettings.driveSyncEnabled !== false) {
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
    } else {
      initialLoadDone.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then(setGogStatus)
      .catch(() => setGogStatus({ installed: false }));
  }, []);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    saveToStorage("gc_settings", settings);
  }, [settings]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    saveToStorage("gc_conversations", conversations);
    if (conversations.length > 0) {
      if (skipNextSync.current) {
        skipNextSync.current = false;
        return;
      }
      backupToServer(conversations);
      if (settings.driveSyncEnabled) {
        scheduleDriveSync();
      }
    }
  }, [conversations, backupToServer, scheduleDriveSync, settings.driveSyncEnabled]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    saveToStorage("gc_activeConv", activeConvId);
  }, [activeConvId]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    saveToStorage("gc_routines", routines);
  }, [routines]);

  useEffect(() => {
    if (!initialLoadDone.current) return;
    if (emailStyle) saveToStorage("gc_email_style", emailStyle);
  }, [emailStyle]);

  // --- Routine scheduler ---
  useEffect(() => {
    if (routineCheckRef.current) clearInterval(routineCheckRef.current);

    routineCheckRef.current = setInterval(() => {
      setRoutines((prev) => {
        let changed = false;
        const updated = prev.map((r) => {
          if (!isDue(r)) return r;
          changed = true;

          const convId = generateId();
          const conv: Conversation = {
            id: convId,
            title: `[Routine] ${r.instruction.slice(0, 50)}`,
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          setConversations((c) => [conv, ...c]);
          setActiveConvId(convId);

          setTimeout(() => {
            handleSendMessageDirect(convId, r.instruction);
          }, 500);

          return {
            ...r,
            lastRun: Date.now(),
            nextRun: getNextRunTime({ ...r, lastRun: Date.now() }),
            conversationIds: [...r.conversationIds, convId],
            enabled: r.schedule.type === "once" ? false : r.enabled,
          };
        });
        if (changed) return updated;
        return prev;
      });
    }, 60_000);

    return () => {
      if (routineCheckRef.current) clearInterval(routineCheckRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Conversation helpers ---
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
    const existing = conversations.find(
      (c) => !c.archived && c.messages.length === 0 && !c.title,
    );
    if (existing) {
      setActiveConvId(existing.id);
      return existing.id;
    }
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
  }, [conversations]);

  const handleSendMessageDirect = useCallback(
    async (convId: string, content: string) => {
      const userMessage: Message = {
        id: generateId(),
        role: "user",
        content,
        timestamp: Date.now(),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                title: c.title || content.slice(0, 60),
                messages: [...c.messages, userMessage],
                updatedAt: Date.now(),
              }
            : c,
        ),
      );

      const currentSettings = loadFromStorage("gc_settings", DEFAULT_SETTINGS);
      const apiMessages = [{ role: "user" as const, content }];

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            apiKey: currentSettings.apiKey,
            model: currentSettings.model,
            gogAccount: currentSettings.gogAccount || undefined,
            maxTokens: currentSettings.maxTokens,
            maxIterations: currentSettings.maxIterations,
            maxContextChars: currentSettings.maxContextChars,
            systemPrompt: currentSettings.systemPrompt || undefined,
          }),
        });

        if (!response.ok) return;
        const reader = response.body?.getReader();
        if (!reader) return;

        const decoder = new TextDecoder();
        let accText = "";
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
              const event = JSON.parse(line.slice(6));
              if (event.type === "text") accText += event.content || "";
            } catch { /* skip */ }
          }
        }

        const assistantMessage: Message = {
          id: generateId(),
          role: "assistant",
          content: accText,
          timestamp: Date.now(),
        };

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? { ...c, messages: [...c.messages, assistantMessage], updatedAt: Date.now() }
              : c,
          ),
        );
      } catch { /* silently fail */ }
    },
    [],
  );

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

      updateConversation(convId, (conv) => ({
        ...conv,
        title: conv.title || content.slice(0, 60),
        messages: [...conv.messages, userMessage],
        updatedAt: Date.now(),
      }));

      const currentConv = conversations.find((c) => c.id === convId);
      const allMessages = [...(currentConv?.messages || []), userMessage];
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
            maxTokens: settings.maxTokens,
            maxIterations: settings.maxIterations,
            maxContextChars: settings.maxContextChars,
            systemPrompt: settings.systemPrompt || undefined,
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
            } catch { /* skip */ }
          }
        }

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

  const handleDeleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
      }
    },
    [activeConvId],
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

  // --- Routine: run now ---
  const handleRunRoutineNow = useCallback(
    (instruction: string) => {
      const id = createConversation();
      setActiveConvId(id);
      setTimeout(() => handleSendMessage(instruction), 100);
    },
    [createConversation, handleSendMessage],
  );

  // --- Sidebar nav: scroll to dashboard section ---
  const handleScrollToSection = useCallback(
    (section: string) => {
      if (activeConvId) {
        setActiveConvId(null);
      }
      setTimeout(() => {
        setScrollToSection(section);
      }, 50);
    },
    [activeConvId],
  );

  const showDashboard = !activeConvId;

  return (
    <div className="h-screen flex overflow-hidden">
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={(id) => {
          setActiveConvId(id);
        }}
        onNew={() => {
          createConversation();
        }}
        onRestore={handleRestoreConversation}
        onOpenSettings={() => setSettingsOpen(true)}
        onServiceClick={(key) => setActiveService(key)}
        onScrollToSection={handleScrollToSection}
        onGoHome={() => {
          if (!activeConvId) {
            setDashScrollTop((n) => n + 1);
          }
          setActiveConvId(null);
        }}
        onUnifiedSearch={(query) => {
          setUnifiedSearchQuery(query);
          setUnifiedSearchOpen(true);
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
        syncStatus={syncStatus}
      />

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {showDashboard ? (
            <DashboardView
              settings={settings}
              routines={routines}
              onRoutinesUpdate={setRoutines}
              onRunRoutineNow={handleRunRoutineNow}
              onBriefingItemClick={(text) => {
                const id = createConversation();
                setActiveConvId(id);
                setInputValue(text);
              }}
          onOpenThread={(tid) => setActiveThreadId(tid)}
          activeThreadId={activeThreadId}
          scrollToSection={scrollToSection}
              onScrollHandled={() => setScrollToSection(null)}
              scrollToTop={dashScrollTop}
              removedThreadId={removedThreadId}
              onRemovedThreadHandled={() => setRemovedThreadId(null)}
            />
          ) : (
            <ChatInterface
              messages={activeConversation?.messages || []}
              conversation={activeConversation || null}
              onSendMessage={handleSendMessage}
              onRename={(title) => activeConvId && handleRenameConversation(activeConvId, title)}
              onToggleStar={() => activeConvId && handleToggleStar(activeConvId)}
              onArchive={() => activeConvId && handleArchiveConversation(activeConvId)}
              onDelete={activeConversation?.archived ? () => activeConvId && handleDeleteConversation(activeConvId) : undefined}
              onRestore={activeConversation?.archived ? () => activeConvId && handleRestoreConversation(activeConvId) : undefined}
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
          )}
        </div>

        {activeThreadId && (
          <div className="shrink-0 relative flex" style={{ width: emailPanelWidth }}>
            <div
              className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-10 hover:bg-accent/30 active:bg-accent/40 transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                resizingRef.current = true;
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
            />
            <div className="flex-1 min-w-0">
              <EmailThreadPanel
                threadId={activeThreadId}
                onClose={() => setActiveThreadId(null)}
                onOpenSettings={() => setSettingsOpen(true)}
                settings={settings}
                emailStyle={emailStyle}
                onThreadAction={(tid) => { setRemovedThreadId(tid); setActiveThreadId(null); }}
              />
            </div>
          </div>
        )}
      </div>

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
        emailStyle={emailStyle}
        onStyleUpdate={setEmailStyle}
        onRestoreFromDrive={async (folderId: string) => {
          const res = await fetch("/api/conversations/sync/restore", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ folderId }),
          });
          if (!res.ok) throw new Error("Restore failed");
          const data = await res.json();
          const remote = data.conversations || [];
          if (remote.length > 0) {
            setConversations((prev) => {
              const merged = mergeLocal(prev, remote);
              saveToStorage("gc_conversations", merged);
              return merged;
            });
          }
          return remote.length;
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

      <UnifiedSearchPanel
        open={unifiedSearchOpen}
        initialQuery={unifiedSearchQuery}
        onClose={() => setUnifiedSearchOpen(false)}
        onSelectItem={(draft) => {
          const id = createConversation();
          setActiveConvId(id);
          setInputValue(draft);
          setUnifiedSearchOpen(false);
        }}
      />
    </div>
  );
}
