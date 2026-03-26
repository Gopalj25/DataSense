from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import pandas as pd
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
    # Ask Gemini to answer the question, potentially outputting a <CHART: Type> tag
    response_text = AIAgent.chat_with_data(
        parsed_text=request.content_summary,
        question=request.question,
        previous_history=request.history
    )
    
    plotly_json = None
    chart_info = None

    # If the LLM decided to output a chart tag
    if "<CHART:" in response_text:
        # Extract the type (e.g. <CHART: Bar Chart>)
        start = response_text.find("<CHART:") + 7
        end = response_text.find(">", start)
        chart_type = response_text[start:end].strip()

        # Step 2: Use Agent 1 logic to convert this request into a specific Plotly column mapping
        # We tell it to return configuration for ONLY this specific chart_type
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
                    fig_json = Visualizer.generate_box_plot(df, config.get("title", ""), config.get("x_key"), config.get("y_keys", []))
                elif chart_type == "Heatmap":
                    fig_json = Visualizer.generate_heatmap(df, config.get("title", ""),config.get("columns"))
                
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


class GraphRequest(BaseModel):
    content_summary: str


@app.post("/api/graph")
async def get_graph_data(request: GraphRequest):
    graph_data = AIAgent.generate_graph_data(request.content_summary)
    return graph_data
