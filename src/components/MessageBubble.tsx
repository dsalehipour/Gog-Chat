"use client";

import { memo, useState, useMemo } from "react";
import {
  User,
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Zap,
} from "lucide-react";

interface ToolCallInfo {
  type: "tool_call" | "tool_result";
  tool?: string;
  command?: string;
  output?: string;
  success?: boolean;
  status?: string;
}

interface Props {
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolCallInfo[];
  isStreaming?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Markdown renderer                                                  */
/* ------------------------------------------------------------------ */

function renderMarkdown(raw: string): string {
  let html = raw;

  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="msg-pre"><code class="language-${lang}">${escapeHtml(code.trimEnd())}</code></pre>`,
    );
    return `\x00CODEBLOCK${idx}\x00`;
  });

  html = html.replace(/`([^`]+)`/g, '<code class="msg-code">$1</code>');

  html = html.replace(
    /(^\|.+\|$\n?)+/gm,
    (block) => {
      const rows = block.trim().split("\n").filter((r) => r.trim());
      if (rows.length < 2) return block;

      const parseRow = (r: string) =>
        r.split("|").slice(1, -1).map((c) => c.trim());

      const headerCells = parseRow(rows[0]);
      const isSep = (r: string) => parseRow(r).every((c) => /^[-:]+$/.test(c));

      let bodyStart = 1;
      if (rows.length >= 2 && isSep(rows[1])) bodyStart = 2;

      const thead = `<thead><tr>${headerCells.map((c) => `<th>${c}</th>`).join("")}</tr></thead>`;
      const tbody = rows
        .slice(bodyStart)
        .map((r) => `<tr>${parseRow(r).map((c) => `<td>${c}</td>`).join("")}</tr>`)
        .join("");

      return `<div class="msg-table-wrap"><table class="msg-table">${thead}<tbody>${tbody}</tbody></table></div>`;
    },
  );

  html = html.replace(/^#### (.*$)/gm, '<h4 class="msg-h4">$1</h4>');
  html = html.replace(/^### (.*$)/gm, '<h3 class="msg-h3">$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2 class="msg-h2">$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1 class="msg-h1">$1</h1>');

  html = html.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");

  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener" class="msg-link">$1</a>',
  );

  html = html.replace(
    /^> (.*$)/gm,
    '<blockquote class="msg-blockquote">$1</blockquote>',
  );
  html = html.replace(/<\/blockquote>\n<blockquote class="msg-blockquote">/g, "<br/>");

  html = html.replace(
    /(^[\s]*[-*] .+$(\n[\s]*[-*] .+$)*)/gm,
    (block) => {
      const items = block
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => `<li>${l.replace(/^[\s]*[-*] /, "")}</li>`)
        .join("");
      return `<ul class="msg-ul">${items}</ul>`;
    },
  );

  html = html.replace(
    /(^\d+\. .+$(\n\d+\. .+$)*)/gm,
    (block) => {
      const items = block
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`)
        .join("");
      return `<ol class="msg-ol">${items}</ol>`;
    },
  );

  html = html.replace(/^---$/gm, '<hr class="msg-hr"/>');

  // Split into paragraphs, detect numbered headings, merge heading with following body
  html = html.replace(/\n{2,}/g, "\x00PARA\x00");
  html = html.replace(/\n/g, "<br/>");
  const blocks = html.split("\x00PARA\x00");
  const merged: string[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const stripped = blocks[i].replace(/<[^>]+>/g, "").trim();
    const isNumbered = /^\d+\.\s/.test(stripped) && stripped.length < 200;
    if (isNumbered && i + 1 < blocks.length) {
      merged.push(`<p class="msg-p msg-numbered">${blocks[i]}<br/>${blocks[i + 1]}</p>`);
      i++;
    } else {
      const cls = isNumbered ? "msg-p msg-numbered" : "msg-p";
      merged.push(`<p class="${cls}">${blocks[i]}</p>`);
    }
  }
  html = merged.join("");

  html = html.replace(/<p class="msg-p[^"]*">(<(?:div|table|ul|ol|h[1-4]|pre|blockquote|hr))/g, "$1");
  html = html.replace(/(<\/(?:div|table|ul|ol|h[1-4]|pre|blockquote|hr).*?>)<\/p>/g, "$1");
  html = html.replace(/<p class="msg-p[^"]*">\s*<\/p>/g, "");

  // Remove stray <br/> after headings and before block elements
  html = html.replace(/(<\/h[1-4]>)(\s*<br\s*\/?>)+/g, "$1");
  html = html.replace(/(<br\s*\/?>)+(\s*<(?:div|table|ul|ol|h[1-4]|pre|blockquote|hr))/g, "$2");

  codeBlocks.forEach((block, i) => {
    html = html.replace(`\x00CODEBLOCK${i}\x00`, block);
  });

  return html;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ------------------------------------------------------------------ */
/*  Friendly command label                                             */
/* ------------------------------------------------------------------ */

function friendlyCommand(raw: string): string {
  return raw
    .replace(/^gog\s+/, "")
    .replace(/\s+--json\b/g, "")
    .replace(/\s+--account\s+\S+/g, "")
    .replace(/\s+--max\s+\S+/g, "");
}

function friendlyAction(raw: string): string {
  const cmd = friendlyCommand(raw);
  const parts = cmd.split(/\s+/);
  const service = parts[0];
  const sub = parts[1];

  const labels: Record<string, Record<string, string>> = {
    sheets: { metadata: "Reading spreadsheet info", read: "Reading sheet data", update: "Writing to sheet", export: "Exporting spreadsheet" },
    gmail: { search: "Searching emails", read: "Reading email", send: "Sending email", labels: "Fetching labels" },
    calendar: { events: "Checking calendar", create: "Creating event", calendars: "Listing calendars" },
    drive: { ls: "Browsing files", search: "Searching files", download: "Downloading file", upload: "Uploading file" },
    contacts: { list: "Loading contacts", search: "Searching contacts" },
    tasks: { list: "Loading tasks", add: "Adding task", tasklists: "Loading task lists" },
  };

  return labels[service]?.[sub] || `Running ${cmd.slice(0, 50)}`;
}

/* ------------------------------------------------------------------ */
/*  Tool calls group                                                   */
/* ------------------------------------------------------------------ */

function ToolCallsGroup({
  toolCalls,
  isStreaming,
}: {
  toolCalls: ToolCallInfo[];
  isStreaming?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [expandedOutputs, setExpandedOutputs] = useState<Set<number>>(new Set());

  const completedCount = toolCalls.filter((tc) => tc.type === "tool_result").length;
  const runningCall = toolCalls.filter((tc) => tc.type === "tool_call" && tc.status === "running").pop();
  const hasFailure = toolCalls.some((tc) => tc.type === "tool_result" && !tc.success);

  const currentAction = useMemo(() => {
    if (runningCall) return friendlyAction(runningCall.command || runningCall.tool || "");
    const lastResult = [...toolCalls].reverse().find((tc) => tc.type === "tool_result");
    if (lastResult && isStreaming) return friendlyAction(lastResult.command || lastResult.tool || "");
    return null;
  }, [toolCalls, runningCall, isStreaming]);

  const toggleOutput = (idx: number) => {
    setExpandedOutputs((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  return (
    <div className="my-2 animate-fade-in">
      {/* Status line — always visible while streaming */}
      {isStreaming && toolCalls.length > 0 && (
        <div className="flex items-center gap-2.5 mb-2 pl-0.5">
          <div className="relative flex items-center justify-center w-5 h-5">
            <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
            <Zap size={12} className="text-accent relative z-10" />
          </div>
          <span className="text-sm text-text-secondary">
            {currentAction || "Working..."}
            {completedCount > 0 && (
              <span className="text-text-muted ml-1.5">
                ({completedCount} step{completedCount !== 1 ? "s" : ""} done)
              </span>
            )}
          </span>
        </div>
      )}

      {/* Collapsed summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-left transition-colors hover:bg-bg-hover/50 ${
          expanded ? "bg-bg-secondary/60 border border-border/40" : "bg-bg-secondary/40 border border-transparent"
        }`}
      >
        {expanded ? (
          <ChevronDown size={13} className="text-text-muted shrink-0" />
        ) : (
          <ChevronRight size={13} className="text-text-muted shrink-0" />
        )}
        <Terminal size={12} className="text-text-muted shrink-0" />
        <span className="text-xs text-text-muted flex-1">
          {isStreaming && runningCall ? (
            <>
              <Loader2 size={11} className="inline animate-spin mr-1 -mt-0.5" />
              Running commands...
            </>
          ) : (
            <>
              Ran {completedCount} command{completedCount !== 1 ? "s" : ""}
              {hasFailure && <span className="text-danger ml-1">(some failed)</span>}
            </>
          )}
        </span>
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-border/40 bg-bg-secondary/40 divide-y divide-border/30">
          {toolCalls.map((tc, i) => {
            const isResult = tc.type === "tool_result";
            const isRunning = tc.type === "tool_call" && tc.status === "running";
            const hasOutput = isResult && !!tc.output;
            const showOutput = expandedOutputs.has(i);

            if (tc.type === "tool_call" && !isRunning) return null;

            return (
              <div key={i}>
                <button
                  onClick={() => hasOutput && toggleOutput(i)}
                  className={`flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors ${
                    hasOutput ? "hover:bg-bg-hover/40" : ""
                  }`}
                >
                  {isRunning ? (
                    <Loader2 size={11} className="text-accent animate-spin shrink-0" />
                  ) : isResult && tc.success ? (
                    <CheckCircle2 size={11} className="text-success/60 shrink-0" />
                  ) : (
                    <XCircle size={11} className="text-danger/60 shrink-0" />
                  )}
                  <span className="text-[11px] text-text-muted flex-1 truncate font-mono">
                    {friendlyCommand(tc.command || tc.tool || "")}
                  </span>
                  {hasOutput && (
                    showOutput
                      ? <ChevronDown size={11} className="text-text-muted shrink-0" />
                      : <ChevronRight size={11} className="text-text-muted shrink-0" />
                  )}
                </button>
                {showOutput && (
                  <pre className="px-3 py-1.5 text-[10px] leading-relaxed text-text-muted overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap font-mono border-t border-border/20 bg-bg/30">
                    {(tc.output?.length ?? 0) > 3000
                      ? tc.output!.slice(0, 3000) + "\n... (truncated)"
                      : tc.output}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Message bubble                                                     */
/* ------------------------------------------------------------------ */

function MessageBubble({ role, content, toolCalls, isStreaming }: Props) {
  const isUser = role === "user";
  const hasToolCalls = toolCalls && toolCalls.length > 0;
  const isThinking = isStreaming && !content && !hasToolCalls;
  const isWorking = isStreaming && !content && hasToolCalls;

  return (
    <div className={`flex items-start gap-3 animate-fade-in ${isUser ? "flex-row-reverse" : ""}`}>
      {/* Avatar */}
      {isUser ? (
        <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-1 bg-accent/15 border border-accent/20">
          <User size={13} className="text-accent" />
        </div>
      ) : (
        <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 bg-gradient-to-br from-google-blue via-google-red to-google-yellow shadow-sm">
          <Sparkles size={13} className="text-white" />
        </div>
      )}

      {/* Content — capped at ~100 characters wide */}
      <div className={`min-w-0 ${isUser ? "max-w-[75%]" : "flex-1"}`} style={!isUser ? { maxWidth: "100ex" } : undefined}>
        {isUser ? (
          <div className="inline-block bg-accent/12 border border-accent/15 rounded-2xl rounded-tr-sm px-4 py-2.5 text-[14px] leading-relaxed text-text break-words overflow-wrap-anywhere" style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}>
            {content}
          </div>
        ) : (
          <div>
            {/* Thinking state — no content, no tool calls yet */}
            {isThinking && (
              <div className="flex items-center gap-2.5 py-2 pl-0.5">
                <div className="relative flex items-center justify-center w-5 h-5">
                  <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
                  <div className="w-2 h-2 rounded-full bg-accent relative z-10" />
                </div>
                <span className="text-sm text-text-secondary">Thinking...</span>
              </div>
            )}

            {/* Text response — always shown first / above tool calls */}
            {content && (
              <div
                className="message-content text-[14px] leading-[1.7] text-text break-words" style={{ overflowWrap: "anywhere" }}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
              />
            )}

            {/* Working state — has tool calls but no text yet, show indicator */}
            {isWorking && (
              <div className="flex items-center gap-2.5 mb-1 pl-0.5">
                <div className="relative flex items-center justify-center w-5 h-5">
                  <div className="absolute inset-0 rounded-full bg-accent/20 animate-ping" />
                  <Zap size={12} className="text-accent relative z-10" />
                </div>
                <span className="text-sm text-text-secondary">Analyzing your data...</span>
              </div>
            )}

            {/* Tool calls — collapsible group below text */}
            {hasToolCalls && (
              <ToolCallsGroup toolCalls={toolCalls} isStreaming={isStreaming} />
            )}
          </div>
        )}
      </div>

    </div>
  );
}

export default memo(MessageBubble);
