import { useState, useRef, useEffect, useCallback } from "react";
import { Send, Bot, User, Pin, PinOff, Maximize2, X } from "lucide-react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { ChartConfig } from "../App";

interface ChatProps {
  fileId: string;
  filename: string;
  columnMeta: Record<string, any>;
  contentSummary: string;
  onChartRequested?: (
    chartType: string,
    newChartData?: ChartConfig | null,
  ) => void;
  onTableRequested?: () => void;
  chatSuggestions?: string[];
  isPinned?: boolean;
  onPin?: () => void;
}

interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
}

// ─── Fallback JS Suggestion Logic ──────────────────────────
function generateFallbackSuggestions(
  columnMeta: Record<string, any>,
  filename: string,
): string[] {
  const isPDF =
    filename.toLowerCase().endsWith(".pdf") || columnMeta._is_document === true;
  if (isPDF) {
    return [
      "What are the main topics covered?",
      "Summarize the key findings",
      "What conclusions does it reach?",
      "List the most important entities",
      "What are the recommendations?",
    ];
  }
  const numeric = Object.entries(columnMeta)
    .filter(([, v]) => v.type === "numeric")
    .map(([k]) => k);
  const categorical = Object.entries(columnMeta)
    .filter(([, v]) => v.type !== "numeric")
    .map(([k]) => k);
  const suggestions: string[] = [];
  if (numeric.length >= 2)
    suggestions.push(`Correlation between ${numeric[0]} and ${numeric[1]}?`);
  if (categorical.length > 0 && numeric.length > 0)
    suggestions.push(`Which ${categorical[0]} has the highest ${numeric[0]}?`);
  if (numeric.length > 0) suggestions.push(`Distribution of ${numeric[0]}`);
  if (categorical.length > 0)
    suggestions.push(`Unique values in ${categorical[0]}?`);
  if (numeric.length > 0) suggestions.push(`Top 5 rows by ${numeric[0]}?`);
  suggestions.push(`Summarize key insights`);
  return suggestions.slice(0, 5);
}

