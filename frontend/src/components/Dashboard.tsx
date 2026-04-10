import { useState, useEffect, useMemo, useRef } from 'react';
import type { InsightData, ChartConfig, ChartRequest } from '../App';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
    PieChart, Pie, Cell, AreaChart, Area, ScatterChart, Scatter, ZAxis
} from 'recharts';
import {
    Activity, PieChart as PieChartIcon, BarChart2, TrendingUp,
    Map as MapIcon, Network, Loader2, Plus, Info, Pencil, Download,
    LayoutGrid, Filter, CircleDot, TrendingDown, Box, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import axios from 'axios';
import Plot from 'react-plotly.js';
import ForceGraph2D from 'react-force-graph-2d';
import ChartEditor from './ChartEditor';
import type { EditorConfig } from './ChartEditor';

interface DashboardProps {
    data: InsightData;
    externalChartRequest?: ChartRequest | null;
}

const COLORS = ['#818CF8', '#34D399', '#FB923C', '#F472B6', '#38BDF8', '#A78BFA', '#FBBF24', '#F87171'];

const tooltipStyle = {
    contentStyle: {
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        color: 'var(--text-primary)',
        fontSize: '12px',
        fontFamily: 'var(--font-mono)',
    },
    itemStyle: { color: '#818CF8' }
};

const axisStyle = {
    stroke: 'var(--border)',
    tick: { fill: 'var(--text-muted)', fontSize: 11, fontFamily: 'DM Sans' }
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

// ─── KPI Generator (pure JS, zero AI) ──────────────────────
function generateKPIs(columnMeta: Record<string, any>, rawData: any[]) {
    return Object.entries(columnMeta)
        .filter(([, v]) => v.type === 'numeric')
        .slice(0, 4)
        .map(([col, meta]) => ({
            label: col,
            value: rawData.reduce((s, r) => s + (Number(r[col]) || 0), 0),
            max: meta.max,
            nullCount: meta.null_count ?? 0,
        }));
}

function formatKPIValue(v: number): string {
    if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
    if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'K';
    return v.toLocaleString();
}

// ─── Knowledge Graph ────────────────────────────────────────
interface GraphNode { id: string; data: { label: string } }
interface GraphEdge { id: string; source: string; target: string; label?: string }

function InteractiveKnowledgeGraph({ nodes, edges }: { nodes: GraphNode[]; edges: GraphEdge[] }) {
    const graphRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        if (!containerRef.current) return;
        const resizeObserver = new ResizeObserver(entries => {
            if (entries[0]) {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            }
        });
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, []);

    useEffect(() => {
        if (graphRef.current) {
            // Adjust physics forces: strong repulsion, longer links
            graphRef.current.d3Force('charge').strength(-400); 
            graphRef.current.d3Force('link').distance(80);     
            // Zoom to fit after a short delay so physics can settle the nodes naturally
            setTimeout(() => {
                if (graphRef.current) graphRef.current.zoomToFit(400, 50);
            }, 800);
        }
    }, [nodes, edges]);

    const graphData = useMemo(() => ({
        nodes: nodes.map(n => ({ id: n.id, label: n.data.label || n.id })),
        links: edges.map(e => ({ source: e.source, target: e.target, label: e.label })),
    }), [nodes, edges]);

    return (
        <div ref={containerRef} className="w-full h-full relative overflow-hidden" style={{ minHeight: 400, background: 'transparent' }}>
            {dimensions.width > 0 && (
                <ForceGraph2D
                    ref={graphRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    graphData={graphData}
                    nodeRelSize={6}
                    linkColor={() => 'rgba(129,140,248,0.4)'}
                    linkWidth={1.5}
                    linkDirectionalArrowLength={3.5}
                    linkDirectionalArrowRelPos={1}
                    linkCanvasObjectMode={() => 'after'}
                    linkCanvasObject={(link: any, ctx) => {
                        if (!link.label) return;
                        const MAX_FONT_SIZE = 4;
                        const label = link.label;
                        const start = link.source;
                        const end = link.target;
                        if (!start || !end || !start.x || !start.y || !end.x || !end.y) return;
                        const textPos = {
                            x: start.x + (end.x - start.x) / 2,
                            y: start.y + (end.y - start.y) / 2
                        };
                        const relLink = { x: end.x - start.x, y: end.y - start.y };
                        let textAngle = Math.atan2(relLink.y, relLink.x);
                        if (textAngle > Math.PI / 2) textAngle = -(Math.PI - textAngle);
                        if (textAngle < -Math.PI / 2) textAngle = -(Math.PI + textAngle);
                        const fontSize = MAX_FONT_SIZE;
                        ctx.font = `${fontSize}px Inter, sans-serif`;
                        ctx.save();
                        ctx.translate(textPos.x, textPos.y);
                        ctx.rotate(textAngle);
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = 'rgba(165,180,252,0.9)';
                        ctx.fillText(label, 0, -3);
                        ctx.restore();
                    }}
                    nodeCanvasObject={(node: any, ctx, globalScale) => {
                        const label = node.label;
                        const fontSize = 12 / globalScale;
                        ctx.font = `500 ${fontSize}px Inter, sans-serif`;
                        const textWidth = ctx.measureText(label).width;
                        const bckgDimensions = [textWidth + (16 / globalScale), fontSize + (8 / globalScale)]; // padding

                        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
                        ctx.fillStyle = isDark ? 'rgba(30, 41, 59, 1)' : 'rgba(255, 255, 255, 1)';
                        
                        ctx.beginPath();
                        const r = 4 / globalScale;
                        const x = node.x - bckgDimensions[0] / 2;
                        const y = node.y - bckgDimensions[1] / 2;
                        const w = bckgDimensions[0];
                        const h = bckgDimensions[1];
                        ctx.moveTo(x + r, y);
                        ctx.lineTo(x + w - r, y);
                        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
                        ctx.lineTo(x + w, y + h - r);
                        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
                        ctx.lineTo(x + r, y + h);
                        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
                        ctx.lineTo(x, y + r);
                        ctx.quadraticCurveTo(x, y, x + r, y);
                        ctx.closePath();
                        ctx.fill();
                        ctx.lineWidth = 1 / globalScale;
                        ctx.strokeStyle = isDark ? 'rgba(51, 65, 85, 1)' : 'rgba(226, 232, 240, 1)';
                        ctx.stroke();

                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillStyle = isDark ? '#f8fafc' : '#1e293b';
                        ctx.fillText(label, node.x, node.y + (1 / globalScale));
                        
                        node.__bckgDimensions = bckgDimensions; // save for pointer area hit detection
                    }}
                    nodePointerAreaPaint={(node: any, color, ctx) => {
                        ctx.fillStyle = color;
                        const bckgDimensions = node.__bckgDimensions;
                        if (bckgDimensions) {
                            ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
                        } else {
                            ctx.beginPath();
                            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI, false);
                            ctx.fill();
                        }
                    }}
                />
            )}
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
    const [isEditing, setIsEditing] = useState(false);

    const downloadChart = () => {
        const activeChart = chartTabs[selectedIdx];
        if (!activeChart?.plotly_json) return;
        const gd = document.querySelector('.js-plotly-plot') as any;
        if (gd && (window as any).Plotly) {
            (window as any).Plotly.downloadImage(gd, { format: 'png', width: 1200, height: 700, filename: `${activeChart.title || 'chart'}_datasense` });
        }
    };

    const addBlankChart = () => {
        const blank: ChartConfig = { type: 'Bar Chart', title: 'New Chart', description: '', plotly_json: undefined, isBlank: true };
        setChartTabs(prev => [...prev, blank]);
        setSelectedIdx(chartTabs.length);
        setIsEditing(true);
    };

    // Knowledge Graph state
    const [graphNodes, setGraphNodes] = useState<GraphNode[]>([]);
    const [graphEdges, setGraphEdges] = useState<GraphEdge[]>([]);
    const [graphLoading, setGraphLoading] = useState(false);
    const [graphFetched, setGraphFetched] = useState(false);
    const lastProcessedTs = useRef(0);
    const chartAreaRef = useRef<HTMLDivElement>(null);

    const autoConfigForType = (chartTypeName: string): ChartConfig => {
        const raw = data.original_data || [];
        const keys = raw.length > 0 ? Object.keys(raw[0]) : [];
        const numericCols = keys.filter(k => typeof raw[0]?.[k] === 'number');
        const categoricalCols = keys.filter(k => typeof raw[0]?.[k] === 'string');
        const type = chartTypeName.toLowerCase();
        if (type.includes('bar')) return { type: chartTypeName, title: chartTypeName, x_key: categoricalCols[0] || keys[0], y_keys: numericCols.slice(0, 3) };
        if (type.includes('line') || type.includes('area') || type.includes('trend')) return { type: chartTypeName, title: chartTypeName, x_key: categoricalCols[0] || keys[0], y_keys: numericCols.slice(0, 3) };
        if (type.includes('donut')) return { type: chartTypeName, title: chartTypeName, label_key: categoricalCols[0] || keys[0], value_key: numericCols[0] || keys[1] };
        if (type.includes('pie')) return { type: chartTypeName, title: chartTypeName, label_key: categoricalCols[0] || keys[0], value_key: numericCols[0] || keys[1] };
        if (type.includes('scatter')) return { type: chartTypeName, title: chartTypeName, x_key: numericCols[0] || keys[0], y_keys: [numericCols[1] || numericCols[0] || keys[1]], tooltip_key: categoricalCols[0] };
        if (type.includes('bubble')) return { type: chartTypeName, title: chartTypeName, x_key: numericCols[0] || keys[0], y_keys: [numericCols[1] || numericCols[0]], size_key: numericCols[2] || numericCols[0] };
        if (type.includes('histogram')) return { type: chartTypeName, title: chartTypeName, x_key: numericCols[0] || keys[0] };
        if (type.includes('heatmap')) return { type: chartTypeName, title: chartTypeName, columns: numericCols.slice(0, 10) };
        if (type.includes('box') || type.includes('violin')) return { type: chartTypeName, title: chartTypeName, x_key: categoricalCols[0] || keys[0], y_keys: [numericCols[0]] };
        if (type.includes('waterfall')) return { type: chartTypeName, title: chartTypeName, x_key: categoricalCols[0] || keys[0], y_keys: [numericCols[0]] };
        if (type.includes('treemap') || type.includes('sunburst')) return { type: chartTypeName, title: chartTypeName, path_cols: categoricalCols.slice(0, 2), value_key: numericCols[0] };
        if (type.includes('funnel')) return { type: chartTypeName, title: chartTypeName, stage_col: categoricalCols[0] || keys[0], value_key: numericCols[0] };
        return { type: chartTypeName, title: chartTypeName };
    };

    useEffect(() => {
        if (!externalChartRequest) return;
        if (externalChartRequest.ts <= lastProcessedTs.current) return;
        lastProcessedTs.current = externalChartRequest.ts;
        const incoming = externalChartRequest.type.trim();
        setChartTabs(prevTabs => {
            const existsAt = prevTabs.findIndex(t => t.type.toLowerCase() === incoming.toLowerCase());
            if (existsAt >= 0) {
                setTimeout(() => { setSelectedIdx(existsAt); chartAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
                return prevTabs;
            } else {
                const newConfig = autoConfigForType(incoming);
                const updated = [...prevTabs, newConfig];
                setTimeout(() => { setSelectedIdx(updated.length - 1); chartAreaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
                return updated;
            }
        });
    }, [externalChartRequest]);

    const selectedConfig = chartTabs[selectedIdx] || chartTabs[0];
    const chartType = selectedConfig?.type?.toLowerCase() || '';
    const rawRows = useMemo(() => prepareRows(data.original_data || []), [data.original_data]);
    const kpis = useMemo(() => generateKPIs(data.column_meta || {}, data.original_data || []), [data.column_meta, data.original_data]);

    useEffect(() => {
        const isGraph = chartType.includes('graph') || chartType.includes('network') || chartType.includes('knowledge');
        if (isGraph && !graphFetched && !graphLoading) {
            setGraphLoading(true);
            axios.post('http://localhost:8000/api/graph', { content_summary: data.content_summary })
                .then(res => { setGraphNodes(res.data?.nodes || []); setGraphEdges(res.data?.edges || []); })
                .catch(() => { setGraphNodes([]); setGraphEdges([]); })
                .finally(() => { setGraphLoading(false); setGraphFetched(true); });
        }
    }, [chartType, graphFetched]);

    const getIcon = (type: string, size = 14) => {
        const t = type.toLowerCase();
        if (t.includes('pie') || t.includes('donut')) return <PieChartIcon size={size} />;
        if (t.includes('bar')) return <BarChart2 size={size} />;
        if (t.includes('line') || t.includes('trend') || t.includes('area')) return <TrendingUp size={size} />;
        if (t.includes('scatter')) return <Activity size={size} />;
        if (t.includes('histogram')) return <Layers size={size} />;
        if (t.includes('box')) return <Box size={size} />;
        if (t.includes('violin')) return <Activity size={size} />;
        if (t.includes('heatmap')) return <Layers size={size} />;
        if (t.includes('treemap') || t.includes('sunburst')) return <LayoutGrid size={size} />;
        if (t.includes('funnel')) return <Filter size={size} />;
        if (t.includes('bubble')) return <CircleDot size={size} />;
        if (t.includes('waterfall')) return <TrendingDown size={size} />;
        if (t.includes('map') || t.includes('geo')) return <MapIcon size={size} />;
        if (t.includes('graph') || t.includes('network') || t.includes('knowledge')) return <Network size={size} />;
        return <Activity size={size} />;
    };

    // ─── CHART RENDERER ──────────────────────────────────────
    const renderChart = () => {
        const cfg = selectedConfig;
        if (!cfg) return null;

        if (cfg.isBlank && !cfg.plotly_json) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
                    <Plus size={24} style={{ opacity: 0.4 }} />
                    <p style={{ fontSize: 13 }}>Select a chart type below to visualize your data</p>
                </div>
            );
        }

        if (cfg.plotly_json) {
            try {
                const parsed = JSON.parse(cfg.plotly_json);
                if (parsed.error) {
                    return (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
                            <Info size={40} style={{ opacity: 0.4, color: 'var(--danger)' }} />
                            <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--danger)' }}>Backend Plotly Error</p>
                            <p style={{ fontSize: 12 }}>{parsed.error}</p>
                        </div>
                    );
                }
                return (
                    <div className="w-full h-full">
                        <Plot data={parsed.data} layout={{ ...parsed.layout, autosize: true }}
                              useResizeHandler={true} style={{ width: '100%', height: '100%' }}
                              config={{ responsive: true, displayModeBar: false }} />
                    </div>
                );
            } catch (err) { console.error("Failed to parse plotly json", err); }
        }

        const type = cfg.type.toLowerCase();
        if (type.includes('bar')) {
            const xKey = cfg.x_key; const yKeys = cfg.y_keys || [];
            if (!xKey || yKeys.length === 0) return <NoColumnWarning />;
            return (
                <ResponsiveContainer width="100%" height={360}>
                    <BarChart data={rawRows} margin={{ top: 16, right: 24, left: 0, bottom: 40 }} barGap={4}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey={xKey} {...axisStyle} angle={-30} textAnchor="end" interval="preserveStartEnd" />
                        <YAxis {...axisStyle} /><Tooltip {...tooltipStyle} /><Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }} />
                        {yKeys.map((key, i) => (<Bar key={key} dataKey={key} fill={COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} maxBarSize={48} />))}
                    </BarChart>
                </ResponsiveContainer>
            );
        }

        if (type.includes('line') || type.includes('area') || type.includes('trend')) {
            const xKey = cfg.x_key; const yKeys = cfg.y_keys || [];
            if (!xKey || yKeys.length === 0) return <NoColumnWarning />;
            return (
                <ResponsiveContainer width="100%" height={360}>
                    <AreaChart data={rawRows} margin={{ top: 16, right: 24, left: 0, bottom: 40 }}>
                        <defs>{yKeys.map((key, i) => (
                            <linearGradient key={key} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={COLORS[i]} stopOpacity={0.4} /><stop offset="95%" stopColor={COLORS[i]} stopOpacity={0} />
                            </linearGradient>))}</defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                        <XAxis dataKey={xKey} {...axisStyle} angle={-30} textAnchor="end" interval="preserveStartEnd" /><YAxis {...axisStyle} />
                        <Tooltip {...tooltipStyle} /><Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }} />
                        {yKeys.map((key, i) => (<Area key={key} type="monotone" dataKey={key} stroke={COLORS[i]} strokeWidth={2} fillOpacity={1} fill={`url(#grad-${i})`} />))}
                    </AreaChart>
                </ResponsiveContainer>
            );
        }

        if (type.includes('pie')) {
            const labelKey = cfg.label_key; const valueKey = cfg.value_key;
            if (!labelKey || !valueKey) return <NoColumnWarning />;
            const grouped: Record<string, number> = {};
            for (const row of rawRows) { const k = String(row[labelKey] ?? 'Unknown').slice(0, 24); grouped[k] = (grouped[k] || 0) + (Number(row[valueKey]) || 0); }
            const pieData = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));
            return (
                <ResponsiveContainer width="100%" height={360}>
                    <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius="30%" outerRadius="60%" paddingAngle={3} dataKey="value" nameKey="name" stroke="none">
                        {pieData.map((_, i) => (<Cell key={i} fill={COLORS[i % COLORS.length]} />))}
                    </Pie><Tooltip {...tooltipStyle} formatter={(v: any) => v.toLocaleString()} /><Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
            );
        }

        if (type.includes('scatter') || type.includes('plot')) {
            const xKey = cfg.x_key; const yKey = cfg.y_keys?.[0];
            if (!xKey || !yKey) return <NoColumnWarning />;
            return (
                <ResponsiveContainer width="100%" height={360}>
                    <ScatterChart margin={{ top: 16, right: 24, bottom: 40, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                        <XAxis type={typeof rawRows[0]?.[xKey] === 'number' ? 'number' : 'category'} dataKey={xKey} name={xKey} {...axisStyle} />
                        <YAxis type="number" dataKey={yKey} name={yKey} {...axisStyle} />
                        {cfg.tooltip_key && <ZAxis dataKey={cfg.tooltip_key} range={[40, 280]} />}
                        <Tooltip cursor={{ strokeDasharray: '3 3' }} {...tooltipStyle} />
                        <Scatter name="Data Points" data={rawRows} fill="#F472B6" fillOpacity={0.75} />
                    </ScatterChart>
                </ResponsiveContainer>
            );
        }

        if (type.includes('map') || type.includes('geo')) {
            return (<div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
                <MapIcon size={56} style={{ opacity: 0.3 }} /><p style={{ fontSize: 14 }}>Geographic Map</p><p style={{ fontSize: 12 }}>Requires GeoJSON location data</p>
            </div>);
        }

        if (type.includes('graph') || type.includes('network') || type.includes('knowledge')) {
            if (graphLoading) return (<div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
                <Loader2 size={48} className="animate-spin" style={{ color: 'var(--accent)' }} /><p style={{ fontSize: 13 }}>AI is generating the Knowledge Graph…</p></div>);
            if (graphNodes.length === 0) return (<div className="w-full h-full flex flex-col items-center justify-center gap-3" style={{ color: 'var(--text-muted)' }}>
                <Network size={56} style={{ opacity: 0.3 }} /><p style={{ fontSize: 13 }}>No graph data could be extracted.</p></div>);
            return <InteractiveKnowledgeGraph nodes={graphNodes} edges={graphEdges} />;
        }

        // Fallback
        const keys = Object.keys(rawRows[0] || {});
        const numCols = keys.filter(k => typeof rawRows[0][k] === 'number');
        const catCols = keys.filter(k => typeof rawRows[0][k] === 'string');
        const xKey = catCols[0] || keys[0];
        if (numCols.length === 0) return <NoColumnWarning />;
        return (
            <ResponsiveContainer width="100%" height={360}>
                <BarChart data={rawRows} margin={{ top: 16, right: 24, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey={xKey} {...axisStyle} angle={-30} textAnchor="end" interval="preserveStartEnd" /><YAxis {...axisStyle} />
                    <Tooltip {...tooltipStyle} /><Legend wrapperStyle={{ color: 'var(--text-muted)', fontSize: 12, paddingTop: 8 }} />
                    {numCols.slice(0, 3).map((key, i) => (<Bar key={key} dataKey={key} fill={COLORS[i]} radius={[4, 4, 0, 0]} maxBarSize={48} />))}
                </BarChart>
            </ResponsiveContainer>
        );
    };

    return (
        <div className="flex flex-col">
            {/* ─── Summary Strip ────────────────────────── */}
            <div className="mb-6" style={{ borderLeft: '2px solid var(--accent)', padding: '12px 16px', background: 'var(--accent-dim)', borderRadius: '0 8px 8px 0' }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.65 }}>{data.insights.summary}</p>
            </div>

            {/* ─── KPI Row ──────────────────────────────── */}
            {kpis.length > 0 && (
                <div className="grid gap-3 mb-7" style={{ gridTemplateColumns: `repeat(${Math.min(kpis.length, 4)}, 1fr)` }}>
                    {kpis.map(kpi => (
                        <div key={kpi.label} className="transition-transform hover:-translate-y-0.5"
                             style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px' }}>
                            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {kpi.label}
                            </div>
                            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500, color: 'var(--text-primary)', lineHeight: 1 }}>
                                {formatKPIValue(kpi.value)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ─── Chart Section ─────────────────────────── */}
            <div className="flex flex-col" ref={chartAreaRef}>
                {/* Tab Row */}
                <div className="flex items-center gap-1 mb-3 overflow-x-auto scrollbar-none">
                    {chartTabs.map((cfg, idx) => {
                        const isActive = idx === selectedIdx;
                        const isNew = idx >= (data.chart_configs?.length || initialTabs.length);
                        return (
                            <button key={`${cfg.type}-${idx}`} onClick={() => { setSelectedIdx(idx); setIsEditing(false); }}
                                className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] whitespace-nowrap transition-all"
                                style={{
                                    background: isActive ? 'var(--bg-elevated)' : 'transparent',
                                    color: isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                    border: isActive ? '1px solid var(--border)' : '1px solid transparent',
                                    cursor: 'pointer',
                                }}>
                                <span style={{ color: isActive ? 'var(--accent-text)' : undefined }}>{getIcon(cfg.type)}</span>
                                {cfg.title || cfg.type}
                                {isNew && <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.05em', padding: '2px 5px', borderRadius: 4, background: 'var(--accent-dim)', color: 'var(--accent-text)', textTransform: 'uppercase' }}>NEW</span>}
                            </button>
                        );
                    })}
                    <button onClick={addBlankChart}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-all"
                        style={{ border: '1px dashed var(--border)', color: 'var(--text-muted)', cursor: 'pointer' }}>
                        <Plus size={12} /> Add Chart
                    </button>
                </div>

                {/* Chart Card */}
                <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: isEditing ? '16px 16px 0 0' : 16, overflow: 'hidden' }}>
                    {/* Card Header */}
                    <div className="flex items-center justify-between" style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-dim)' }}>
                        <div>
                            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{selectedConfig?.title || selectedConfig?.type}</div>
                            {selectedConfig?.description && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{selectedConfig.description}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                            <button onClick={() => setIsEditing(p => !p)} title="Edit chart"
                                className="w-7 h-7 rounded-md flex items-center justify-center transition-all"
                                style={{ color: isEditing ? 'var(--accent-text)' : 'var(--text-muted)', background: isEditing ? 'var(--accent-dim)' : 'transparent' }}>
                                <Pencil size={14} />
                            </button>
                            <button onClick={downloadChart} disabled={!selectedConfig?.plotly_json} title="Download chart"
                                className="w-7 h-7 rounded-md flex items-center justify-center transition-all disabled:opacity-30"
                                style={{ color: 'var(--text-muted)' }}>
                                <Download size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Chart Body */}
                    <div style={{ padding: '8px 8px 16px', height: 420 }}>
                        <AnimatePresence mode="wait">
                            <motion.div key={`${selectedIdx}-${selectedConfig?.type}`}
                                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.22 }} className="w-full h-full">
                                {rawRows.length === 0 && !chartType.includes('graph') && !chartType.includes('knowledge')
                                    ? (<div className="w-full h-full flex flex-col items-center justify-center" style={{ color: 'var(--text-muted)' }}>
                                        <Activity size={48} className="mb-3" style={{ opacity: 0.3 }} />
                                        <p style={{ fontSize: 13 }}>No tabular data for this file type.</p>
                                      </div>)
                                    : renderChart()}
                            </motion.div>
                        </AnimatePresence>
                    </div>
                </div>

                {/* Chart Editor Panel */}
                <AnimatePresence>
                    {isEditing && selectedConfig && (
                        <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 16px 16px' }}>
                            <ChartEditor
                                key={selectedIdx}
                                fileId={data.file_id}
                                aiConfig={selectedConfig as EditorConfig}
                                columnMeta={data.column_meta || {}}
                                currentPlotlyJson={selectedConfig.plotly_json}
                                onApply={(newJson, appliedCfg) => {
                                    setChartTabs(prev => {
                                        const updated = [...prev];
                                        updated[selectedIdx] = { ...updated[selectedIdx], ...appliedCfg, plotly_json: newJson, isBlank: false };
                                        return updated;
                                    });
                                    setIsEditing(false);
                                }}
                                onClose={() => setIsEditing(false)}
                            />
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

function NoColumnWarning() {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2" style={{ color: 'var(--text-muted)' }}>
            <Info size={40} style={{ opacity: 0.3 }} />
            <p style={{ fontSize: 13 }}>AI chart config is missing column mappings for this chart type.</p>
            <p style={{ fontSize: 12 }}>This may happen if the file lacks matching numeric or categorical columns.</p>
        </div>
    );
}
