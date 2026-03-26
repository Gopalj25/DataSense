import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import json

class Visualizer:
    @staticmethod
    def _apply_theme(fig: go.Figure, title: str) -> go.Figure:
        """Applies DataSense dark theme to Plotly figures."""
        fig.update_layout(
            title=dict(text=title, font=dict(color="#F2F2F0", size=15, family="DM Sans, sans-serif")),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#A8A8A3", family="DM Sans, sans-serif", size=12),
            xaxis=dict(gridcolor="rgba(255,255,255,0.05)", zerolinecolor="rgba(255,255,255,0.08)", linecolor="rgba(255,255,255,0.08)", tickfont=dict(color="#58585A")),
            yaxis=dict(gridcolor="rgba(255,255,255,0.05)", zerolinecolor="rgba(255,255,255,0.08)", linecolor="rgba(255,255,255,0.08)", tickfont=dict(color="#58585A")),
            legend=dict(font=dict(color="#A8A8A3")),
            colorway=["#818CF8","#34D399","#FB923C","#F472B6","#38BDF8","#A78BFA"],
            margin=dict(l=40, r=40, t=60, b=40)
        )
        return fig

    @staticmethod
    def generate_bar_chart(df: pd.DataFrame, title: str, x_col: str, y_cols: list[str]) -> str:
        """Generates a bar chart JSON from a complete DataFrame."""
        try:
            # Aggregate if data is too large or has many categories
            if len(df) > 1000:
                agg_df = df.groupby(x_col)[y_cols].sum().reset_index()
            else:
                agg_df = df

            fig = px.bar(agg_df, x=x_col, y=y_cols, barmode='group',
                         color_discrete_sequence=['#8b5cf6', '#3b82f6', '#ec4899', '#f97316'])
            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Bar Chart Error: {str(e)}"})

    @staticmethod
    def generate_line_chart(df: pd.DataFrame, title: str, x_col: str, y_cols: list[str]) -> str:
        """Generates a line chart JSON from a complete DataFrame."""
        try:
            # Sort by X axis for line charts
            temp_df = df.copy()
            if temp_df[x_col].dtype == 'object':
                try:
                    temp_df[x_col] = pd.to_datetime(temp_df[x_col])
                except:
                    pass
            temp_df = temp_df.sort_values(by=x_col)
            
            # Aggregate if large
            if len(temp_df) > 5000:
                 temp_df = temp_df.groupby(x_col)[y_cols].mean().reset_index()

            fig = px.line(temp_df, x=x_col, y=y_cols, 
                          color_discrete_sequence=['#f97316', '#3b82f6', '#ec4899', '#8b5cf6'])
            fig = Visualizer._apply_theme(fig, title)
            fig.update_traces(line=dict(width=3))
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Line Chart Error: {str(e)}"})

    @staticmethod
    def generate_pie_chart(df: pd.DataFrame, title: str, label_col: str, value_col: str) -> str:
        """Generates a pie chart JSON from a complete DataFrame."""
        try:
            agg_df = df.groupby(label_col)[value_col].sum().reset_index()
            # Keep top 12 categories if too many
            if len(agg_df) > 12:
                top_11 = agg_df.nlargest(11, value_col)
                other_sum = agg_df[~agg_df[label_col].isin(top_11[label_col])][value_col].sum()
                other_df = pd.DataFrame([{label_col: 'Other', value_col: other_sum}])
                agg_df = pd.concat([top_11, other_df], ignore_index=True)

            fig = px.pie(agg_df, names=label_col, values=value_col, hole=0.4,
                         color_discrete_sequence=['#8b5cf6', '#3b82f6', '#ec4899', '#14b8a6', '#f59e0b', '#ef4444', '#f97316'])
            fig = Visualizer._apply_theme(fig, title)
            fig.update_traces(textposition='inside', textinfo='percent+label')
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Pie Chart Error: {str(e)}"})

    @staticmethod
    def generate_scatter_plot(df: pd.DataFrame, title: str, x_col: str, y_col: str, tooltip_col: str = None) -> str:
        """Generates a scatter plot JSON from a complete DataFrame."""
        try:
            # Sample if data is massive to prevent browser freezing with too many dots
            plot_df = df.sample(n=min(len(df), 5000)) if len(df) > 5000 else df
            
            hover_data = [tooltip_col] if tooltip_col and tooltip_col in plot_df.columns else None

            fig = px.scatter(plot_df, x=x_col, y=y_col, hover_data=hover_data,
                             color_discrete_sequence=['#ec4899'])
            fig = Visualizer._apply_theme(fig, title)
            fig.update_traces(marker=dict(size=8, opacity=0.7, line=dict(width=1, color='White')))
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Scatter Plot Error: {str(e)}"})
        
    @staticmethod
    def generate_histogram(df: pd.DataFrame, title: str, x_col: str, nbins: int = 30) -> str:
        """Generates a histogram JSON showing distribution of a single numeric column."""
        try:
            # Safety: sample down if dataset is very large
            plot_df = df.sample(n=min(len(df), 20000), random_state=42) if len(df) > 20000 else df

            fig = px.histogram(
                plot_df,
                x=x_col,
                nbins=nbins,
                color_discrete_sequence=['#8b5cf6']
            )
            fig = Visualizer._apply_theme(fig, title)
            fig.update_traces(marker_line_width=0.5, marker_line_color='white')
            fig.update_layout(bargap=0.05)
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Histogram Error: {str(e)}"})

    @staticmethod
    def generate_box_plot(df: pd.DataFrame, title: str, x_col: str, y_col: str) -> str:
        """Generates a box plot JSON showing spread and outliers of a numeric column across categories."""
        try:
            plot_df = df.copy()

            # Safety: too many categories makes the chart unreadable — keep top 15 by count
            if plot_df[x_col].nunique() > 15:
                top_categories = (
                    plot_df[x_col].value_counts().nlargest(15).index
                )
                plot_df = plot_df[plot_df[x_col].isin(top_categories)]

            # Safety: sample down for very large datasets
            if len(plot_df) > 20000:
                plot_df = plot_df.sample(n=20000, random_state=42)

            fig = px.box(
                plot_df,
                x=x_col,
                y=y_col,
                color=x_col,
                color_discrete_sequence=[
                    '#8b5cf6', '#3b82f6', '#ec4899',
                    '#f97316', '#14b8a6', '#f59e0b', '#ef4444'
                ],
                points='outliers'   # only draw outlier dots, not all points — keeps it clean
            )
            fig = Visualizer._apply_theme(fig, title)
            fig.update_layout(
                showlegend=False,    # color already encodes x_col, legend is redundant
                boxgap=0.3,
                boxgroupgap=0.2
            )
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Box Plot Error: {str(e)}"})
        
    @staticmethod
    def generate_heatmap(df: pd.DataFrame, title: str, columns: list[str] | None = None) -> str:
        """
        Generates a correlation heatmap JSON from numeric columns.
        'columns' is an optional subset list — defaults to all numeric columns in df.
        """
        try:
            # ── 1. Column Selection ──────────────────────────────────────────
            if columns:
                numeric_df = df[columns].select_dtypes(include='number')
            else:
                numeric_df = df.select_dtypes(include='number')

            if numeric_df.shape[1] < 2:
                return json.dumps({
                    "error": "Heatmap requires at least 2 numeric columns in the dataset."
                })

            # ── 2. Column Cap ────────────────────────────────────────────────
            if numeric_df.shape[1] > 20:
                top_cols = (
                    numeric_df.var()
                    .nlargest(20)
                    .index
                    .tolist()
                )
                numeric_df = numeric_df[top_cols]

            # ── 3. Row Safety ────────────────────────────────────────────────
            if len(numeric_df) > 50000:
                numeric_df = numeric_df.sample(n=50000, random_state=42)

            # ── 4. Correlation Matrix ────────────────────────────────────────
            numeric_df = numeric_df.dropna(axis=1, how='all')
            corr_matrix = numeric_df.corr(method='pearson').round(2)

            # ── 5. Build Figure ──────────────────────────────────────────────
            fig = px.imshow(
                corr_matrix,
                text_auto=False,      # manual texttemplate gives precise control
                aspect='auto',
                zmin=-1,
                zmax=1,
                color_continuous_scale=[[0.0,  '#ef4444'], [0.25, '#fca5a5'],[0.5,  '#f8fafc'], 
                                             [0.75, '#c4b5fd'], [1.0,  '#8b5cf6'],] 
                 # -1.0  strong negative → red | -0.5  weak negative   → light red | 0.0  no correlation  → near-white, 
                 # +0.5  weak positive   → light violet | +1.0  strong positive → violet
            )

            # ── 6. Annotation Polish ─────────────────────────────────────────
            fig.update_traces(
                texttemplate='%{z:.2f}',  # correct attribute for imshow heatmap cells
                textfont=dict(
                    size=11,
                    family='Inter, sans-serif',
                    color='#1e293b'
                )
            )
            # ── 7. Colorbar Styling ──────────────────────────────────────────
            fig.update_coloraxes(
                colorbar=dict(
                    title=dict(
                        text='r',
                        font=dict(color='#475569', family='Inter, sans-serif', size=13)
                    ),
                    tickfont=dict(color='#475569', family='Inter, sans-serif', size=11),
                    thickness=14,
                    len=0.85,
                    tickvals=[-1, -0.5, 0, 0.5, 1],
                    ticktext=['-1', '-0.5', '0', '+0.5', '+1']
                )
            )
            # ── 8. Axis Polish ───────────────────────────────────────────────
            fig.update_layout(
                xaxis=dict(
                    tickangle=-40,
                    tickfont=dict(size=11, color='#475569', family='Inter, sans-serif'),
                    side='bottom'
                ),
                yaxis=dict(
                    tickfont=dict(size=11, color='#475569', family='Inter, sans-serif'),
                    autorange='reversed'
                )
            )

            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Heatmap Error: {str(e)}"})