import { useState } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import Chat from './components/Chat';
import Sidebar from './components/Sidebar';
import type { ViewType } from './components/Sidebar';
import { Download, MessageSquare, Moon, Sun, Loader2 } from 'lucide-react';
import { generateReport } from './utils/reportGenerator';

export type ChartConfig = {
  type: string;
  title: string;
  description?: string;
  plotly_json?: string;
  x_key?: string;
  y_keys?: string[];
  label_key?: string;
  value_key?: string;
  y_key?: string;          // AI agent returns this for singular-y charts — normalized to y_keys on upload
  tooltip_key?: string;
  nbins?: number;
  columns?: string[];
  path_cols?: string[];
  stage_col?: string;
  size_key?: string;
  color_col?: string;
  color?: string;           // Editor palette hex — preserved across edit sessions
  isBlank?: boolean;
};

export type InsightData = {
  file_id: string;
  filename: string;
  content_summary: string;
  insights: {
    summary: string;
    suggested_charts: string[];
  };
  original_data: any[];
  chart_configs: ChartConfig[];
  column_meta: Record<string, any>;
  chat_suggestions?: string[];
};

export type ChartRequest = {
  type: string;
  ts: number;
  new_chart_data?: ChartConfig | null;
};

function App() {
  const [insightData, setInsightData] = useState<InsightData | null>(null);
  const [chartRequest, setChartRequest] = useState<ChartRequest | null>(null);
  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPinned, setChatPinned] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState('');

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };

  const handleUploadSuccess = (data: InsightData) => {
    // Normalize y_key → y_keys for charts where AI agent returns singular y_key
    // (Box Plot, Violin, Bubble, Waterfall). Without this, the ChartEditor
    // would show an empty Y axis since EditorConfig only reads y_keys.
    if (data.chart_configs) {
      data.chart_configs = data.chart_configs.map(cfg => ({
        ...cfg,
        y_keys: cfg.y_keys?.length ? cfg.y_keys : (cfg.y_key ? [cfg.y_key] : undefined),
      }));
    }
    setInsightData(data);
    setChartRequest(null);
    setActiveView('dashboard');
  };

  const handleChartRequested = (chartType: string, newChartData?: ChartConfig | null) => {
    setChartRequest({ type: chartType, ts: Date.now(), new_chart_data: newChartData });
  };

  const rowCount = insightData?.original_data?.length ?? 0;
  const colCount = insightData?.column_meta ? Object.keys(insightData.column_meta).length : 0;
  const chartCount = insightData?.chart_configs?.length ?? 0;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-canvas)', color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>

      {/* ─── TOPBAR ─────────────────────────────────────────── */}
      <header className="h-12 flex items-center px-4 gap-4 shrink-0 z-40"
              style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
        {/* Logo */}
        <div className="flex items-center gap-2">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <rect x="4" y="4" width="16" height="16" rx="3" transform="rotate(6 12 12)"
                  fill="var(--accent)" opacity="0.8" />
            <rect x="6" y="6" width="12" height="12" rx="2" transform="rotate(6 12 12)"
                  fill="var(--accent)" />
          </svg>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: 'var(--text-primary)' }}>
            DataSense
          </span>
        </div>

        {/* Center: File pill */}
        <div className="flex-1 flex justify-center">
          {insightData ? (
            <span className="px-3 py-1 rounded-lg text-xs"
                  style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {insightData.filename} · {rowCount.toLocaleString()} rows · {colCount} cols · {chartCount} charts
            </span>
          ) : (
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No file loaded</span>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2">
          {insightData && (
            <button
              title="Download Full Report (PDF)"
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{ color: exporting ? 'var(--accent)' : 'var(--text-muted)' }}
              disabled={exporting}
              onMouseEnter={e => !exporting && (e.currentTarget.style.background = 'var(--bg-elevated)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={async () => {
                if (exporting) return;
                setExporting(true);
                setExportStatus('Starting…');
                try {
                  await generateReport(insightData, (status) => setExportStatus(status));
                } catch (e) {
                  console.error('Report generation failed:', e);
                } finally {
                  setExporting(false);
                  setExportStatus('');
                }
              }}
            >
              {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            </button>
          )}
          <button
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
            style={{ color: 'var(--text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      {/* Export progress overlay */}
      {exporting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center"
             style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
          <div className="flex flex-col items-center gap-3 p-6 rounded-2xl"
               style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <p style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>Generating Report</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{exportStatus}</p>
          </div>
        </div>
      )}

      {/* ─── BODY ───────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar activeView={activeView} onViewChange={setActiveView} hasData={!!insightData} />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto" style={{ marginLeft: 52, height: 'calc(100vh - 48px)' }}>
          {!insightData ? (
            <FileUpload onSuccess={handleUploadSuccess} />
          ) : activeView === 'dashboard' ? (
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
              <Dashboard data={insightData} externalChartRequest={chartRequest} />
            </div>
          ) : activeView === 'table' ? (
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
              <div className="mb-3" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Showing {Math.min(50, rowCount)} of {rowCount.toLocaleString()} rows
              </div>
              <div className="overflow-auto rounded-xl" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {Object.keys(insightData.original_data[0] || {}).map(col => (
                        <th key={col} className="text-left whitespace-nowrap sticky top-0"
                            style={{ background: 'var(--bg-surface)', padding: '10px 16px', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {insightData.original_data.slice(0, 50).map((row, i) => (
                      <tr key={i} className="transition-colors"
                          style={{ borderBottom: '1px solid var(--border-dim)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-overlay)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        {Object.entries(row).map(([col, val], j) => (
                          <td key={j} className="whitespace-nowrap" style={{
                            padding: '8px 16px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis',
                            color: typeof val === 'number' ? 'var(--text-primary)' : 'var(--text-secondary)',
                            textAlign: typeof val === 'number' ? 'right' : 'left'
                          }}>
                            {val != null ? String(val) : '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Schema View */
            <div style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
              <h2 style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 16 }}>Data Schema</h2>
              <table className="w-full" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Column', 'Type', 'Unique', 'Min', 'Max', 'Nulls'].map(h => (
                      <th key={h} className="text-left"
                          style={{ color: 'var(--text-muted)', fontWeight: 500, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '0 12px 8px 0', borderBottom: '1px solid var(--border)' }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(insightData.column_meta).map(([col, meta]: [string, any]) => (
                    <tr key={col} style={{ borderBottom: '1px solid var(--border-dim)' }}>
                      <td style={{ padding: '7px 12px 7px 0', color: 'var(--text-primary)' }}>{col}</td>
                      <td style={{ padding: '7px 12px 7px 0' }}>
                        <span className="inline-block text-center" style={{
                          fontSize: 9, fontWeight: 600, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                          background: meta.type === 'numeric' ? 'var(--success-dim)' : 'var(--accent-dim)',
                          color: meta.type === 'numeric' ? 'var(--success)' : 'var(--accent-text)',
                        }}>
                          {meta.type}
                        </span>
                      </td>
                      <td style={{ padding: '7px 12px 7px 0', color: 'var(--text-secondary)' }}>{meta.nunique ?? '—'}</td>
                      <td style={{ padding: '7px 12px 7px 0', color: 'var(--text-secondary)' }}>{meta.min != null ? meta.min : '—'}</td>
                      <td style={{ padding: '7px 12px 7px 0', color: 'var(--text-secondary)' }}>{meta.max != null ? meta.max : '—'}</td>
                      <td style={{ padding: '7px 12px 7px 0', color: 'var(--text-secondary)' }}>{meta.null_count ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>

        {/* ─── CHAT SLIDE-OVER / PINNED PANEL ───────────────── */}
        {!chatPinned && <div className={`chat-backdrop ${chatOpen ? 'open' : ''}`} onClick={() => setChatOpen(false)} />}
        <div 
          className={chatPinned ? "chat-panel-pinned flex flex-col w-[380px] min-w-[380px] border-l border-[var(--border)] bg-[var(--bg-surface)]" : `chat-panel ${chatOpen ? 'open' : ''}`} 
          style={chatPinned ? {} : { display: 'flex', flexDirection: 'column' }}
        >
          {insightData && (
            <Chat
              fileId={insightData.file_id}
              filename={insightData.filename}
              columnMeta={insightData.column_meta}
              contentSummary={insightData.content_summary}
              chatSuggestions={insightData.chat_suggestions}
              onChartRequested={(type, data) => handleChartRequested(type, data)}
              isPinned={chatPinned}
              onPin={() => {
                if (chatPinned) {
                  setChatPinned(false);
                } else {
                  setChatPinned(true);
                  setChatOpen(false);
                }
              }}
            />
          )}
        </div>

        {/* Chat FAB */}
        {insightData && !chatOpen && !chatPinned && (
          <button
            onClick={() => setChatOpen(true)}
            className="fixed z-50 flex items-center justify-center transition-all"
            style={{
              right: 24, bottom: 32, width: 52, height: 52, borderRadius: 14,
              background: 'var(--accent)', color: 'white',
              boxShadow: '0 4px 24px rgba(99,102,241,0.35)',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(99,102,241,0.45)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 4px 24px rgba(99,102,241,0.35)'; }}
          >
            <MessageSquare size={22} />
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