// ─── Table Expand Modal ────────────────────────────────────
function TableModal({ html, onClose }: { html: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative overflow-auto"
        style={{
          maxWidth: "90vw",
          maxHeight: "85vh",
          background: "var(--bg-surface)",
          border: "1px solid var(--border)",
          borderRadius: 12,
          padding: "20px",
        }}
      >
        <button
          onClick={onClose}
          className="absolute flex items-center justify-center"
          style={{
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <X size={14} />
        </button>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
}

export default function Chat({
  fileId,
  filename,
  columnMeta,
  contentSummary,
  chatSuggestions,
  onChartRequested,
  onTableRequested,
  isPinned = false,
  onPin,
}: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      sender: "agent",
      text: `I've analyzed **${filename}**. What would you like to know?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>(
    chatSuggestions && chatSuggestions.length > 0
      ? chatSuggestions
      : generateFallbackSuggestions(columnMeta || {}, filename)
  );
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () =>
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (userMsgTxt?: string) => {
    const msgText = userMsgTxt || input;
    if (!msgText.trim() || loading) return;
    setInput("");
    const newMessages: Message[] = [
      ...messages,
      { id: Date.now().toString(), sender: "user", text: msgText },
    ];
    setMessages(newMessages);
    setLoading(true);
    try {
      const history = newMessages
        .filter((m) => m.id !== "1")
        .reduce((acc: any[], curr, i, arr) => {
          if (
            curr.sender === "user" &&
            i + 1 < arr.length &&
            arr[i + 1].sender === "agent"
          )
            acc.push({ user: curr.text, agent: arr[i + 1].text });
          return acc;
        }, []);
      const response = await axios.post("http://localhost:8000/api/chat", {
        file_id: fileId,
        filename,
        column_meta: columnMeta,
        content_summary: contentSummary,
        question: msgText,
        history,
      });
      let answer: string = response.data.answer || "";
      const chartMatch = answer.match(/[`*]*<CHART:\s*(.*?)>[`*]*/i);
      let hasChart = false;
      if (chartMatch?.[1]) {
        hasChart = true;
        const chartType = chartMatch[1].trim();
        const newChartInfo = response.data.new_chart;
        const plotlyJson = response.data.plotly_json;
        let chartPayload: ChartConfig | null = null;
        if (newChartInfo && plotlyJson)
          chartPayload = {
            type: newChartInfo.type,
            title: newChartInfo.title,
            description: newChartInfo.description,
            plotly_json: plotlyJson,
          };
        if (onChartRequested) onChartRequested(chartType, chartPayload);
        answer = answer.replace(chartMatch[0], "").trim();
        answer = `📊 **${chartType}** added to dashboard.\n\n${answer}`;
      }
      // Only switch to Table view if NO chart was generated and response has a table
      if (!hasChart) {
        const hasTable = /\|.+\|\n\|[-:| ]+\|/m.test(answer);
        if (hasTable && onTableRequested) {
          onTableRequested();
          answer += `\n\n💡 *Switched to Table view for a better look.*`;
        }
      }
      setMessages([
        ...newMessages,
        { id: (Date.now() + 1).toString(), sender: "agent", text: answer },
      ]);
    } catch {
      setMessages([
        ...newMessages,
        {
          id: (Date.now() + 1).toString(),
          sender: "agent",
          text: "Sorry, an error occurred. Please try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Custom table renderer for ReactMarkdown ──────────────
  const markdownComponents = {
    table: ({ children, ...props }: any) => {
      const tableRef = useRef<HTMLDivElement>(null);
      const handleExpand = useCallback(() => {
        if (tableRef.current) {
          setExpandedTable(tableRef.current.innerHTML);
        }
      }, []);
      return (
        <div style={{ position: "relative", margin: "8px 0" }}>
          <div
            ref={tableRef}
            style={{
              maxHeight: 180,
              overflowY: "auto",
              overflowX: "auto",
              borderRadius: 8,
              border: "1px solid var(--border)",
            }}
          >
            <table
              {...props}
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 11,
                lineHeight: 1.4,
              }}
            >
              {children}
            </table>
          </div>
          <button
            onClick={handleExpand}
            className="flex items-center gap-1 transition-all"
            style={{
              position: "absolute",
              top: 4,
              right: 4,
              fontSize: 9,
              padding: "3px 8px",
              borderRadius: 6,
              background: "var(--bg-overlay)",
              border: "1px solid var(--border)",
              color: "var(--text-muted)",
              cursor: "pointer",
              backdropFilter: "blur(4px)",
            }}
          >
            <Maximize2 size={10} /> Expand
          </button>
        </div>
      );
    },
    thead: ({ children, ...props }: any) => (
      <thead
        {...props}
        style={{
          background: "var(--bg-elevated)",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        {children}
      </thead>
    ),
    th: ({ children, ...props }: any) => (
      <th
        {...props}
        style={{
          padding: "5px 8px",
          textAlign: "left",
          fontWeight: 600,
          fontSize: 10,
          color: "var(--text-primary)",
          borderBottom: "1px solid var(--border)",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </th>
    ),
    td: ({ children, ...props }: any) => (
      <td
        {...props}
        style={{
          padding: "4px 8px",
          fontSize: 10.5,
          color: "var(--text-secondary)",
          borderBottom: "1px solid var(--border-dim)",
          whiteSpace: "nowrap",
        }}
      >
        {children}
      </td>
    ),
  };

  return (
    <>
      {expandedTable && (
        <TableModal
          html={expandedTable}
          onClose={() => setExpandedTable(null)}
        />
      )}
      <div
        className="flex flex-col h-full"
        style={{ background: "var(--bg-surface)" }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{
            padding: "14px 20px",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              Data Assistant
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                color: "var(--text-muted)",
                background: "var(--bg-overlay)",
                padding: "3px 8px",
                borderRadius: 6,
              }}
            >
              {filename}
            </span>
            {onPin && (
              <button
                onClick={onPin}
                title={isPinned ? "Unpin chat" : "Pin chat"}
                className="flex items-center justify-center transition-all"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  background: isPinned ? "var(--accent-dim)" : "transparent",
                  border: isPinned
                    ? "1px solid var(--border-accent)"
                    : "1px solid transparent",
                  color: isPinned ? "var(--accent-text)" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {isPinned ? <PinOff size={13} /> : <Pin size={13} />}
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto p-5 space-y-4 scrollbar-none"
          style={{ display: "flex", flexDirection: "column", gap: 12 }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                alignSelf: msg.sender === "user" ? "flex-end" : "flex-start",
                maxWidth: msg.sender === "user" ? "80%" : "92%",
                minWidth: 0,
                background:
                  msg.sender === "user"
                    ? "var(--accent-dim)"
                    : "var(--bg-elevated)",
                border: `1px solid ${msg.sender === "user" ? "var(--border-accent)" : "var(--border)"}`,
                borderRadius:
                  msg.sender === "user"
                    ? "14px 14px 3px 14px"
                    : "14px 14px 14px 3px",
                padding: "10px 14px",
                fontSize: 13,
                lineHeight: 1.6,
                color:
                  msg.sender === "user"
                    ? "var(--text-primary)"
                    : "var(--text-secondary)",
                overflow: "hidden",
              }}
            >
              <div
                className="prose prose-invert prose-sm max-w-none"
                style={{
                  fontSize: "inherit",
                  lineHeight: "inherit",
                  color: "inherit",
                  overflowX: "hidden",
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={markdownComponents}
                >
                  {msg.text}
                </ReactMarkdown>
              </div>
            </div>
          ))}
          {loading && (
            <div
              style={{
                alignSelf: "flex-start",
                background: "var(--bg-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "14px 14px 14px 3px",
                padding: "12px 18px",
                display: "flex",
                gap: 6,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--text-muted)",
                    animation: "dot-pulse 1.4s ease-in-out infinite",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          )}
          <div ref={messagesEndRef} className="h-2" />
        </div>

        {/* Suggestion Pills */}
        {!input.trim() && !loading && suggestions.length > 0 && (
          <div
            className="flex gap-1.5 overflow-x-auto scrollbar-none shrink-0"
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border-dim)",
              borderBottom: "1px solid var(--border-dim)",
              maskImage:
                "linear-gradient(to right, black 80%, transparent 100%)",
              WebkitMaskImage:
                "linear-gradient(to right, black 80%, transparent 100%)",
            }}
          >
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => handleSend(s)}
                className="shrink-0 transition-all"
                style={{
                  fontSize: 11,
                  padding: "5px 12px",
                  borderRadius: 20,
                  border: "1px solid var(--border)",
                  background: "var(--bg-elevated)",
                  color: "var(--text-secondary)",
                  whiteSpace: "nowrap",
                  cursor: "pointer",
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input */}
        <div
          className="shrink-0 flex items-center gap-2"
          style={{ padding: "12px 16px" }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex-1 flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your data…"
              className="flex-1 outline-none transition-all"
              style={{
                background: "var(--bg-inset)",
                border: "1px solid var(--border)",
                borderRadius: 10,
                padding: "9px 14px",
                fontSize: 13,
                color: "var(--text-primary)",
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="flex items-center justify-center shrink-0 transition-all"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background:
                  !input.trim() || loading
                    ? "var(--bg-overlay)"
                    : "var(--accent)",
                color: !input.trim() || loading ? "var(--text-muted)" : "white",
                cursor: !input.trim() || loading ? "not-allowed" : "pointer",
              }}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
