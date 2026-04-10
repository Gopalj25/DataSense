import os
import google.generativeai as genai
from dotenv import load_dotenv
import json
import requests

load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")

if api_key:
    genai.configure(api_key=api_key)


def _get_model():
    return genai.GenerativeModel('gemini-2.5-flash')


OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3:latest"


def _llama_chat(prompt: str, json_mode: bool = False) -> str:
    """Call local Ollama Llama 3 instance. Returns raw text."""
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
            "options": {"temperature": 0.3, "num_predict": 2048},
        }
        if json_mode:
            payload["format"] = "json"
        resp = requests.post(OLLAMA_URL, json=payload, timeout=120)
        resp.raise_for_status()
        return resp.json().get("response", "")
    except Exception as e:
        print(f"Ollama error: {e}")
        return ""


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
        Stage 2 → For each chart, pick the exact columns that should be X/Y/label/value for axes.

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
                [Bar Chart, Line Chart, Pie Chart, Scatter Plot, Histogram, Box Plot, Heatmap, Treemap, Funnel, Violin Plot, Bubble Chart, Waterfall Chart, Sunburst Chart, Donut Chart, Knowledge Graph]

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
                - "Treemap"  → one or more categorical columns forming a hierarchy + one numeric value column showing size.
                                AVOID if there is no clear part-of-whole relationship or if hierarchy has only 1 unique value per level.
                - "Funnel" → one categorical column representing ordered process stages + one numeric column representing volume at each stage.
                                AVOID if stages have no natural order or if the dataset has no clear sequential process structure.
                - "Violin Plot" → one categorical grouping column + one numeric column, goal is full distribution shape comparison across groups.
                                PREFER over Box Plot when distribution shape, skewness, or bimodality matters more than just median and spread.
                - "Bubble Chart" → exactly 3 numeric columns where x, y encode position and a third encodes magnitude via bubble size.
                                PREFER over Scatter Plot when a third numeric variable adds meaningful analytical context to each point.
                                AVOID if the third numeric column is an ID, index, or flag — that creates meaningless bubble sizes.
                - "Waterfall Chart" → one ordered categorical/stage column + one numeric column of incremental values (mix of +/- is ideal).
                                Goal is showing cumulative build-up or breakdown across sequential steps (e.g. revenue bridges, budget variances, P&L).
                                AVOID if all values are positive with no meaningful sequence — Bar Chart handles that better.
                                AVOID if the column has no natural order — waterfall requires left-to-right sequence to be meaningful.
                - "Sunburst Chart" → two or more categorical columns forming a hierarchy + one numeric value column.
                                PREFER over Treemap when the radial hierarchy readability matters and levels are 2-3 deep.
                                AVOID if the hierarchy is very deep (4+ levels) or if there is no clear part-of-whole relationship.
                - "Donut Chart" → one categorical (2-8 unique values) + one numeric representing parts of a whole.
                                PREFER over Pie Chart when a central total summary adds analytical value to the composition view.
                - "Knowledge Graph" → always include for PDFs or text documents, and for any relational or hierarchical dataset.
                                Can be combined with other chart types on mixed datasets.

                Tie-breaking rules:
                → time + categories present              → Line Chart with color grouping, not Bar
                → unsure between Pie vs Bar              → always choose Bar unless it's explicitly a part-of-whole with 2-8 unique categories
                → unsure between Line vs Bar             → time series = Line, categorical comparison = Bar
                → unsure between waterfall vs bar        → sequential stages with drop-off(+ve & -ve) = Waterfall, general comparison = Bar
                → unsure between Scatter vs Line         → ordered x = Line, two independent numerics = Scatter
                → unsure between Box Plot vs Violin      → shape/skewness matters = Violin, just spread/outliers = Box Plot
                → unsure between Bar vs Histogram        → categorical x = Bar, continuous numeric x = Histogram
                → unsure between Treemap vs Pie          → single level composition = Pie, hierarchical composition = Treemap
                → unsure between Funnel vs Bar           → sequential process with drop-off = Funnel, general comparison = Bar
                → unsure between Bubble vs Scatter       → two numeric variables = Scatter, three numeric variables = Bubble
                → unsure between Sunburst vs Treemap     → radial hierarchy readability matters = Sunburst, hierarchical composition = Treemap
                → unsure between Donut vs Pie            → central total summary adds value = Donut, simple composition = Pie
                → never recommend more than 4 chart types, never repeat the same type twice

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

        user_context = f"\n*** USER SPECIFIC REQUEST: '{user_request}' ***\n   Your ONLY job is to map columns to fulfill this request.\n" if user_request else ""

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
            - Treemap: path_cols (Array of Strings: ordered hierarchy columns, outermost first e.g. ['Region','Category']), value_key (String: numeric column defining rectangle size)
            - Funnel: stage_col (String: categorical column whose unique values represent ordered process stages), value_key (String: numeric column representing volume, count, or amount at each stage)
            - Violin Plot: x_key (String: categorical/dimensional column for grouping), y_key (String: ONE numeric column whose distribution is being analysed)
            - Bubble Chart: x_key (String: metric column), y_key (String: metric column), size_key (String: metric column), color_col (String: optional dimensional column for color coding)
            - Waterfall Chart: x_key (String: categorical column representing sequential stages or categories), y_key (String: ONE numeric column representing incremental values for each stage, ideally with a mix of positive and negative values to show build-up and breakdown)
            - Sunburst Chart: path_cols (Array of Strings: ordered hierarchy columns, outermost first e.g. ['Region','Category']), value_key (String: numeric column defining slice size)
            - Donut Chart: label_key (String: categorical/dimensional column), value_key (String: ONE metric column representing size/magnitude)
            - Knowledge Graph: no columns needed, just title and description

            Critical rules:
            1. Differentiate "Metrics" (numeric, summable — counts, amounts, durations) from "Dimensions" (grouping attributes — names, IDs, dates, categories).
            2. value_key, y_keys, y_key, size_key must ALWAYS be Metrics.
            3. x_key, label_key, stage_col, path_cols must ALWAYS be Dimensions.
            4. Never map an ID, index, row number, or year-as-label column to value_key, y_keys, or y_key.
            5. Use EXACT column names from the metadata above — never invent or approximate/hallucinates column names.

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
                "type": "Line Chart",
                "title": "Descriptive chart title",
                "x_key": "DateOrOrderedColumn",
                "y_keys": ["MetricA", "MetricB"],
                "description": "One sentence about the trend this shows."
            }},
            {{
                "type": "Pie Chart",
                "title": "Descriptive chart title",
                "label_key": "ColumnName",
                "value_key": "ColumnName",
                "description": "One sentence."
            }},
            {{
                "type": "Scatter Plot",
                "title": "Descriptive chart title",
                "x_key": "NumericColumnA",
                "y_keys": ["NumericColumnB"],
                "tooltip_key": "DimensionalColumn",
                "description": "One sentence about the correlation this reveals."
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
                "type": "Treemap",
                "title": "Descriptive chart title",
                "path_cols": ["Region", "Category"],
                "value_key": "Sales",
                "description": "Two sentence about what this shows."
            }},
            {{
                "type": "Funnel",
                "title": "Descriptive chart title",
                "stage_col": "StageColumn",
                "value_key": "NumericColumn",
                "description": "One sentence about the drop-off this reveals."
            }},
            {{
                "type": "Violin Plot",
                "title": "Descriptive chart title",
                "x_key": "CategoryColumn",
                "y_key": "NumericColumn",
                "description": "One sentence about the distribution shape this reveals."
            }},
            {{
                "type": "Bubble Chart",
                "title": "Descriptive chart title",
                "x_key": "ColumnName",
                "y_key": "ColumnName",
                "size_key": "NumericColumn",
                "color_col": "CategoryColumn",
                "description": "One sentence about the relationship between the three variables."
            }},
            {{
                "type": "Waterfall Chart",
                "title": "Descriptive chart title",
                "x_key": "StageOrCategoryColumn",
                "y_key": "IncrementalValueColumn",
                "description": "One sentence about what cumulative effect this shows."
            }},
            {{
                "type": "Sunburst Chart",
                "title": "Descriptive chart title",
                "path_cols": ["Region", "Category", "SubCategory"],
                "value_key": "Revenue",
                "description": "One sentence about the hierarchical composition this reveals."
            }},
            {{
                "type": "Donut Chart",
                "title": "Descriptive chart title",
                "label_key": "ColumnName",
                "value_key": "ColumnName",
                "description": "One sentence about the composition this shows."
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
    # AGENT 3 — Conversational chat with data (Llama 3 via Ollama)
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def chat_with_data(parsed_text: str, question: str, previous_history: list = None) -> str:
        """Answers questions about the uploaded data with optional chart triggers. Uses Llama 3."""
        history_text = "\n".join([
            f"User: {msg['user']}\nAgent: {msg['agent']}"
            for msg in (previous_history or [])
        ])

        prompt = f"""You are DataSense's AI data assistant. You answer questions about uploaded data.

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
   - ChartType must be one of: Bar Chart, Line Chart, Pie Chart, Scatter Plot, Histogram, Box Plot, Heatmap, Treemap, Funnel, Violin Plot, Waterfall Chart, Sunburst Chart, Donut Chart, Knowledge Graph
   - After the tag, write a brief 1-2 sentence description of what the visualization shows based on the data. Do NOT describe how to build it.
5. If the user is just asking a question (not requesting a visualization), answer normally without any CHART tag.
"""
        result = _llama_chat(prompt)
        return result if result else "Sorry, I couldn't process that request. Please try again."

    # ─────────────────────────────────────────────────────────────
    # AGENT 3B — Smart chat: AI generates pandas intent, backend
    #            executes on full DataFrame, AI narrates results.
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def generate_data_query(question: str, column_meta: dict, parsed_text_preview: str, previous_history: list | None = None) -> dict:
        """
        Stage 1 of smart chat: Ask Llama 3 to translate user question into
        a pandas operation JSON, rather than trying to answer from sample data.
        Returns: { "operation": str, "params": dict, "narrative_hint": str }
        """
        cols_info = json.dumps(column_meta, indent=2)[:3000]
        history_text = "\n".join([
            f"User: {msg['user']}\nAgent: {msg['agent']}"
            for msg in (previous_history or [])
        ])
        prompt = f"""You are a data query planner. The user has a DataFrame with these columns:
{cols_info}

Data preview:
{parsed_text_preview[:3000]}

Conversation history:
{history_text}

User question: "{question}"

If the user asks to CREATE, SHOW, GENERATE, or DISPLAY a visualization:
Return: {{"operation": "chart", "params": {{}}, "narrative_hint": ""}}

Otherwise, decide which pandas operation best answers this question.
Pick ONE operation from:
- "value_counts": count unique values in a column. params: {{"column": "col_name", "top_n": 10}}
- "describe": basic stats for a numeric column. params: {{"column": "col_name"}}
- "max_row": find row(s) with max value in a column. params: {{"column": "col_name", "top_n": 5}}
- "min_row": find row(s) with min value in a column. params: {{"column": "col_name", "top_n": 5}}
- "filter": filter rows matching condition. params: {{"column": "col_name", "operator": "==/>/</>=/<=/!=/contains", "value": "...", "top_n": 10}}
- "correlation": correlation between two numeric columns. params: {{"col_a": "...", "col_b": "..."}}
- "group_agg": group by column and aggregate. params: {{"group_by": "col", "agg_col": "col", "agg_func": "sum/mean/count/max/min", "top_n": 10}}
- "nunique": count unique values. params: {{"column": "col_name"}}
- "null_check": check null counts. params: {{"column": "col_name"}}  (use "__all__" for all columns)
- "head": show first N rows. params: {{"n": 10}}
- "sample": show random N rows. params: {{"n": 5}}
- "summary": general summary question that can be answered from column metadata. params: {{}}

Also include a "narrative_hint" — a short instruction for how to phrase the answer to the user.

Return ONLY valid JSON with no markdown fences:
{{"operation": "...", "params": {{...}}, "narrative_hint": "..."}}"""
        try:
            result = _llama_chat(prompt, json_mode=True)
            if result:
                return json.loads(_clean_json(result))
        except Exception:
            pass
        return {"operation": "summary", "params": {}, "narrative_hint": "Provide a general overview of the data."}

    @staticmethod
    def narrate_result(question: str, operation: str, result_text: str, narrative_hint: str, previous_history: list | None = None) -> str:
        """
        Stage 2 of smart chat: Given the actual query result from the full DataFrame,
        ask Llama 3 to format a nice human-readable answer.
        """
        history_text = "\n".join([
            f"User: {msg['user']}\nAgent: {msg['agent']}"
            for msg in (previous_history or [])
        ])
        prompt = f"""You are a data analyst. The user asked: "{question}"

The system executed a query on the FULL dataset and got this result:
{result_text[:6000]}

Hint: {narrative_hint}

Conversation history:
{history_text}

Rules:
1. Present the result clearly using markdown (tables, bullet points, bold).
2. Answer based ONLY on the provided result data — this is from the COMPLETE dataset, not a sample.
3. Be concise and insightful. Add a one-sentence observation if relevant.
4. Never output code. Never say you only have sample data — you have the full result.
5. If the user asked for a visualization, start with <CHART: ChartType> tag (Bar Chart, Line Chart, Pie Chart, Scatter Plot, Histogram, Box Plot, Heatmap, Treemap, Funnel, Violin Plot, Waterfall Chart, Sunburst Chart, Donut Chart, Knowledge Graph).
"""
        result = _llama_chat(prompt)
        return result if result else result_text

    # ─────────────────────────────────────────────────────────────
    # AGENT 3C — Suggestion pills (Llama 3)
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def generate_suggestions(column_meta: dict, filename: str) -> list:
        """Generate 5 context-aware chat suggestion pills using Llama 3."""
        cols_info = json.dumps(column_meta, indent=2)[:2000]
        prompt = f"""You are a data analyst assistant. Given this dataset '{filename}' with these columns:
{cols_info}

Generate exactly 5 short, specific questions a user would likely ask about this data.
Each question should be:
- Under 60 characters
- Actionable (can be answered by querying the data)
- Varied (mix of stats, comparisons, distributions, top-N, outliers)

Return ONLY a JSON array of 5 strings, nothing else:
["question 1", "question 2", "question 3", "question 4", "question 5"]"""
        try:
            result = _llama_chat(prompt, json_mode=True)
            if result:
                parsed = json.loads(_clean_json(result))
                if isinstance(parsed, list) and len(parsed) > 0:
                    return parsed[:5]
        except Exception:
            pass
        return []

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

    # ─────────────────────────────────────────────────────────────
    # AGENT 5 — Report Narrative (single Gemini call)
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def generate_report_narrative(content_summary: str, column_meta: dict,
                                   chart_configs: list, filename: str) -> dict:
        """
        Generates a structured report narrative for PDF export.
        Returns:
        {
            "executive_summary": "...",
            "chart_interpretations": {"Chart Title": "One-liner...", ...},
            "key_findings": ["Finding 1", ...],
            "closing_takeaway": "..."
        }
        """
        fallback = {
            "executive_summary": "",
            "chart_interpretations": {},
            "key_findings": [],
            "closing_takeaway": ""
        }

        if not api_key or api_key == "your_api_key_here":
            return fallback

        try:
            model = _get_model()

            charts_desc = "\n".join([
                f"- {c.get('type','')}: \"{c.get('title','')}\" — {c.get('description','')}"
                for c in chart_configs
            ])
            cols_info = json.dumps(column_meta, indent=2)[:3000]

            prompt = f"""
You are a senior data analyst writing a professional report for the file '{filename}'.

DATA PROFILE:
{content_summary[:6000]}

COLUMN METADATA:
{cols_info}

CHARTS GENERATED:
{charts_desc}

Write a structured report narrative. Return ONLY valid JSON (no markdown fences):
{{
    "executive_summary": "2-3 paragraphs. What is this data? What are the key patterns? What stands out? Write as if briefing a manager.",
    "chart_interpretations": {{
        "Exact Chart Title": "One clear sentence explaining what this chart reveals and why it matters."
    }},
    "key_findings": [
        "Finding 1: specific, data-backed insight",
        "Finding 2: specific, data-backed insight",
        "Finding 3: specific, data-backed insight"
    ],
    "closing_takeaway": "One strong closing sentence — the single most important thing the reader should walk away with."
}}

RULES:
- executive_summary: 2-3 paragraphs, professional tone, mention actual column names and values.
- chart_interpretations: one entry per chart, key must EXACTLY match the chart title provided above.
- key_findings: 3-6 bullet points, each must reference specific data.
- closing_takeaway: one sentence, actionable or insightful.
- Do NOT use markdown formatting inside the JSON values — plain text only.
"""
            response = model.generate_content(prompt)
            result = json.loads(_clean_json(response.text))
            # Ensure all keys present
            for key in fallback:
                if key not in result:
                    result[key] = fallback[key]
            return result
        except Exception as e:
            print(f"Report narrative generation failed: {e}")
            return fallback
