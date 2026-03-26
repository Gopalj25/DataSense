import { useState, useCallback } from "react";
import {
  BarChart2,
  TrendingUp,
  PieChart as PieIcon,
  Activity,
  Layers,
  Box,
  Grid3x3,
  RotateCcw,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";

// ─── Types ──────────────────────────────────────────────────
export interface EditorConfig {
  type: string;
  title: string;
  x_key?: string;
  y_keys?: string[];
  label_key?: string;
  value_key?: string;
  tooltip_key?: string;
  nbins?: number;
  columns?: string[];
  color?: string;
}

export type ColumnMeta = Record<
  string,
  {
    type: string;
    samples?: any[];
    nunique?: number;
    min?: number;
    max?: number;
  }
>;

const CHART_TYPES = [
  { id: "Bar Chart", icon: BarChart2, label: "Bar" },
  { id: "Line Chart", icon: TrendingUp, label: "Line" },
  { id: "Pie Chart", icon: PieIcon, label: "Pie" },
  { id: "Scatter Plot", icon: Activity, label: "Scatter" },
  { id: "Histogram", icon: Layers, label: "Hist" },
  { id: "Box Plot", icon: Box, label: "Box" },
  { id: "Heatmap", icon: Grid3x3, label: "Heat" },
];

const COLOUR_SWATCHES = [
  "#818CF8",
  "#34D399",
  "#FB923C",
  "#F472B6",
  "#38BDF8",
  "#A78BFA",
  "#FBBF24",
  "#F87171",
];

export function autoSuggestAxes(
  type: string,
  columnMeta: ColumnMeta,
): Partial<EditorConfig> {
  const numericCols = Object.keys(columnMeta).filter(
    (k) => columnMeta[k].type === "numeric",
  );
  const categoricalCols = Object.keys(columnMeta).filter(
    (k) => columnMeta[k].type !== "numeric",
  );
  const allCols = Object.keys(columnMeta);
  switch (type) {
    case "Bar Chart":
    case "Line Chart":
      return {
        x_key: categoricalCols[0] ?? allCols[0],
        y_keys: numericCols.slice(0, 1),
      };
    case "Pie Chart":
      return {
        label_key: categoricalCols[0] ?? allCols[0],
        value_key: numericCols[0],
      };
    case "Scatter Plot":
      return {
        x_key: numericCols[0],
        y_keys: [numericCols[1] ?? numericCols[0]],
      };
    case "Histogram":
      return { x_key: numericCols[0] };
    case "Box Plot":
      return {
        x_key: categoricalCols[0] ?? allCols[0],
        y_keys: [numericCols[0]],
      };
    case "Heatmap":
      return { columns: numericCols.slice(0, 10) };
    default:
      return {};
  }
}

export function validateConfig(
  config: EditorConfig,
  columnMeta: ColumnMeta,
): string | null {
  const cols = Object.keys(columnMeta);
  if (config.type === "Pie Chart") {
    if (!config.label_key || !cols.includes(config.label_key))
      return "Select a label column.";
    if (!config.value_key || !cols.includes(config.value_key))
      return "Select a value column.";
    return null;
  }
  if (config.type === "Heatmap") return null;
  if (!config.x_key || !cols.includes(config.x_key))
    return "Select a valid X axis column.";
  if (
    ["Bar Chart", "Line Chart", "Scatter Plot", "Box Plot"].includes(
      config.type,
    )
  ) {
    if (!config.y_keys?.length || !cols.includes(config.y_keys[0]))
      return "Select at least one Y axis column.";
  }
  if (config.type === "Histogram") {
    if (!config.x_key || columnMeta[config.x_key]?.type !== "numeric")
      return "Histogram requires a numeric column.";
  }
  return null;
}

// ─── Sub-components ──────────────────────────────────────────
function TypePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (t: string) => void;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        Chart Type
      </p>
      <div className="flex flex-wrap gap-1.5" role="group">
        {CHART_TYPES.map((ct) => {
          const Icon = ct.icon;
          const active = ct.id === value;
          return (
            <button
              key={ct.id}
              onClick={() => onChange(ct.id)}
              aria-pressed={active}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: active ? "var(--accent)" : "var(--bg-overlay)",
                color: active ? "white" : "var(--text-secondary)",
              }}
            >
              <Icon size={13} /> {ct.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AxisSelect({
  label,
  value,
  options,
  onChange,
  badge,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  onChange: (v: string) => void;
  badge?: (col: string) => string;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 4,
        }}
      >
        {label}
      </p>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg text-sm transition outline-none"
        style={{
          background: "var(--bg-inset)",
          border: "1px solid var(--border)",
          padding: "6px 10px",
          color: "var(--text-primary)",
        }}
      >
        <option value="">— select —</option>
        {options.map((col) => (
          <option key={col} value={col}>
            {col} {badge ? `(${badge(col)})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function ColourPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  return (
    <div>
      <p
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: 6,
        }}
      >
        Primary Colour
      </p>
      <div className="flex gap-2">
        {COLOUR_SWATCHES.map((hex) => (
          <button
            key={hex}
            onClick={() => onChange(hex)}
            className={`w-7 h-7 rounded-full transition-all ${value === hex ? "ring-2 ring-offset-2 scale-110" : "hover:scale-110"}`}
            style={{
              backgroundColor: hex,
              ringColor: "var(--accent)",
              ringOffsetColor: "var(--bg-surface)",
            }}
            title={hex}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Editor ─────────────────────────────────────────────
interface ChartEditorProps {
  fileId: string;
  aiConfig: EditorConfig;
  columnMeta: ColumnMeta;
  currentPlotlyJson: string | undefined;
  onApply: (newPlotlyJson: string, appliedConfig: EditorConfig) => void;
  onClose: () => void;
}

export default function ChartEditor({
  fileId,
  aiConfig,
  columnMeta,
  currentPlotlyJson,
  onApply,
}: ChartEditorProps) {
  const [cfg, setCfg] = useState<EditorConfig>(() => ({
    ...aiConfig,
    color: aiConfig.color || COLOUR_SWATCHES[0],
  }));
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const allColumns = Object.keys(columnMeta);
  const numericColumns = allColumns.filter(
    (k) => columnMeta[k].type === "numeric",
  );
  const categoricalColumns = allColumns.filter(
    (k) => columnMeta[k].type !== "numeric",
  );
  const xOptions = ["Scatter Plot", "Histogram"].includes(cfg.type)
    ? numericColumns
    : allColumns;
  const yOptions = numericColumns;
  const colBadge = (col: string) =>
    columnMeta[col]?.type === "numeric" ? "Num" : "Cat";

  const patch = useCallback((p: Partial<EditorConfig>) => {
    setCfg((prev) => ({ ...prev, ...p }));
    setHasChanges(true);
    setError(null);
  }, []);
  const handleTypeChange = useCallback(
    (newType: string) => {
      patch({ type: newType, ...autoSuggestAxes(newType, columnMeta) });
    },
    [columnMeta, patch],
  );

  const addYKey = () => {
    const unused = numericColumns.filter((c) => !cfg.y_keys?.includes(c));
    if (unused.length) patch({ y_keys: [...(cfg.y_keys || []), unused[0]] });
  };
  const removeYKey = (idx: number) => {
    const next = [...(cfg.y_keys || [])];
    next.splice(idx, 1);
    patch({ y_keys: next });
  };
  const setYKey = (idx: number, val: string) => {
    const next = [...(cfg.y_keys || [])];
    next[idx] = val;
    patch({ y_keys: next });
  };

  const handleApply = async () => {
    const err = validateConfig(cfg, columnMeta);
    if (err) {
      setError(err);
      return;
    }
    setIsPending(true);
    setError(null);
    try {
      const res = await axios.post("http://localhost:8000/api/render", {
        file_id: fileId,
        chart_type: cfg.type,
        title: cfg.title,
        x_key: cfg.x_key,
        y_keys: cfg.y_keys,
        label_key: cfg.label_key,
        value_key: cfg.value_key,
        tooltip_key: cfg.tooltip_key,
        nbins: cfg.nbins,
        columns: cfg.columns,
        color: cfg.color,
      });
      onApply(res.data.plotly_json, cfg);
      setHasChanges(false);
    } catch (e: any) {
      setError(e.response?.data?.detail || "Render failed.");
    } finally {
      setIsPending(false);
    }
  };

  const handleReset = async () => {
    setCfg({ ...aiConfig, color: aiConfig.color || COLOUR_SWATCHES[0] });
    setError(null);
    setHasChanges(false);
    setIsPending(true);
    try {
      const res = await axios.post("http://localhost:8000/api/render", {
        file_id: fileId,
        chart_type: aiConfig.type,
        title: aiConfig.title,
        x_key: aiConfig.x_key,
        y_keys: aiConfig.y_keys,
        label_key: aiConfig.label_key,
        value_key: aiConfig.value_key,
        tooltip_key: aiConfig.tooltip_key,
      });
      onApply(res.data.plotly_json, aiConfig);
    } catch {
      if (currentPlotlyJson) onApply(currentPlotlyJson, aiConfig);
    } finally {
      setIsPending(false);
    }
  };

  const showXY = [
    "Bar Chart",
    "Line Chart",
    "Scatter Plot",
    "Box Plot",
  ].includes(cfg.type);
  const showPie = cfg.type === "Pie Chart";
  const showHist = cfg.type === "Histogram";

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      className="overflow-hidden"
    >
      <div className="space-y-4" style={{ padding: "16px 20px" }}>
        {/* Top Bar */}
        <div className="flex items-center gap-2">
          <Pencil size={14} style={{ color: "var(--text-muted)" }} />
          <input
            type="text"
            value={cfg.title}
            onChange={(e) => patch({ title: e.target.value })}
            className="flex-1 rounded-lg text-sm font-semibold outline-none transition"
            style={{
              background: "var(--bg-inset)",
              border: "1px solid var(--border)",
              padding: "6px 12px",
              color: "var(--text-primary)",
            }}
            placeholder="Chart title…"
          />
          {hasChanges && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                padding: "2px 8px",
                borderRadius: 20,
                background: "var(--warning-dim)",
                color: "var(--warning)",
                border: "1px solid rgba(251,191,36,0.2)",
              }}
            >
              Unsaved
            </span>
          )}
          <button
            onClick={handleReset}
            disabled={isPending}
            className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition disabled:opacity-50"
            style={{
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              background: "transparent",
            }}
          >
            <RotateCcw size={12} /> Reset
          </button>
          <button
            onClick={handleApply}
            disabled={isPending}
            className="flex items-center gap-1 px-4 py-1.5 text-xs font-medium rounded-lg transition disabled:opacity-50"
            style={{ background: "var(--accent)", color: "white" }}
          >
            {isPending ? (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Check size={12} />
            )}
            Apply
          </button>
        </div>

        {/* Two-column */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TypePicker value={cfg.type} onChange={handleTypeChange} />
          <div className="space-y-2">
            {showXY && (
              <>
                <AxisSelect
                  label="X Axis"
                  value={cfg.x_key}
                  options={xOptions}
                  onChange={(v) => patch({ x_key: v })}
                  badge={colBadge}
                />
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Y Axis (series)
                  </p>
                  {(cfg.y_keys || []).map((yk, i) => (
                    <div key={i} className="flex gap-1 mb-1">
                      <select
                        value={yk}
                        onChange={(e) => setYKey(i, e.target.value)}
                        className="flex-1 rounded-lg text-sm outline-none transition"
                        style={{
                          background: "var(--bg-inset)",
                          border: "1px solid var(--border)",
                          padding: "6px 10px",
                          color: "var(--text-primary)",
                        }}
                      >
                        {yOptions.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {(cfg.y_keys?.length || 0) > 1 && (
                        <button
                          onClick={() => removeYKey(i)}
                          style={{ color: "var(--danger)" }}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  {(cfg.y_keys?.length || 0) < 3 &&
                    numericColumns.length > (cfg.y_keys?.length || 0) && (
                      <button
                        onClick={addYKey}
                        className="flex items-center gap-1 text-xs mt-0.5"
                        style={{ color: "var(--accent-text)" }}
                      >
                        <Plus size={12} /> Add series
                      </button>
                    )}
                </div>
              </>
            )}
            {showPie && (
              <>
                <AxisSelect
                  label="Label Column"
                  value={cfg.label_key}
                  options={
                    categoricalColumns.length ? categoricalColumns : allColumns
                  }
                  onChange={(v) => patch({ label_key: v })}
                  badge={colBadge}
                />
                <AxisSelect
                  label="Value Column"
                  value={cfg.value_key}
                  options={yOptions}
                  onChange={(v) => patch({ value_key: v })}
                  badge={colBadge}
                />
              </>
            )}
            {showHist && (
              <>
                <AxisSelect
                  label="Column (numeric)"
                  value={cfg.x_key}
                  options={numericColumns}
                  onChange={(v) => patch({ x_key: v })}
                  badge={colBadge}
                />
                <div>
                  <p
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--text-muted)",
                      marginBottom: 4,
                    }}
                  >
                    Bins
                  </p>
                  <input
                    type="number"
                    min={5}
                    max={200}
                    value={cfg.nbins || 30}
                    onChange={(e) =>
                      patch({ nbins: parseInt(e.target.value) || 30 })
                    }
                    className="w-24 rounded-lg text-sm outline-none transition"
                    style={{
                      background: "var(--bg-inset)",
                      border: "1px solid var(--border)",
                      padding: "6px 10px",
                      color: "var(--text-primary)",
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <ColourPicker
          value={cfg.color || COLOUR_SWATCHES[0]}
          onChange={(hex) => patch({ color: hex })}
        />

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
              style={{
                background: "var(--danger-dim)",
                color: "var(--danger)",
                border: "1px solid rgba(248,113,113,0.2)",
              }}
            >
              <AlertCircle size={14} /> {error}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
