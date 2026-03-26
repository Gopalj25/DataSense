import { useState, useRef, useEffect } from "react";
import { Send, Bot, User } from "lucide-react";
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
}

interface Message {
  id: string;
  sender: "user" | "agent";
  text: string;
}

// ─── Pure JS Suggestion Logic ──────────────────────────────
function generateSuggestions(
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
  const all = Object.keys(columnMeta);
  const suggestions: string[] = [];
  if (numeric.length >= 2)
    suggestions.push(`Correlation between ${numeric[0]} and ${numeric[1]}?`);
  if (categorical.length > 0 && numeric.length > 0)
    suggestions.push(`Which ${categorical[0]} has the highest ${numeric[0]}?`);
  if (numeric.length > 0) suggestions.push(`Distribution of ${numeric[0]}`);
  if (categorical.length > 0)
    suggestions.push(`Unique values in ${categorical[0]}?`);
  if (numeric.length > 0) suggestions.push(`Top 5 rows by ${numeric[0]}?`);
  if (all.length > 0) suggestions.push(`Summarize key insights`);
  if (numeric.length > 0) suggestions.push(`Outliers in ${numeric[0]}?`);
  return suggestions.slice(0, 5);
}

export default function Chat({
  fileId,
  filename,
  columnMeta,
  contentSummary,
  onChartRequested,
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const suggestions = generateSuggestions(columnMeta || {}, filename);

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
      if (chartMatch?.[1]) {
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
          text: "Sorry, an error occurred. Please check your API key.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--text-primary)",
          }}
        >
          Data Assistant
        </span>
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
              maxWidth: msg.sender === "user" ? "80%" : "88%",
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
            }}
          >
            <div
              className="prose prose-invert prose-sm max-w-none"
              style={{
                fontSize: "inherit",
                lineHeight: "inherit",
                color: "inherit",
              }}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
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
            maskImage: "linear-gradient(to right, black 80%, transparent 100%)",
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
  );
}
