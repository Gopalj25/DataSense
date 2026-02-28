import os
import google.generativeai as genai
from dotenv import load_dotenv
import json

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if api_key:
    genai.configure(api_key=api_key)


def _get_model():
    return genai.GenerativeModel('gemini-2.5-flash')


def _clean_json(text: str) -> str:
    """Strip markdown fences from Gemini JSON responses."""
    text = text.strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return text.strip()


class AIAgent:

    # ─────────────────────────────────────────────────────────────
    # AGENT 1 — Insight + Chart Config (the main upload pipeline)
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def analyze_and_configure_charts(parsed_text: str, filename: str, column_meta: dict) -> dict:
        """
        Two-stage agent pipeline:
        Stage 1 → Decide which chart types suit the data.
        Stage 2 → For each chart, pick the exact columns that should be X/Y/label/value axes.

        Returns:
        {
            "summary": "...",
            "charts": [
                {
                    "type": "Bar Chart",
                    "title": "Sales by Region",
                    "x_key": "Region",
                    "y_keys": ["Sales", "Profit"],
                    "description": "Compares total sales and profit across regions."
                },
                {
                    "type": "Pie Chart",
                    "title": "Revenue Share by Category",
                    "label_key": "Category",
                    "value_key": "Revenue",
                    "description": "Shows proportional revenue contribution per category."
                },
                {
                    "type": "Knowledge Graph",
                    "title": "Entity Relationships",
                    "description": "Maps key entities and their relationships in the document."
                }
            ]
        }
        """
        if not api_key or api_key == "your_api_key_here":
            return {
                "summary": "AI disabled — add GEMINI_API_KEY to backend/.env",
                "charts": []
            }

        cols_info = json.dumps(column_meta, indent=2)

        # Stage 1: summary + chart type selection
        prompt_stage1 = f"""
                You are DataSense's data analyst AI. A user has uploaded '{filename}'.

                File structure and column metadata:
                {cols_info}

                Data preview (first rows as text):
                {parsed_text[:8000]}

                Your tasks:
                1. Write a concise executive summary (2-3 sentences) of what this data represents and its key patterns.
                2. Recommend 2-4 chart types that are MOST MEANINGFUL for this specific data. Choose ONLY from:
                [Bar Chart, Line Chart, Pie Chart, Scatter Plot, Knowledge Graph]

                Rules:
                - "Bar Chart" → if there are categorical + numeric columns (compare groups)
                - "Line Chart" → if there is a time-series or ordered numeric progression
                - "Pie Chart" → if one categorical + one numeric column shows composition/share
                - "Scatter Plot" → if there are 2+ numeric columns showing correlation
                - "Knowledge Graph" → ALWAYS include for PDFs/text documents; good for any relational data

                Return ONLY valid JSON (no markdown):
                {{
                "summary": "...",
                "chart_types": ["Bar Chart", "Pie Chart"]
                }}
                """
        try:
            model = _get_model()
            r1 = model.generate_content(prompt_stage1)
            stage1 = json.loads(_clean_json(r1.text))
        except Exception as e:
            return {"summary": f"Analysis error: {e}", "charts": []}

        chart_types = stage1.get("chart_types", [])
        summary = stage1.get("summary", "")

        if not chart_types:
            return {"summary": summary, "charts": []}

        # Stage 2: column mapping for each chart
        prompt_stage2 = f"""
            You are DataSense's visualization configurator AI.

            File: '{filename}'
            Column metadata (name → type, sample values):
            {cols_info}

            For each of these chart types, output the exact column mapping needed to render the chart.
            Chart types to configure: {json.dumps(chart_types)}

            Column mapping rules per chart type:
            - Bar Chart: x_key (categorical column), y_keys (list of 1-3 numeric columns)
            - Line Chart: x_key (time or ordered column), y_keys (list of 1-3 numeric columns)
            - Pie Chart: label_key (categorical column), value_key (ONE numeric column)
            - Scatter Plot: x_key (numeric column), y_key (numeric column), tooltip_key (optional categorical)
            - Knowledge Graph: no columns needed, just title and description

            IMPORTANT: Use EXACT column names from the metadata above. If a chart type doesn't fit the available data, skip it.

            Return ONLY valid JSON array (no markdown):
            [
            {{
                "type": "Bar Chart",
                "title": "Descriptive chart title",
                "x_key": "ColumnName",
                "y_keys": ["ColA", "ColB"],
                "description": "One sentence about what this shows."
            }},
            {{
                "type": "Pie Chart",
                "title": "Descriptive chart title",
                "label_key": "ColumnName",
                "value_key": "ColumnName",
                "description": "One sentence."
            }},
            {{
                "type": "Knowledge Graph",
                "title": "Entity Relationship Map",
                "description": "Key entities and relationships in the document."
            }}
            ]
            """
        try:
            r2 = model.generate_content(prompt_stage2)
            chart_configs = json.loads(_clean_json(r2.text))
            # Ensure it's a list
            if not isinstance(chart_configs, list):
                chart_configs = []
        except Exception as e:
            chart_configs = []

        return {
            "summary": summary,
            "charts": chart_configs
        }

    # ─────────────────────────────────────────────────────────────
    # AGENT 2 — Knowledge Graph node/edge generation
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def generate_graph_data(parsed_text: str) -> dict:
        """Generates React Flow nodes and edges from document content."""
        if not api_key or api_key == "your_api_key_here":
            return {"nodes": [], "edges": []}

        try:
            model = _get_model()
            prompt = f"""
            Extract the key entities and relationships from the following content to build a knowledge graph.

            Content:
            {parsed_text[:10000]}

            Return ONLY valid JSON (no markdown) in this exact React Flow format:
            {{
                "nodes": [
                    {{"id": "n1", "data": {{"label": "Entity Name"}}}}
                ],
                "edges": [
                    {{"id": "e1", "source": "n1", "target": "n2", "label": "relationship type"}}
                ]
            }}

            Rules:
            - Maximum 15 nodes, meaningful edges only
            - Node labels should be concise (1-4 words)
            - Edge labels should describe the relationship (e.g., "contains", "uses", "leads to")
            - Make the graph informative and non-trivial
            """
            response = model.generate_content(prompt)
            return json.loads(_clean_json(response.text))
        except Exception:
            return {"nodes": [], "edges": []}

    # ─────────────────────────────────────────────────────────────
    # AGENT 3 — Conversational chat with data
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def chat_with_data(parsed_text: str, question: str, previous_history: list = None) -> str:
        """Answers questions about the uploaded data with optional chart triggers."""
        if not api_key or api_key == "your_api_key_here":
            return "Error: Gemini API Key is missing in the backend/.env file."

        try:
            model = _get_model()
            history_text = "\n".join([
                f"User: {msg['user']}\nAgent: {msg['agent']}"
                for msg in (previous_history or [])
            ])

            prompt = f"""
                You are DataSense's AI data assistant. You answer questions about uploaded data.

                DATA CONTEXT:
                {parsed_text[:10000]}

                CONVERSATION HISTORY:
                {history_text}

                USER QUESTION: {question}

                RESPONSE RULES:
                1. Answer clearly and concisely using ONLY the data context above.
                2. Use Markdown formatting: tables, bullet points, bold text for readability.
                3. NEVER output any code, HTML, JavaScript, Python, or implementation details. You are a data analyst, not a programmer.
                4. If the user asks to CREATE, SHOW, GENERATE, or DISPLAY a visualization (e.g. "show me a scatter plot", "create a bar chart", "can I see a pie chart", "visualize this as a line chart"):
                - You MUST start your response with EXACTLY this tag on its own line: <CHART: ChartType>
                - ChartType must be one of: Bar Chart, Line Chart, Pie Chart, Scatter Plot, Knowledge Graph
                - After the tag, write a brief 1-2 sentence description of what the visualization shows based on the data. Do NOT describe how to build it.
                - Example response: "<CHART: Scatter Plot>\nI've generated a scatter plot showing the relationship between Age and Score. You can see a positive correlation trend."
                5. If the user is just asking a question (not requesting a visualization), answer normally without any CHART tag.
                """
            response = model.generate_content(prompt)
            return response.text
        except Exception as e:
            return f"Error: {str(e)}"

    # ─────────────────────────────────────────────────────────────
    # Legacy method — kept for backward compatibility
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def generate_initial_insight(parsed_text: str, filename: str) -> dict:
        """Legacy method — returns summary + suggested_charts list."""
        if not api_key or api_key == "your_api_key_here":
            return {
                "summary": "AI disabled — add GEMINI_API_KEY to backend/.env",
                "suggested_charts": []
            }
        try:
            model = _get_model()
            prompt = f"""
                Analyze the file '{filename}' with this content preview:
                {parsed_text[:8000]}

                Return ONLY valid JSON:
                {{
                    "summary": "1-2 sentence summary",
                    "suggested_charts": ["Bar Chart", "Pie Chart"]
                }}
                """
            r = model.generate_content(prompt)
            return json.loads(_clean_json(r.text))
        except Exception as e:
            return {"summary": str(e), "suggested_charts": []}
