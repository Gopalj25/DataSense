import { useState, useEffect, useMemo, useRef } from 'react';
import type { InsightData, ChartConfig, ChartRequest } from '../App';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
    PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
    Activity, PieChart as PieChartIcon, BarChart2, TrendingUp,
    Map as MapIcon, Network, Loader2, Plus, Sparkles, Info, Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import Plot from 'react-plotly.js';

interface DashboardProps {
    data: InsightData;
    externalChartRequest?: ChartRequest | null;
}

const COLORS = ['#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#84cc16', '#f97316'];

const tooltipStyle = {
    contentStyle: {
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid rgba(0,0,0,0.1)',
        borderRadius: '10px',
        backdropFilter: 'blur(10px)',
        color: '#1e293b',
        fontSize: '13px'
    },
    itemStyle: { color: '#f97316' }
};

const axisStyle = {
    stroke: 'rgba(0,0,0,0.1)',
    tick: { fill: 'rgba(0,0,0,0.5)', fontSize: 11 }
};

function prepareRows(raw: any[], limit = 30): any[] {
    return raw.slice(0, limit).map(row => {
        const cleaned: any = {};
        for (const [k, v] of Object.entries(row)) {
            cleaned[k] = typeof v === 'number' ? v : (isNaN(Number(v)) ? String(v).slice(0, 28) : Number(v));
        }
        return cleaned;
    });
}

// ═══════════════════════════════════════════════════════════
// Simple Knowledge Graph renderer (no ReactFlow dependency)
// ═══════════════════════════════════════════════════════════
interface GraphNode { id: string; data: { label: string } }
interface GraphEdge { id: string; source: string; target: string; label?: string }

function SimpleKnowledgeGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
    const r = 200;
    const cx = 320, cy = 220;
    const positions: Record<string, { x: number; y: number }> = {};

    nodes.forEach((node, i) => {
        const angle = (i / nodes.length) * 2 * Math.PI - Math.PI / 2;
        positions[node.id] = {
            x: cx + r * Math.cos(angle),
            y: cy + r * Math.sin(angle)
        };
    });

    return (
        <div className="w-full h-full relative overflow-hidden" style={{ minHeight: 400 }}>
            <svg width="100%" height="100%" viewBox="0 0 640 440" className="absolute inset-0">
                {/* Edges */}
                {edges.map(edge => {
                    const from = positions[edge.source];
                    const to = positions[edge.target];
                    if (!from || !to) return null;
                    const mx = (from.x + to.x) / 2;
                    const my = (from.y + to.y) / 2;
                    return (
                        <g key={edge.id}>
                            <line
                                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                                stroke="rgba(249,115,22,0.4)" strokeWidth="1.5"
                                strokeDasharray="4 4"
                            />
                            {edge.label && (
                                <text x={mx} y={my - 6} fill="rgba(234,88,12,0.7)" fontSize="9" textAnchor="middle">
                                    {edge.label}
                                </text>
                            )}
                        </g>
                    );
                })}
                {/* Nodes */}
                {nodes.map(node => {
                    const pos = positions[node.id];
                    if (!pos) return null;
                    const label = node.data.label || node.id;
                    return (
                        <g key={node.id}>
                            <rect
                                x={pos.x - 50} y={pos.y - 16}
                                width={100} height={32} rx={10}
                                fill="rgba(254,215,170,0.5)"
                                stroke="rgba(249,115,22,0.5)"
                                strokeWidth="1"
                            />
                            <text
                                x={pos.x} y={pos.y + 4}
                                fill="#ea580c" fontSize="11"
                                textAnchor="middle"
                                fontWeight="500"
                            >
                                {label.length > 14 ? label.slice(0, 13) + '…' : label}
                            </text>
                        </g>
                    );
                })}
            </svg>
        </div>
    );
}

