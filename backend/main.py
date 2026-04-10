from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import uuid
import pandas as pd
import plotly.express as px
import io
import json

from data_parser import DataParser
from ai_agent import AIAgent
from visualizer import Visualizer

app = FastAPI(title="DataSense API")

# Global in-memory cache for DataFrames to allow complete data visualization
GLOBAL_DFS = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Full pipeline:
    1. Parse file into Global DataFrame cache
    2. Extract fast schema + metadata
    3. Agent 1 (Gemini) → summary + recommend chart configs using actual backend functions
    4. Return Plotly JSON to frontend
    """
    content = await file.read()
    filename = file.filename.lower()
    file_id = str(uuid.uuid4())

    df = None
    parsed_text = ""
    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content))
            parsed_text = DataParser._summarize_dataframe(df, "CSV")
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            df = pd.read_excel(io.BytesIO(content))
            parsed_text = DataParser._summarize_dataframe(df, "Excel")
        elif filename.endswith(".json"):
            data = json.loads(content.decode('utf-8'))
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                df = pd.DataFrame(data)
                parsed_text = DataParser._summarize_dataframe(df, "JSON Array")
            else:
                 parsed_text = DataParser.parse_json(content)
        elif filename.endswith(".pdf"):
            parsed_text = DataParser.parse_pdf(content)
        else:
            raise HTTPException(status_code=400, detail="Unsupported file type.")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Parsing error: {str(e)}")

    # Cache the dataframe
    if df is not None:
        GLOBAL_DFS[file_id] = df

    # Extract raw rows + column metadata
    raw_sample = df.head(50).fillna("").to_dict(orient="records") if df is not None else []
    column_meta = DataParser.extract_column_metadata(content, filename)

    # Multi-Agent AI Analysis (now generates Plotly arguments)
    analysis = AIAgent.analyze_and_configure_charts(parsed_text, filename, column_meta)
    
    # Pre-generate Llama 3 chat suggestions so they are ready immediately
    suggestions = AIAgent.generate_suggestions(column_meta, filename)

    # Convert the AI "logical" configs into actual Plotly JSON strings using the complete DataFrame
    plot_definitions = []
    if df is not None:
        for config in analysis.get("charts", []):
            chart_type = config.get("type", "")
            fig_json = None
            if chart_type == "Bar Chart":
                fig_json = Visualizer.generate_bar_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_keys", []))
            elif chart_type == "Line Chart":
                fig_json = Visualizer.generate_line_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_keys", []))
            elif chart_type == "Pie Chart":
                fig_json = Visualizer.generate_pie_chart(df, config.get("title", ""), config.get("label_key"), config.get("value_key"))
            elif chart_type == "Scatter Plot":
                fig_json = Visualizer.generate_scatter_plot(df, config.get("title", ""), config.get("x_key"), config.get("y_keys", [None])[0], config.get("tooltip_key"))
            elif chart_type == "Histogram":
                fig_json = Visualizer.generate_histogram(df, config.get("title", ""), config.get("x_key"), config.get("nbins", 30))
            elif chart_type == "Box Plot":
                fig_json = Visualizer.generate_box_plot(df, config.get("title", ""), config.get("x_key"), config.get("y_key"))
            elif chart_type == "Heatmap":
                fig_json = Visualizer.generate_heatmap(df, config.get("title", ""),config.get("columns"))
            elif chart_type == "Treemap":
                fig_json = Visualizer.generate_treemap(df, config.get("title", ""), config.get("path_cols", []), config.get("value_key", ""))
            elif chart_type == "Funnel":
                fig_json = Visualizer.generate_funnel(df, config.get("title", ""), config.get("stage_col"), config.get("value_key"))
            elif chart_type == "Violin Plot":
                fig_json = Visualizer.generate_violin(df, config.get("title", ""), config.get("x_key"), config.get("y_key"))
            elif chart_type == "Bubble Chart":
                fig_json = Visualizer.generate_bubble_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_key"), config.get("size_key"), config.get("color_col"))
            elif chart_type == "Waterfall Chart":
                fig_json = Visualizer.generate_waterfall_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_key"))
            elif chart_type == "Sunburst Chart":
                fig_json = Visualizer.generate_sunburst(df, config.get("title", ""), config.get("path_cols", []), config.get("value_key", ""))
            elif chart_type == "Donut Chart":
                fig_json = Visualizer.generate_donut(df, config.get("title", ""), config.get("label_key"), config.get("value_key"))
            

            if fig_json:
                plot_definitions.append({
                    "type": chart_type,
                    "title": config.get("title"),
                    "description": config.get("description"),
                    "plotly_json": fig_json
                })
    else:
         # Handle PDF / Non-tabular data charts (like Knowledge Graphs which don't use Plotly)
         plot_definitions = analysis.get("charts", [])

    return {
        "file_id": file_id,
        "filename": filename,
        "content_summary": parsed_text,
        "original_data": raw_sample,
        "column_meta": column_meta,
        "insights": {
            "summary": analysis.get("summary", ""),
            "suggested_charts": [c.get("type", "") for c in analysis.get("charts", [])],
        },
        "chat_suggestions": suggestions,
        "chart_configs": plot_definitions, # Now containing complete Plotly JSONs
        "status": "success"
    }


class ChatRequest(BaseModel):
    file_id: str
    filename: str
    column_meta: dict
    content_summary: str
    question: str
    history: list = []


@app.post("/api/chat")
async def chat_with_data(request: ChatRequest):
    """
    Smart hybrid chat:
    1. Ask Gemini to translate user question into a pandas operation
    2. Execute the pandas operation on the FULL cached DataFrame
    3. Ask Gemini to narrate the real results
    Falls back to original method for PDFs / when DataFrame is unavailable.
    """
    df = GLOBAL_DFS.get(request.file_id)

    # ── Fallback for PDFs or missing DataFrames → use original method ──
    if df is None:
        response_text = AIAgent.chat_with_data(
            parsed_text=request.content_summary,
            question=request.question,
            previous_history=request.history
        )
        return _process_chat_response(response_text, request)

    # ── Stage 1: AI generates a pandas query intent ──
    query = AIAgent.generate_data_query(
        question=request.question,
        column_meta=request.column_meta,
        parsed_text_preview=request.content_summary,
        previous_history=request.history,
    )

    operation = query.get("operation", "passthrough")
    params = query.get("params", {})
    narrative_hint = query.get("narrative_hint", "")

    # If AI detected a chart request, use original pipeline
    if operation == "chart":
        response_text = AIAgent.chat_with_data(
            parsed_text=request.content_summary,
            question=request.question,
            previous_history=request.history
        )
        return _process_chat_response(response_text, request)

    # If passthrough or unrecognized, default to summary on full data
    if operation == "passthrough":
        operation = "summary"
        params = {}

    # ── Stage 2: Execute pandas query on the FULL DataFrame ──
    result_text = _execute_pandas_query(df, operation, params)

    # ── Stage 3: Ask Gemini to narrate the actual results ──
    narrated = AIAgent.narrate_result(
        question=request.question,
        operation=operation,
        result_text=result_text,
        narrative_hint=narrative_hint,
        previous_history=request.history,
    )

    return _process_chat_response(narrated, request)


def _execute_pandas_query(df: pd.DataFrame, operation: str, params: dict) -> str:
    """Execute a deterministic pandas query on the full DataFrame. Zero AI."""
    try:
        col = params.get("column", "")
        top_n = int(params.get("top_n", 10))

        if operation == "value_counts":
            if col not in df.columns:
                return f"Column '{col}' not found."
            vc = df[col].value_counts().head(top_n)
            return f"Value counts for '{col}' (top {top_n}):\n{vc.to_string()}\nTotal unique: {df[col].nunique()}"

        elif operation == "describe":
            if col and col in df.columns:
                desc = df[col].describe()
                return f"Statistics for '{col}':\n{desc.to_string()}\nTotal rows: {len(df)}"
            else:
                desc = df.describe()
                return f"Dataset statistics:\n{desc.to_string()}"

        elif operation == "max_row":
            if col not in df.columns:
                return f"Column '{col}' not found."
            top = df.nlargest(top_n, col)
            return f"Top {top_n} rows by '{col}':\n{top.to_string(index=False)}"

        elif operation == "min_row":
            if col not in df.columns:
                return f"Column '{col}' not found."
            bottom = df.nsmallest(top_n, col)
            return f"Bottom {top_n} rows by '{col}':\n{bottom.to_string(index=False)}"

        elif operation == "filter":
            op = params.get("operator", "==")
            val = params.get("value", "")
            if col not in df.columns:
                return f"Column '{col}' not found."
            if op == "contains":
                mask = df[col].astype(str).str.contains(str(val), case=False, na=False)
            elif op == "==":
                mask = df[col].astype(str) == str(val)
            elif op == ">":
                mask = pd.to_numeric(df[col], errors='coerce') > float(val)
            elif op == "<":
                mask = pd.to_numeric(df[col], errors='coerce') < float(val)
            elif op == ">=":
                mask = pd.to_numeric(df[col], errors='coerce') >= float(val)
            elif op == "<=":
                mask = pd.to_numeric(df[col], errors='coerce') <= float(val)
            elif op == "!=":
                mask = df[col].astype(str) != str(val)
            else:
                mask = df[col].astype(str) == str(val)
            filtered = df[mask].head(top_n)
            return f"Filtered rows ({min(len(df[mask]), top_n)} shown / {len(df[mask])} match):\n{filtered.to_string(index=False)}"

        elif operation == "correlation":
            col_a = params.get("col_a", "")
            col_b = params.get("col_b", "")
            if col_a not in df.columns or col_b not in df.columns:
                return f"Column(s) not found."
            corr = df[[col_a, col_b]].corr().iloc[0, 1]
            return f"Pearson correlation between '{col_a}' and '{col_b}': {corr:.4f}\n(Based on {len(df)} rows)"

        elif operation == "group_agg":
            group_col = params.get("group_by", "")
            agg_col = params.get("agg_col", "")
            agg_func = params.get("agg_func", "sum")
            if group_col not in df.columns or agg_col not in df.columns:
                return f"Column(s) not found."
            grouped = df.groupby(group_col)[agg_col].agg(agg_func).sort_values(ascending=False).head(top_n)
            return f"'{agg_col}' grouped by '{group_col}' ({agg_func}, top {top_n}):\n{grouped.to_string()}"

        elif operation == "nunique":
            if col and col in df.columns:
                return f"Column '{col}' has {df[col].nunique()} unique values out of {len(df)} rows."
            else:
                uniques = {c: df[c].nunique() for c in df.columns}
                return f"Unique value counts per column:\n" + "\n".join(f"  {k}: {v}" for k, v in uniques.items())

        elif operation == "null_check":
            if col == "__all__" or not col:
                nulls = df.isnull().sum()
                return f"Null counts per column:\n{nulls.to_string()}\nTotal rows: {len(df)}"
            elif col in df.columns:
                nc = df[col].isnull().sum()
                return f"Column '{col}': {nc} null values out of {len(df)} rows ({nc/len(df)*100:.1f}%)"

        elif operation == "head":
            n = int(params.get("n", 10))
            return f"First {n} rows:\n{df.head(n).to_string(index=False)}"

        elif operation == "sample":
            n = min(int(params.get("n", 5)), len(df))
            return f"Random {n} rows:\n{df.sample(n).to_string(index=False)}"

        elif operation == "summary":
            return f"Dataset: {len(df)} rows × {len(df.columns)} columns.\nColumns: {', '.join(df.columns.tolist())}\n\nBasic stats:\n{df.describe().to_string()}"

        return f"Operation '{operation}' not recognized."
    except Exception as e:
        return f"Query execution error: {str(e)}"


def _process_chat_response(response_text: str, request: ChatRequest) -> dict:
    """Process an AI response to extract chart tags and generate plotly JSON if needed."""
    plotly_json = None
    chart_info = None

    if "<CHART:" in response_text:
        start = response_text.find("<CHART:") + 7
        end = response_text.find(">", start)
        chart_type = response_text[start:end].strip()

        config_response = AIAgent.analyze_and_configure_charts(
            parsed_text=request.content_summary,
            filename=request.filename,
            column_meta=request.column_meta,
            force_chart_types=[chart_type],
            user_request=request.question
        )

        charts = config_response.get("charts", [])
        if charts:
            config = charts[0]
            df = GLOBAL_DFS.get(request.file_id)
            if df is not None:
                fig_json = None
                if chart_type == "Bar Chart":
                    fig_json = Visualizer.generate_bar_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_keys", []))
                elif chart_type == "Line Chart":
                    fig_json = Visualizer.generate_line_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_keys", []))
                elif chart_type == "Pie Chart":
                    fig_json = Visualizer.generate_pie_chart(df, config.get("title", ""), config.get("label_key"), config.get("value_key"))
                elif chart_type == "Scatter Plot":
                    fig_json = Visualizer.generate_scatter_plot(df, config.get("title", ""), config.get("x_key"), config.get("y_keys", [None])[0], config.get("tooltip_key"))
                elif chart_type == "Histogram":
                    fig_json = Visualizer.generate_histogram(df, config.get("title", ""), config.get("x_key"), config.get("nbins", 30))
                elif chart_type == "Box Plot":
                    fig_json = Visualizer.generate_box_plot(df, config.get("title", ""), config.get("x_key"), config.get("y_key"))
                elif chart_type == "Heatmap":
                    fig_json = Visualizer.generate_heatmap(df, config.get("title", ""), config.get("columns"))
                elif chart_type == "Treemap":
                    fig_json = Visualizer.generate_treemap(df, config.get("title", ""), config.get("path_cols", []), config.get("value_key", ""))
                elif chart_type == "Funnel":
                    fig_json = Visualizer.generate_funnel(df, config.get("title", ""), config.get("stage_col"), config.get("value_key"))
                elif chart_type == "Violin Plot":
                    fig_json = Visualizer.generate_violin(df, config.get("title", ""), config.get("x_key"), config.get("y_key"))
                elif chart_type == "Bubble Chart":
                    fig_json = Visualizer.generate_bubble_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_key"), config.get("size_key"), config.get("color_col"))
                elif chart_type == "Waterfall Chart":
                    fig_json = Visualizer.generate_waterfall_chart(df, config.get("title", ""), config.get("x_key"), config.get("y_key"))
                elif chart_type == "Sunburst Chart":
                    fig_json = Visualizer.generate_sunburst(df, config.get("title", ""), config.get("path_cols", []), config.get("value_key", ""))
                elif chart_type == "Donut Chart":
                    fig_json = Visualizer.generate_donut(df, config.get("title", ""), config.get("label_key"), config.get("value_key"))


                if fig_json:
                    plotly_json = fig_json
                    chart_info = {
                        "type": chart_type,
                        "title": config.get("title", ""),
                        "description": config.get("description", "")
                    }

    return {
        "answer": response_text,
        "new_chart": chart_info,
        "plotly_json": plotly_json
    }


# ─────────────────────────────────────────────────────────────
# Suggestions — AI-generated suggestion pills (Llama 3)
# ─────────────────────────────────────────────────────────────
class SuggestionsRequest(BaseModel):
    column_meta: dict
    filename: str


@app.post("/api/suggestions")
async def get_suggestions(request: SuggestionsRequest):
    """Generate context-aware chat suggestion pills using Llama 3."""
    suggestions = AIAgent.generate_suggestions(
        column_meta=request.column_meta,
        filename=request.filename,
    )
    return {"suggestions": suggestions}


# ─────────────────────────────────────────────────────────────
# Report Summary — AI narrative for PDF export
# ─────────────────────────────────────────────────────────────
class ReportRequest(BaseModel):
    content_summary: str
    column_meta: dict
    chart_configs: list
    filename: str


@app.post("/api/report-summary")
async def report_summary(request: ReportRequest):
    """Generate AI narrative for PDF report export."""
    result = AIAgent.generate_report_narrative(
        content_summary=request.content_summary,
        column_meta=request.column_meta,
        chart_configs=request.chart_configs,
        filename=request.filename,
    )
    return result


class GraphRequest(BaseModel):
    content_summary: str


@app.post("/api/graph")
async def get_graph_data(request: GraphRequest):
    graph_data = AIAgent.generate_graph_data(request.content_summary)
    return graph_data


# ─────────────────────────────────────────────────────────────
# Chart Editor — deterministic re-render (zero LLM calls)
# ─────────────────────────────────────────────────────────────

_DEFAULT_PLOTLY_SEQ = list(px.colors.qualitative.Plotly)

def _patch_palette(primary_hex: str):
    """Temporarily override Plotly's default colour sequence so the next chart
    uses the user-chosen primary colour."""
    px.defaults.color_discrete_sequence = [primary_hex] + _DEFAULT_PLOTLY_SEQ[1:]

def _reset_palette():
    px.defaults.color_discrete_sequence = _DEFAULT_PLOTLY_SEQ


class RenderRequest(BaseModel):
    file_id:     str
    chart_type:  str
    title:       str
    x_key:       Optional[str] = None
    y_keys:      Optional[List[str]] = []
    label_key:   Optional[str] = None
    value_key:   Optional[str] = None
    tooltip_key: Optional[str] = None
    nbins:       Optional[int] = 30
    columns:     Optional[List[str]] = None
    color:       Optional[str] = None       # Palette theming hex
    color_col:   Optional[str] = None       # Categorical column for bubble grouping
    path_cols:   Optional[List[str]] = None # For treemap/sunburst
    stage_col:   Optional[str] = None       # For funnel stages
    size_key:    Optional[str] = None       # For bubble chart


@app.post("/api/render")
def render_chart(req: RenderRequest):
    """Re-render a chart with user-chosen config. Pure logic, zero AI."""
    df = GLOBAL_DFS.get(req.file_id)
    if df is None:
        raise HTTPException(status_code=404, detail="DataFrame not found. Re-upload the file.")

    if req.color:
        _patch_palette(req.color)

    CHART_DISPATCH = {
        "Bar Chart":       lambda: Visualizer.generate_bar_chart(df, req.title, req.x_key, req.y_keys or []),
        "Line Chart":      lambda: Visualizer.generate_line_chart(df, req.title, req.x_key, req.y_keys or []),
        "Pie Chart":       lambda: Visualizer.generate_pie_chart(df, req.title, req.label_key, req.value_key),
        "Scatter Plot":    lambda: Visualizer.generate_scatter_plot(df, req.title, req.x_key, (req.y_keys[0] if req.y_keys else None), req.tooltip_key),
        "Histogram":       lambda: Visualizer.generate_histogram(df, req.title, req.x_key, req.nbins or 30),
        "Box Plot":        lambda: Visualizer.generate_box_plot(df, req.title, req.x_key, (req.y_keys[0] if req.y_keys else None)),
        "Heatmap":         lambda: Visualizer.generate_heatmap(df, req.title, req.columns),
        "Treemap":         lambda: Visualizer.generate_treemap(df, req.title, req.path_cols or [], req.value_key or ""),
        "Funnel":          lambda: Visualizer.generate_funnel(df, req.title, req.stage_col, req.value_key),
        "Violin Plot":     lambda: Visualizer.generate_violin(df, req.title, req.x_key, (req.y_keys[0] if req.y_keys else None)),
        "Bubble Chart":    lambda: Visualizer.generate_bubble_chart(df, req.title, req.x_key, (req.y_keys[0] if req.y_keys else None), req.size_key, req.color_col),
        "Waterfall Chart": lambda: Visualizer.generate_waterfall_chart(df, req.title, req.x_key, (req.y_keys[0] if req.y_keys else None)),
        "Sunburst Chart":  lambda: Visualizer.generate_sunburst(df, req.title, req.path_cols or [], req.value_key or ""),
        "Donut Chart":     lambda: Visualizer.generate_donut(df, req.title, req.label_key, req.value_key),
    }

    handler = CHART_DISPATCH.get(req.chart_type)
    if not handler:
        _reset_palette()
        raise HTTPException(status_code=400, detail=f"Unknown chart type: {req.chart_type}")

    try:
        fig_json = handler()
    finally:
        _reset_palette()

    return {"plotly_json": fig_json}
