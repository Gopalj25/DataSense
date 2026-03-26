import { useState } from 'react';
import FileUpload from './components/FileUpload';
import Dashboard from './components/Dashboard';
import Chat from './components/Chat';
import { Database } from 'lucide-react';

export type ChartConfig = {
  type: string;
  title: string;
  description?: string;
  plotly_json?: string;
  x_key?: string;
  y_keys?: string[];
  label_key?: string;
  value_key?: string;
  y_key?: string;
  tooltip_key?: string;
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
};

// Timestamped request ensures React always sees a new object
export type ChartRequest = {
  type: string;
  ts: number;
  new_chart_data?: ChartConfig | null;
};

function App() {
  const [insightData, setInsightData] = useState<InsightData | null>(null);
  const [chartRequest, setChartRequest] = useState<ChartRequest | null>(null);

  const handleUploadSuccess = (data: InsightData) => {
    setInsightData(data);
    setChartRequest(null);
  };

  const handleChartRequested = (chartType: string, newChartData?: ChartConfig | null) => {
    // Always create a new object with a fresh timestamp so React detects the change
    setChartRequest({ type: chartType, ts: Date.now(), new_chart_data: newChartData });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-yellow-50 text-slate-800 flex flex-col font-sans">
      {/* Dynamic Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-orange-300/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-yellow-300/20 rounded-full blur-[120px]" />
      </div>

      {/* Header */}
      <header className="relative z-10 w-full p-6 flex items-center gap-3 border-b border-slate-200 bg-white/70 backdrop-blur-md">
        <div className="p-2 bg-gradient-to-tr from-orange-500 to-yellow-500 rounded-xl shadow-lg shadow-orange-500/20">
          <Database size={24} className="text-white" />
        </div>
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-600 to-yellow-500 tracking-tight">
          DataSense
        </h1>
        <span className="ml-4 text-sm font-medium text-orange-700 bg-orange-100 px-3 py-1 rounded-full border border-orange-200">
          AI Data to Dashboard
        </span>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 flex-1 w-full max-w-[1600px] mx-auto p-4 md:p-6 flex flex-col h-[calc(100vh-89px)] overflow-hidden">
        {!insightData ? (
          <div className="flex-1 flex items-center justify-center">
            <FileUpload onSuccess={handleUploadSuccess} />
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            {/* Top Panel: Dashboard */}
            <div className="flex-1 min-h-[400px] bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-xl overflow-hidden shadow-slate-200/50">
              <Dashboard data={insightData} externalChartRequest={chartRequest} />
            </div>

            {/* Bottom Panel: Chat */}
            <div className="h-[400px] shrink-0 bg-white/80 backdrop-blur-xl border border-slate-200 rounded-3xl shadow-xl overflow-hidden shadow-slate-200/50">
              <Chat
                fileId={insightData.file_id}
                filename={insightData.filename}
                columnMeta={insightData.column_meta}
                contentSummary={insightData.content_summary}
                onChartRequested={handleChartRequested}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