// ═══════════════════════════════════════════════════════════
// Dashboard Component
// ═══════════════════════════════════════════════════════════
export default function Dashboard({ data, externalChartRequest }: DashboardProps) {
    const initialTabs: ChartConfig[] = data.chart_configs?.length > 0
        ? data.chart_configs
        : (data.insights.suggested_charts || []).map(type => ({ type, title: type }));

    const [chartTabs, setChartTabs] = useState<ChartConfig[]>(initialTabs);
    const [selectedIdx, setSelectedIdx] = useState(0);

    const downloadReport = () => {
        let content = `# DataSense Analysis Report\n\n`;
        content += `## Document Name\n${data.filename}\n\n`;
        content += `## Executive Summary\n${data.insights.summary}\n\n`;
        if (data.column_meta && Object.keys(data.column_meta).length > 0) {
            content += `## Detected Data Columns\n`;
            for (const [col, info] of Object.entries(data.column_meta)) {
                content += `- **${col}** (${info.type}): ${(info as any).unique_count || 0} unique values.`;
                if (info.type === 'number') content += ` Min/Max: ${(info as any).min}/${(info as any).max}`;
                content += `\n`;
            }
        }
        content += `\n## Generated Chart Configurations\n`;
        if (data.chart_configs) {
            data.chart_configs.forEach(c => {
                content += `- **${c.title}** (${c.type}): ${JSON.stringify(c)}\n`;
            });
        }

        const blob = new Blob([content], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `DataSense_Report_${data.filename.replace(/[^a-z0-9]/gi, '_')}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Knowledge Graph state
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
    const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphFetched, setGraphFetched] = useState(false);

    // Ref to track the last processed request timestamp
    const lastProcessedTs = useRef(0);
    // Ref for scrolling chart area into view
    const chartAreaRef = useRef<HTMLDivElement>(null);

    // Auto-generate column config for a chart type from data introspection
    const autoConfigForType = (chartTypeName: string): ChartConfig => {
        const raw = data.original_data || [];
        const keys = raw.length > 0 ? Object.keys(raw[0]) : [];
        const numericCols = keys.filter(k => typeof raw[0]?.[k] === 'number');
        const categoricalCols = keys.filter(k => typeof raw[0]?.[k] === 'string');
        const type = chartTypeName.toLowerCase();

        if (type.includes('bar')) {
            return { type: chartTypeName, title: chartTypeName, x_key: categoricalCols[0] || keys[0], y_keys: numericCols.slice(0, 3) };
        }
        if (type.includes('line') || type.includes('area') || type.includes('trend')) {
            return { type: chartTypeName, title: chartTypeName, x_key: categoricalCols[0] || keys[0], y_keys: numericCols.slice(0, 3) };
        }
        if (type.includes('pie')) {
            return { type: chartTypeName, title: chartTypeName, label_key: categoricalCols[0] || keys[0], value_key: numericCols[0] || keys[1] };
        }
        if (type.includes('scatter') || type.includes('plot')) {
            return { type: chartTypeName, title: chartTypeName, x_key: numericCols[0] || keys[0], y_key: numericCols[1] || numericCols[0] || keys[1], tooltip_key: categoricalCols[0] };
        }
        return { type: chartTypeName, title: chartTypeName };
    };

    // Handle chart request from chat — uses ref to avoid stale closure issues
    useEffect(() => {
        if (!externalChartRequest) return;
        if (externalChartRequest.ts <= lastProcessedTs.current) return; // already processed
        lastProcessedTs.current = externalChartRequest.ts;

        const incoming = externalChartRequest.type.trim();

        // Use functional update to access current chartTabs (avoids stale closure)
        setChartTabs(prevTabs => {
            const existsAt = prevTabs.findIndex(
                t => t.type.toLowerCase() === incoming.toLowerCase()
            );

            if (existsAt >= 0) {
                // Tab exists — just switch to it (use setTimeout to avoid batching issues)
                setTimeout(() => {
                    setSelectedIdx(existsAt);
                    chartAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
                return prevTabs; // no change
            } else {
                // New tab — add it
                const newConfig = autoConfigForType(incoming);
                const updated = [...prevTabs, newConfig];
                setTimeout(() => {
                    setSelectedIdx(updated.length - 1);
                    chartAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 50);
                return updated;
            }
        });
    }, [externalChartRequest]);

    const selectedConfig = chartTabs[selectedIdx] || chartTabs[0];
    const chartType = selectedConfig?.type?.toLowerCase() || '';

    const rawRows = useMemo(() => prepareRows(data.original_data || []), [data.original_data]);

    // Fetch Knowledge Graph once when needed
    useEffect(() => {
        const isGraph = chartType.includes('graph') || chartType.includes('network') || chartType.includes('knowledge');
        if (isGraph && !graphFetched && !graphLoading) {
            setGraphLoading(true);
            axios.post('http://localhost:8000/api/graph', { content_summary: data.content_summary })
                .then(res => {
                    const nodes = res.data?.nodes || [];
                    const edges = res.data?.edges || [];
                    setGraphNodes(nodes);
                    setGraphEdges(edges);
                })
                .catch(err => {
                    console.error('Graph API error:', err);
                    setGraphNodes([]);
                    setGraphEdges([]);
                })
                .finally(() => {
                    setGraphLoading(false);
                    setGraphFetched(true);
                });
        }
    }, [chartType, graphFetched]);

    const getIcon = (type: string, size = 16) => {
        const t = type.toLowerCase();
        if (t.includes('pie')) return <PieChartIcon size={size} />;
        if (t.includes('bar')) return <BarChart2 size={size} />;
        if (t.includes('line') || t.includes('trend') || t.includes('area')) return <TrendingUp size={size} />;
        if (t.includes('scatter') || t.includes('plot')) return <Activity size={size} />;
        if (t.includes('map') || t.includes('geo')) return <MapIcon size={size} />;
        if (t.includes('graph') || t.includes('network') || t.includes('knowledge')) return <Network size={size} />;
        return <Activity size={size} />;
    };

    // ─── CHART RENDERER ──────────────────────────────────────
    const renderChart = () => {
        const cfg = selectedConfig;
        if (!cfg) return null;

        // 1. Prefer Backend Plotly JSON if available
        if (cfg.plotly_json) {
            try {
                const parsed = JSON.parse(cfg.plotly_json);
                if (parsed.error) {
                    return (
                        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                            <Info size={40} className="text-red-400 opacity-60" />
                            <p className="text-sm font-semibold text-red-500">Backend Plotly Error</p>
                            <p className="text-xs text-slate-500 text-center px-6">{parsed.error}</p>
                        </div>
                    );
                }
                return (
                    <div className="w-full h-full">
                        <Plot
                            data={parsed.data}
                            layout={{ ...parsed.layout, autosize: true }}
                            useResizeHandler={true}
                            style={{ width: '100%', height: '100%' }}
                            config={{ responsive: true, displayModeBar: false }}
                        />
                    </div>
                );
            } catch (err) {
                console.error("Failed to parse plotly json", err);
            }
        }

        const type = cfg.type.toLowerCase();

        // Bar Chart
        if (type.includes('bar')) {
            const xKey = cfg.x_key;
            const yKeys = cfg.y_keys || [];
            if (!xKey || yKeys.length === 0) return <NoColumnWarning />;
            return (
                <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={rawRows} margin={{ top: 16, right: 24, left: 0, bottom: 40 }} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                        <XAxis dataKey={xKey} {...axisStyle} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                        <YAxis {...axisStyle} />
                        <Tooltip {...tooltipStyle} />
                        <Legend wrapperStyle={{ color: '#64748b', fontSize: 12, paddingTop: 8 }} />
                        {yKeys.map((key, i) => (
                            <Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                        ))}
                    </BarChart>
                </ResponsiveContainer>
            );
        }

        // Line / Area Chart
        if (type.includes('line') || type.includes('area') || type.includes('trend')) {
            const xKey = cfg.x_key;
            const yKeys = cfg.y_keys || [];
            if (!xKey || yKeys.length === 0) return <NoColumnWarning />;
            return (
                <ResponsiveContainer width="100%" height={360}>
                    <AreaChart data={rawRows} margin={{ top: 16, right: 24, left: 0, bottom: 40 }}>
                        <defs>
                            {yKeys.map((key, i) => (
                                <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={COLORS[i]} stopOpacity={0.6} />
                                    <stop offset="95%" stopColor={COLORS[i]} stopOpacity={0} />
                                </linearGradient>
                            ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                        <XAxis dataKey={xKey} {...axisStyle} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                        <YAxis {...axisStyle} />
                        <Tooltip {...tooltipStyle} />
                        <Legend wrapperStyle={{ color: '#64748b', fontSize: 12, paddingTop: 8 }} />
                        {yKeys.map((key, i) => (
                            <Area key={key} type="monotone" dataKey={key} stroke={COLORS[i]} strokeWidth={2} fillOpacity={1} fill={`url(#grad-${i})`} />
                        ))}
                    </AreaChart>
                </ResponsiveContainer>
            );
        }

        // Pie Chart
        if (type.includes('pie')) {
            const labelKey = cfg.label_key;
            const valueKey = cfg.value_key;
            if (!labelKey || !valueKey) return <NoColumnWarning />;

            const grouped: Record<string, number> = {};
            for (const row of rawRows) {
                const k = String(row[labelKey] ?? 'Unknown').slice(0, 24);
                grouped[k] = (grouped[k] || 0) + (Number(row[valueKey]) || 0);
            }
            const pieData = Object.entries(grouped)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([name, value]) => ({ name, value }));

            return (
                <ResponsiveContainer width="100%" height={360}>
                    <PieChart>
                        <Pie
                            data={pieData}
                            cx="50%" cy="50%"
                            innerRadius="30%" outerRadius="60%"
                            paddingAngle={3}
                            dataKey="value"
                            nameKey="name"
                            stroke="none"
                        >
                            {pieData.map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip {...tooltipStyle} formatter={(v: any) => v.toLocaleString()} />
                        <Legend wrapperStyle={{ color: '#64748b', fontSize: 12 }} />
                    </PieChart>
                </ResponsiveContainer>
            );
        }

        // Scatter Plot
        if (type.includes('scatter') || type.includes('plot')) {
            const xKey = cfg.x_key;
            const yKey = cfg.y_key || cfg.y_keys?.[0];
            if (!xKey || !yKey) return <NoColumnWarning />;
            return (
                <ResponsiveContainer width="100%" height={360}>
                    <ScatterChart margin={{ top: 16, right: 24, bottom: 40, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
                        <XAxis type={typeof rawRows[0]?.[xKey] === 'number' ? 'number' : 'category'} dataKey={xKey} name={xKey} {...axisStyle} />
                        <YAxis type="number" dataKey={yKey} name={yKey} {...axisStyle} />
                        {cfg.tooltip_key && <ZAxis dataKey={cfg.tooltip_key} range={[40, 280]} />}
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} {...tooltipStyle} />
                        <Scatter name="Data Points" data={rawRows} fill="#ec4899" fillOpacity={0.75} />
                    </ScatterChart>
                </ResponsiveContainer>
            );
        }

        // Map
        if (type.includes('map') || type.includes('geo')) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                    <MapIcon size={56} className="opacity-40" />
                    <p className="text-base">Geographic Map</p>
                    <p className="text-sm text-slate-500">Requires GeoJSON location data</p>
                </div>
            );
        }

        // Knowledge Graph — SVG based (no ReactFlow)
        if (type.includes('graph') || type.includes('network') || type.includes('knowledge')) {
            if (graphLoading) return (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Loader2 size={48} className="animate-spin text-orange-400" />
                    <p className="text-sm">AI is generating the Knowledge Graph…</p>
                </div>
            );
            if (graphNodes.length === 0) return (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-500">
                    <Network size={56} className="opacity-40" />
                    <p className="text-sm">No graph data could be extracted from this file.</p>
                    <p className="text-xs text-slate-500">Works best with text-rich or relational data.</p>
                </div>
            );
            return <SimpleKnowledgeGraph nodes={graphNodes} edges={graphEdges} />;
        }

        // Fallback: generic bar chart with detected columns
        const keys = Object.keys(rawRows[0] || {});
        const numCols = keys.filter(k => typeof rawRows[0][k] === 'number');
        const catCols = keys.filter(k => typeof rawRows[0][k] === 'string');
        const xKey = catCols[0] || keys[0];
        if (numCols.length === 0) return <NoColumnWarning />;
        return (
            <ResponsiveContainer width="100%" height={360}>
                <BarChart data={rawRows} margin={{ top: 16, right: 24, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                    <XAxis dataKey={xKey} {...axisStyle} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                    <YAxis {...axisStyle} />
                    <Tooltip {...tooltipStyle} />
                    <Legend wrapperStyle={{ color: '#64748b', fontSize: 12, paddingTop: 8 }} />
                    {numCols.slice(0, 3).map((key, i) => (
                        <Bar key={key} dataKey={key} fill={COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={48} />
                    ))}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    return (
        <div className="flex flex-col h-full p-5 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200">
            {/* Executive Summary */}
            <div className="mb-5">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Sparkles size={18} className="text-orange-400" />
                        Executive Summary
                    </h2>
                    <button
                        onClick={downloadReport}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-orange-600 hover:bg-orange-50 hover:text-orange-700 rounded-lg text-sm font-semibold transition-colors duration-200 border border-slate-200 hover:border-orange-200 shadow-sm"
                    >
                        <Download size={14} /> Download Report
                    </button>
                </div>
                <div className="bg-white border border-slate-200 p-4 rounded-2xl">
                    <p className="text-slate-700 leading-relaxed text-sm">{data.insights.summary}</p>
                </div>
            </div>

            {/* Visualizations */}
            <div className="flex flex-col">
                <div className="flex items-center gap-3 mb-3" ref={chartAreaRef}>
                    <h3 className="text-base font-semibold text-slate-800">Visualizations</h3>
                    <span className="text-xs text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Info size={11} /> AI-selected columns · Ask in chat for more
                    </span>
                </div>

                {/* Dynamic Chart Tabs */}
                <div className="flex flex-wrap gap-2 mb-4">
                    {chartTabs.map((cfg, idx) => {
                        const isActive = idx === selectedIdx;
                        const isNew = idx >= (data.chart_configs?.length || initialTabs.length);
                        return (
                            <button
                                key={`${cfg.type}-${idx}`}
                                onClick={() => setSelectedIdx(idx)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-250 ${isActive
                                    ? 'bg-orange-500 text-white shadow-md'
                                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-orange-50 hover:text-orange-600 hover:border-orange-200'
                                    }`}
                            >
                                {getIcon(cfg.type)}
                                {cfg.title || cfg.type}
                                {isNew && (
                                    <span className="ml-0.5 text-[10px] px-1.5 py-0.5 rounded bg-fuchsia-500/25 text-fuchsia-300 border border-fuchsia-500/30">
                                        NEW
                                    </span>
                                )}
                            </button>
                        );
                    })}
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs text-slate-500 border border-dashed border-slate-200 cursor-default">
                        <Plus size={12} /> Ask AI for more
                    </div>
                </div>

                {/* Chart description */}
                {selectedConfig?.description && (
                    <p className="text-xs text-slate-500 mb-3 italic">{selectedConfig.description}</p>
                )}

                {/* Chart Canvas — fixed height for Recharts */}
                <div className="h-[420px] bg-slate-50 border border-slate-200 rounded-2xl p-4 relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-500/5 to-yellow-500/5 pointer-events-none rounded-2xl" />
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${selectedIdx}-${selectedConfig?.type}`}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.22 }}
                            className="w-full h-[388px] relative z-10"
                        >
                            {rawRows.length === 0 && !chartType.includes('graph') && !chartType.includes('knowledge')
                                ? (
                                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-500">
                                        <Activity size={48} className="mb-3 opacity-40" />
                                        <p className="text-sm">No tabular data to render for this file type.</p>
                                        <p className="text-xs text-slate-500 mt-1">Try a Knowledge Graph or ask a question in chat.</p>
                                    </div>
                                )
                                : renderChart()
                            }
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}

function NoColumnWarning() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 gap-2">
            <Info size={40} className="opacity-40" />
            <p className="text-sm">AI chart config is missing column mappings for this chart type.</p>
            <p className="text-xs text-slate-500">This may happen if the file lacks matching numeric or categorical columns.</p>
        </div>
    );
}
