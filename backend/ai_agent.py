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
    def analyze_and_configure_charts(parsed_text: str, filename: str, column_meta: dict, force_chart_types: list[str] | None = None, user_request: str | None = None) -> dict:
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
                [Bar Chart, Line Chart, Pie Chart, Scatter Plot, Histogram, Box Plot, Heatmap, Knowledge Graph]

                Rules:
                - "Bar Chart" → categorical x + numeric y, goal is comparing magnitudes across groups.
                                AVOID if x-axis is time-based, has 20+ unique values, or values sum to 100%. (compare groups or show breakdowns)
                - "Line Chart" → x-axis is a date, month, year, timestamp, or any ordered/sequential column.
                                PREFER over Bar whenever time or progression is present, even if stored as string.
                - "Pie Chart" → one categorical (2-8 unique values only) + one numeric that represents parts of a whole.
                                AVOID if values don't sum meaningfully or if Bar Chart shows the comparison more clearly.
                - "Scatter Plot" → if there are 2+ independent numeric columns where the goal is correlation or clustering.
                                AVOID if either axis is an ID, index, or flag column disguised as numeric.
                - "Histogram" → exactly one continuous numeric column, goal is distribution or frequency of values.
                                AVOID on categorical, ID, or near-constant columns — they produce meaningless bins.
                - "Box Plot" → one categorical grouping column + one numeric column, goal is spread or outlier comparison.
                                AVOID if the categorical column has only 1 unique value or the numeric column barely varies.
                - "Heatmap" → 3 or more numeric columns, goal is understanding correlations across all of them at once.
                                AVOID if numeric columns are IDs or flags — correlation between those is meaningless.
                - "Knowledge Graph" → always include for PDFs or text documents, and for any relational or hierarchical dataset.
                                Can be combined with other chart types on mixed datasets.

                Tie-breaking rules:
                → if data has BOTH time AND categories, prefer Line Chart with color grouping over Bar Chart
                → if unsure between Pie and Bar, choose Bar — it is more universally readable
                → if unsure between Scatter and Line, check the x-axis: ordered/sequential = Line, independent numeric = Scatter
                → never recommend more than 4 chart types total for a single dataset
                → never recommend the same chart type twice

                Return ONLY valid JSON (no markdown):
                {{
                "summary": "...",
                "chart_types": ["Bar Chart", "Pie Chart"]
                }}
                """
        model = _get_model()
        
        if force_chart_types:
            chart_types = force_chart_types
            summary = "Generated specific chart requested via chat."
        else:
            try:
                r1 = model.generate_content(prompt_stage1)
                stage1 = json.loads(_clean_json(r1.text))
                chart_types = stage1.get("chart_types", [])
                summary = stage1.get("summary", "")
            except Exception as e:
                return {"summary": f"Analysis error: {e}", "charts": []}

        if not chart_types:
            return {"summary": summary, "charts": []}

        user_context = f"\n            *** USER SPECIFIC REQUEST: '{user_request}' ***\n            Your ONLY job is to map columns to fulfill this request.\n" if user_request else ""

        # Stage 2: column mapping for each chart
        prompt_stage2 = f"""
            You are DataSense's visualization configurator AI.
            {user_context}
            File: '{filename}'
            Column metadata (name → type, sample values):
            {cols_info}

            For each of these chart types, output the exact column mapping needed to render the chart.
            Chart types to configure: {json.dumps(chart_types)}

            Column mapping rules per chart type (targeting Plotly Express backend functions):
            - Bar Chart: x_key (String: categorical/dimensional column), y_keys (Array of Strings: 1-3 metric columns)
            - Line Chart: x_key (String: time or ordered dimension), y_keys (Array of Strings: 1-3 metric columns)
            - Pie Chart: label_key (String: categorical/dimensional column), value_key (String: ONE metric column representing size/magnitude)
            - Scatter Plot: x_key (String: metric column), y_keys (Array of Strings: EXACTLY ONE metric column), tooltip_key (String: optional dimensional column for hover)
            - Histogram: x_key (String: ONE numeric column whose distribution is being analysed)
            - Box Plot: x_key (String: categorical/dimensional column for grouping), y_key (String: ONE numeric column whose spread is being analysed)
            - Heatmap: columns (Array of Strings OR null: list of numeric column names to include in correlation matrix — if all numeric columns should be used, set to null)
            - Knowledge Graph: no columns needed, just title and description

            CRITICAL RULES FOR VALUES:
            1. Differentiate between "Metrics" (quantitative values you can sum or average, like counts, amounts, durations) and "Dimensions" (attributes or groupings, like names, IDs, dates, years, categories).
            2. `value_key` and `y_keys` must ALWAYS be "Metrics". 
            3. `x_key` and `label_key` must ALWAYS be "Dimensions".
            4. Never map a Dimension (even if it contains numbers, like an ID or a Year) to a `value_key` or `y_keys`.
            5. Ensure the chosen mapping directly answers the user's request if one was provided in the chat.

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
                "type": "Histogram",
                "title": "Descriptive chart title",
                "x_key": "ColumnName",
                "nbins": 30,
                "description": "Two sentence description."
            }},
            {{
                "type": "Box Plot",
                "title": "Descriptive chart title",
                "x_key": "CategoryColumn",
                "y_key": "ColumnName",
                "description": "Two sentence about what this shows."
            }},
            {{
                "type": "Heatmap",
                "title": "Descriptive chart title",
                "columns": null,
                "description": "Two sentence about what this shows."
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
