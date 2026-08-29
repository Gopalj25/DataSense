# DataSense: Hybrid Deterministic-Probabilistic Data Visualization Pipeline

DataSense is an intelligent, multi-agent web application that transforms raw data files (CSV, JSON, XLSX, PDF) into interactive business dashboards and insights in minutes. By pioneering a **Hybrid[...]

## Table of Contents

- [Features](#features)
- [Architecture & Data Flow](#architecture--data-flow)
- [Tech Stack](#tech-stack)
- [Getting Started](#getting-started)
- [How the AI Agents Work](#how-the-ai-agents-work)

## Features

- **Hallucination-Free Analytics**: Natural language queries are translated into Python Pandas queries and executed deterministically on the full dataset.
- **13 Automated Chart Types**: AI automatically generates and configures Bar, Line, Area, Pie, Scatter, Histogram, Box, Violin, Heatmap, Treemap, Sunburst, Funnel, and Waterfall charts.
- **Natural Language "Chat to Chart"**: Ask for "a treemap of sales by region" and the AI will auto-configure the hierarchy columns and instantly switch your view to a generated dashboard tab.
- **Advanced KPI Heuristics**: Deterministic algorithms check column naming conventions to apply correct aggregations (Sums for "sales", Averages for "ages", Surge/Dip variance for time-series).
- **Physics-Based Knowledge Graphs**: Unstructured PDFs are converted into relational graphs powered by a D3.js physics engine, sizing nodes by relationship degree.
- **Modern UI**: Clean, responsive, light-themed glassmorphism interface built with Tailwind CSS v4.

## Architecture & Data Flow

DataSense uses a separated frontend/backend architecture with a dedicated AI processing layer.

```mermaid
flowchart TD
    %% Frontend Components
    subgraph Frontend["React Application - Vite, Plotly, Force-Graph"]
        UI["User Interface"]
        Uploader["File Upload Component"]
        Dashboard["Dynamic Dashboard (13 Charts)"]
        ChatUI["Chat Interface Component"]

        UI --> Uploader
        UI --> Dashboard
        UI --> ChatUI
    end

    %% Backend Components
    subgraph Backend["Python FastAPI Server"]
        API["FastAPI Endpoints"]
        Parser["Data Parser Module"]
        AIAgent["AI Agent Pipeline"]
        PandasEngine["Pandas Executor"]

        API --> Parser
        API --> AIAgent
        AIAgent <--> PandasEngine
    end

    %% External
    External["Google Gemini API"]

    %% Data Flow
    Uploader -->|"Upload File (CSV, PDF, etc.)"| API
    Parser -->|"Cache Globally, Extract Schema"| AIAgent
    AIAgent -->|"Analyze Schema"| External
    External -->|"JSON Chart Configs"| Dashboard

    ChatUI -->|"User Query"| API
    API -->|"Regex Viz Pre-check"| AIAgent
    AIAgent -->|"Translate to Pandas JSON"| External
    External -->|"Pandas JSON"| PandasEngine
    PandasEngine -->|"Exact Mathematical Result"| External
    External -->|"Narrated Answer"| ChatUI
```

### Flow Breakdown:

1. **Upload Phase**: The user uploads a file. The FastAPI backend caches the *full* Pandas DataFrame in memory.
2. **Schema Introspection**: The backend extracts lightweight schema metadata (types, distinct counts, min/max) without sending bulk raw data to the LLM.
3. **AI Generation Phase**: Using the lightweight schema, Gemini suggests charts and maps exact column names to Plotly properties (`x_key`, `y_keys`, `path_cols`).
4. **Chat-to-Data Pipeline**: 
   - A deterministic regex intercepts visualization queries ("plot", "chart") to emit `<CHART: Type>` tags.
   - Non-visualization queries are routed to an AI query planner that outputs strict JSON pandas boundaries. The Python backend evaluates this on the *full* DataFrame ensuring 100% accurate aggregatio[...]
5. **Dashboard Render**: The frontend intercepts `<CHART: Type>` tags from the chat stream and automatically switches to the Dashboard view, mounting fully interactive Plotly.js elements.

## Tech Stack

### Frontend

- **React 18** (Vite)
- **TypeScript**
- **Tailwind CSS v4** (Light theme + Glassmorphism)
- **Plotly.js** (Dynamic Chart Visualization)
- **react-force-graph-2d** (Physics Graphs)
- **Framer Motion** (UI Animations)

### Backend

- **Python 3.11**
- **FastAPI** (Web framework)
- **Google Generative AI (Gemini)** (LLM engine)
- **Pandas** (Deterministic execution)
- **PyPDF2** (PDF extraction)

## Getting Started

### Prerequisites

- Node.js v20.19+
- Python 3.10+
- A Google Gemini API Key

### Backend Setup

1. Navigate to the `backend` directory.
2. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   mac: source .venv/bin/activate
   Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Create a `.env` file and add your API key:
   ```env
   GEMINI_API_KEY=your_api_key_here
   ```
5. Start the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend Setup

1. Navigate to the `frontend` directory.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev
   ```
4. Open `http://localhost:5173` in your browser.

## How the AI Agents Work

DataSense relies on complex multi-stage agent routing rather than raw generation:

1. **The Analyzer Agent**: Ingests the data schema and strictly outputs JSON containing `content_summary` and `insights`. Acts as a Data Scientist prioritizing actionable KPIs.
2. **The Configuration Agent**: Takes suggested chart types and the schema, acting as a "Frontend Developer". It securely maps specific keys to 13 different Plotly structures without writing code.
3. **The Chat Query Planner**: Instead of trying to guess answers from a 300-row sample, it translates queries into JSON Pandas commands. This allows DataSense to aggregate or filter over millions of [...]
4. **The Narration Agent**: Receives the perfect numeric output of the Pandas execution and formats it conversationally for the user.
