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

#------------------------------------------------------------------------

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

#----------------------------------------------------------------

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

#----------------------------------------------------------------

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

#----------------------------------------------------------------

    @staticmethod
    def generate_scatter_plot(df: pd.DataFrame, title: str, x_col: str, y_col: str, tooltip_col: str | None = None) -> str:
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

    #----------------------------------------------------------------

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

#--------------------------------------------------------------------------
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

#----------------------------------------------------------------------       
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
        
#--------------------------------------------------------------------------

    @staticmethod
    def generate_treemap(df: pd.DataFrame, title: str, path_cols: list[str], value_col: str) -> str:
        """
        Generates a treemap JSON showing hierarchical composition.
        path_cols defines the hierarchy levels e.g. ['Region', 'Category']
        value_col is the numeric column defining rectangle size.
        """
        try:
            # ── 1. Validate inputs ───────────────────────────────────────────
            for col in path_cols + [value_col]:
                if col not in df.columns:
                    return json.dumps({"error": f"Column '{col}' not found in dataset."})

            # ── 2. Drop nulls in hierarchy and value columns ─────────────────
            # Treemap crashes on NaN in path — must be clean
            clean_df = df[path_cols + [value_col]].dropna()

            # ── 3. Value must be positive — treemap area is meaningless on negatives
            clean_df = clean_df[clean_df[value_col] > 0]

            if clean_df.empty:
                return json.dumps({"error": "No valid positive data available for treemap."})

            # ── 4. Cap rows — treemap with 5k+ rectangles is unrenderable
            if len(clean_df) > 5000:
                clean_df = clean_df.groupby(path_cols)[value_col].sum().reset_index()

            # ── 5. Build figure ──────────────────────────────────────────────
            fig = px.treemap(
                clean_df,
                path=path_cols,
                values=value_col,
                color=value_col,
                color_continuous_scale=[
                    [0.0, '#c4b5fd'],    # low value  → light violet
                    [0.5, '#8b5cf6'],    # mid value  → violet
                    [1.0, '#4c1d95'],    # high value → deep violet
                ]
            )

            # ── 6. Label polish ──────────────────────────────────────────────
            fig.update_traces(
                textinfo='label+value+percent parent',
                textfont=dict(size=12, family='Inter, sans-serif'),
                marker=dict(
                    line=dict(width=1.5, color='white')  # white borders between cells
                )
            )

            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()

        except Exception as e:
            return json.dumps({"error": f"Treemap Error: {str(e)}"})

    #------------------------------------------------------------------------

    @staticmethod
    def generate_funnel(df: pd.DataFrame, title: str, stage_col: str, value_col: str) -> str:
        """
        Generates a funnel chart JSON showing drop-off across ordered stages.
        stage_col defines the process stages (categorical, ordered).
        value_col is the numeric column defining the size at each stage.
        """
        try:
            # ── 1. Validate columns ──────────────────────────────────────────
            for col in [stage_col, value_col]:
                if col not in df.columns:
                    return json.dumps({"error": f"Column '{col}' not found in dataset."})

            # ── 2. Aggregate — each stage must resolve to a single value ─────
            # Multiple rows per stage are summed into one bar
            funnel_df = (
                df.groupby(stage_col)[value_col]
                .sum()
                .reset_index()
            )

            # ── 3. Sort descending — funnel shape requires largest at top ────
            funnel_df = funnel_df.sort_values(by=value_col, ascending=False)

            # ── 4. Must have at least 2 stages to show drop-off ─────────────
            if len(funnel_df) < 2:
                return json.dumps({"error": "Funnel chart requires at least 2 distinct stages."})

            # ── 5. Cap stages — beyond 12 the funnel loses readability ───────
            if len(funnel_df) > 12:
                funnel_df = funnel_df.head(12)

            # ── 6. Build figure ──────────────────────────────────────────────
            fig = px.funnel(
                funnel_df,
                x=value_col,
                y=stage_col,
                color=stage_col,
                color_discrete_sequence=[
                    '#8b5cf6', '#a78bfa', '#c4b5fd',
                    '#3b82f6', '#60a5fa', "#7baee8",
                    '#ec4899', '#f472b6', '#f97316',
                    '#14b8a6', '#f59e0b', '#ef4444'
                ]
            )

            # ── 7. Trace polish ──────────────────────────────────────────────
            fig.update_traces(
                textinfo='value+percent initial',   # shows raw value + % drop from first stage
                textfont=dict(
                    size=12,
                    family='Inter, sans-serif',
                    color='white'
                ),
                connector=dict(
                    line=dict(color='rgba(255,255,255,0.3)', width=1)
                )
            )

            # ── 8. Layout polish ─────────────────────────────────────────────
            fig.update_layout(
                showlegend=False,        # stage labels on y-axis make legend redundant
                funnelmode='stack',
            )

            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()

        except Exception as e:
            return json.dumps({"error": f"Funnel Chart Error: {str(e)}"})
        
        #------------------------------------------------------------------------
    @staticmethod
    def generate_violin(df: pd.DataFrame, title: str, x_col: str, y_col: str) -> str:
        """
        Generates a violin plot JSON showing full distribution shape per category.
        x_col is the categorical grouping column.
        y_col is the numeric column whose distribution is being analysed per group.
        """
        try:
            # ── 1. Validate columns ──────────────────────────────────────────
            for col in [x_col, y_col]:
                if col not in df.columns:
                    return json.dumps({"error": f"Column '{col}' not found in dataset."})

            # ── 2. Enforce numeric y ─────────────────────────────────────────
            if not pd.api.types.is_numeric_dtype(df[y_col]):
                return json.dumps({"error": f"Column '{y_col}' must be numeric for violin plot."})

            plot_df = df[[x_col, y_col]].dropna()

            if plot_df.empty:
                return json.dumps({"error": "No valid data after removing nulls."})

            # ── 3. Category cap — beyond 10 violins become unreadable ────────
            if plot_df[x_col].nunique() > 10:
                top_categories = (
                    plot_df[x_col].value_counts()
                    .nlargest(10)
                    .index
                )
                plot_df = plot_df[plot_df[x_col].isin(top_categories)]

            # ── 4. Minimum points per group guard ────────────────────────────
            # KDE (kernel density estimate) needs at least 5 points to draw a
            # meaningful shape — groups with fewer points are dropped cleanly
            valid_groups = (
                plot_df.groupby(x_col)[y_col]
                .count()
                .loc[lambda s: s >= 5]
                .index
            )
            plot_df = plot_df[plot_df[x_col].isin(valid_groups)]

            if plot_df.empty:
                return json.dumps({"error": "Insufficient data points per group to render violin plot."})

            # ── 5. Row safety ────────────────────────────────────────────────
            if len(plot_df) > 20000:
                plot_df = plot_df.groupby(x_col, group_keys=False).apply(
                    lambda g: g.sample(min(len(g), 2000), random_state=42)
                )

            # ── 6. Build figure ──────────────────────────────────────────────
            fig = px.violin(
                plot_df,
                x=x_col,
                y=y_col,
                color=x_col,
                box=True,               # embed box plot inside violin for dual insight
                points='outliers',      # show only outlier dots — all points clutters
                color_discrete_sequence=[
                    '#8b5cf6', '#3b82f6', '#ec4899',
                    '#f97316', '#14b8a6', '#f59e0b',
                    '#ef4444', '#a78bfa', '#60a5fa',
                    '#f472b6', '#34d399', '#fbbf24'
                ]
            )

            # ── 7. Trace polish ──────────────────────────────────────────────
            fig.update_traces(
                meanline=dict(
                    visible=True,       # mean line inside violin — key statistical marker
                    color='white',
                    width=2
                ),
                opacity=0.85,           # slight transparency reveals overlapping density
            )

            # ── 8. Layout polish ─────────────────────────────────────────────
            fig.update_layout(
                showlegend=False,       # x-axis already labels groups — legend is redundant
                violingap=0.3,          # breathing room between violins
                violinmode='overlay'    # if multiple traces, overlay cleanly
            )

            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()

        except Exception as e:
            return json.dumps({"error": f"Violin Plot Error: {str(e)}"})

# ------------------------------------------------------------------------
    @staticmethod
    def generate_bubble_chart(df: pd.DataFrame, title: str, x_col: str, y_col: str, size_col: str, color_col: str | None = None) -> str:
        """
        Generates a bubble chart JSON showing relationships across 3 numeric variables.
        x_col    → x-axis numeric column
        y_col    → y-axis numeric column
        size_col → numeric column controlling bubble size
        color_col→ optional categorical column for color grouping (4th dimension)
        """
        try:
            # ── 1. Validate required columns ─────────────────────────────────
            for col in [x_col, y_col, size_col]:
                if col not in df.columns:
                    return json.dumps({"error": f"Column '{col}' not found in dataset."})

            # ── 2. Validate all three core columns are numeric ────────────────
            for col in [x_col, y_col, size_col]:
                if not pd.api.types.is_numeric_dtype(df[col]):
                    return json.dumps({"error": f"Column '{col}' must be numeric for bubble chart."})

            # ── 3. Select relevant columns and drop nulls ─────────────────────
            cols_to_use = [x_col, y_col, size_col]
            if color_col and color_col in df.columns:
                cols_to_use.append(color_col)
            else:
                color_col = None   # reset if not found — use single color fallback

            plot_df = df[cols_to_use].dropna()

            if plot_df.empty:
                return json.dumps({"error": "No valid data after removing nulls."})

            # ── 4. Filter out non-positive size values ────────────────────────
            # Plotly cannot render zero or negative bubble sizes — they crash silently
            plot_df = plot_df[plot_df[size_col] > 0]

            if plot_df.empty:
                return json.dumps({"error": f"Column '{size_col}' has no positive values for bubble sizing."})

            # ── 5. Row safety — large bubble charts freeze the browser ─────────
            if len(plot_df) > 2000:
                plot_df = plot_df.sample(n=2000, random_state=42)

            # ── 6. Normalize size column to readable bubble range ─────────────
            # Raw values (e.g. revenue in millions) produce invisible or
            # screen-filling bubbles — normalize to 5–80px range
            size_min = plot_df[size_col].min()
            size_max = plot_df[size_col].max()

            if size_max > size_min:
                plot_df = plot_df.copy()
                plot_df['_bubble_size'] = (
                    5 + ((plot_df[size_col] - size_min) / (size_max - size_min)) * 75
                )
            else:
                # All values identical — use fixed mid-size
                plot_df = plot_df.copy()
                plot_df['_bubble_size'] = 30

            # ── 7. Build figure ───────────────────────────────────────────────
            if color_col:
                fig = px.scatter(plot_df, x=x_col, y=y_col, size='_bubble_size', color=color_col,
                    color_discrete_sequence=[
                        '#8b5cf6', '#3b82f6', '#ec4899',
                        '#f97316', '#14b8a6', '#f59e0b', '#ef4444'
                    ],
                    hover_data={x_col: True, y_col: True, size_col: True, # show original value in tooltip
                        '_bubble_size': False,   # hide normalized value from tooltip
                        color_col: True
                    },
                    size_max=80
                )
            else:
                fig = px.scatter(plot_df, x=x_col, y=y_col, size='_bubble_size',
                    color_discrete_sequence=['#8b5cf6'],
                    hover_data={x_col: True, y_col: True, size_col: True, '_bubble_size': False},
                    size_max=80
                )

            # ── 8. Trace polish ───────────────────────────────────────────────
            fig.update_traces(
                opacity=0.7,                          # transparency reveals overlapping bubbles
                marker=dict(
                    line=dict(width=0.8, color='white')  # thin white border separates touching bubbles
                )
            )

            # ── 9. Axis labels with size column name for clarity ──────────────
            fig.update_layout(
                xaxis_title=x_col,
                yaxis_title=y_col,
                legend=dict(
                    title=dict(text=color_col if color_col else ''),
                    font=dict(size=11)
                )
            )

            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()

        except Exception as e:
            return json.dumps({"error": f"Bubble Chart Error: {str(e)}"})

#------------------------------------------------------------------------
    @staticmethod
    def generate_waterfall_chart(df: pd.DataFrame, title: str, x_col: str, y_col: str) -> str:
        """
        Generates a waterfall chart JSON showing cumulative effect of sequential
        positive and negative values across ordered categories.
        'x_col' is the ordered categorical/stage column (x-axis labels).
        'y_col' is the numeric column of incremental values (can be +/-).
        """
        try:
            plot_df = df.copy()

            # Safety: drop nulls in either column
            plot_df = plot_df.dropna(subset=[x_col, y_col])

            # Safety: coerce y_col to numeric, drop unconvertible rows
            plot_df[y_col] = pd.to_numeric(plot_df[y_col], errors='coerce')
            plot_df = plot_df.dropna(subset=[y_col])

            if plot_df.empty:
                return json.dumps({"error": "Waterfall: no valid rows after filtering nulls."})

            # Aggregate: if multiple rows share the same x label, sum them
            agg_df = (
                plot_df.groupby(x_col, sort=False)[y_col]
                .sum()
                .reset_index()
            )

            # Safety: cap at 20 stages — more than that is unreadable
            if len(agg_df) > 20:
                agg_df = agg_df.head(20)

            labels = agg_df[x_col].astype(str).tolist()
            values = agg_df[y_col].tolist()

            # Colour each bar: green for positive, red for negative
            colors = ['#14b8a6' if v >= 0 else '#ef4444' for v in values]

            # Build a Plotly waterfall trace directly — px has no waterfall
            fig = go.Figure(go.Waterfall(
                name='',
                orientation='v',
                x=labels,
                y=values,
                connector=dict(
                    line=dict(color='rgba(255,255,255,0.15)', width=1, dash='dot')
                ),
                increasing=dict(marker=dict(color='#14b8a6')),
                decreasing=dict(marker=dict(color='#ef4444')),
                totals=dict(marker=dict(color='#8b5cf6')),
                textposition='outside',
                texttemplate='%{y:+,.2f}',
                hovertemplate='<b>%{x}</b><br>Change: %{y:+,.2f}<br>Running total: %{base+y:,.2f}<extra></extra>'
            ))

            fig = Visualizer._apply_theme(fig, title)
            fig.update_layout(
                showlegend=False,
                waterfallgap=0.3
            )
            return fig.to_json()
        except Exception as e:
            return json.dumps({"error": f"Waterfall Chart Error: {str(e)}"})
        
#------------------------------------------------------------------------
    @staticmethod
    def generate_sunburst(df: pd.DataFrame, title: str, path_cols: list[str], value_col: str) -> str:
        """
        Generates a sunburst chart JSON showing hierarchical composition as concentric rings.
        path_cols → ordered list of categorical columns forming the hierarchy (outermost = last)
        value_col → numeric column defining each segment's size
        """
        try:
            # ── 1. Validate inputs ───────────────────────────────────────────
            if not path_cols:
                return json.dumps({"error": "Sunburst requires at least one path column."})

            for col in path_cols + [value_col]:
                if col not in df.columns:
                    return json.dumps({"error": f"Column '{col}' not found in dataset."})

            if not pd.api.types.is_numeric_dtype(df[value_col]):
                return json.dumps({"error": f"Column '{value_col}' must be numeric for sunburst chart."})

            # ── 2. Select and clean relevant columns only ────────────────────
            plot_df = df[path_cols + [value_col]].dropna()

            if plot_df.empty:
                return json.dumps({"error": "No valid data after removing nulls."})

            # ── 3. Filter non-positive values ────────────────────────────────
            # Negative or zero slice sizes break the radial geometry
            plot_df = plot_df[plot_df[value_col] > 0]

            if plot_df.empty:
                return json.dumps({"error": f"Column '{value_col}' has no positive values for sunburst sizing."})

            # ── 4. Aggregate for large datasets ──────────────────────────────
            # Raw rows with duplicate path combinations create broken ring segments
            # Aggregating collapses them into clean unique hierarchy nodes
            if len(plot_df) > 5000:
                plot_df = (
                    plot_df.groupby(path_cols)[value_col]
                    .sum()
                    .reset_index()
                )

            # ── 5. Cap unique values per level ───────────────────────────────
            # Beyond 15 unique values at any level the ring segments become
            # too thin to read labels — keep top 15 by aggregated value
            for col in path_cols:
                if plot_df[col].nunique() > 15:
                    top_vals = (
                        plot_df.groupby(col)[value_col]
                        .sum()
                        .nlargest(15)
                        .index
                    )
                    plot_df = plot_df[plot_df[col].isin(top_vals)]

            if plot_df.empty:
                return json.dumps({"error": "No data remaining after category cap."})

            # ── 6. Build figure ──────────────────────────────────────────────
            fig = px.sunburst(plot_df, path=path_cols, values=value_col,
                color=path_cols[-1],          # color by innermost level for max distinction
                color_discrete_sequence=[
                    '#8b5cf6', '#3b82f6', '#ec4899',
                    '#f97316', '#14b8a6', '#f59e0b',
                    '#ef4444', '#a78bfa', '#60a5fa',
                    '#f472b6', '#34d399', '#fbbf24',
                    '#fb923c', '#38bdf8', '#c084fc'
                ]
            )

            # ── 7. Trace polish ──────────────────────────────────────────────
            fig.update_traces(
                textinfo='label+percent parent',  # name + share within parent ring
                textfont=dict(
                    size=11,
                    family='Inter, sans-serif',
                ),
                insidetextorientation='radial',   # text follows ring curvature — readable
                marker=dict(
                    line=dict(width=1.2, color='white')  # white borders separate segments cleanly
                ),
                hovertemplate=(
                    '<b>%{label}</b><br>'
                    'Value: %{value}<br>'
                    'Share of parent: %{percentParent:.1%}<br>'
                    'Share of total: %{percentRoot:.1%}'
                    '<extra></extra>'             # removes the secondary hover box
                )
            )

            # ── 8. Layout polish ─────────────────────────────────────────────
            fig.update_layout(
                margin=dict(l=20, r=20, t=60, b=20),   # tighter margin — chart is circular
            )

            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()

        except Exception as e:
            return json.dumps({"error": f"Sunburst Chart Error: {str(e)}"})
        
        #------------------------------------------------------------------------
    @staticmethod
    def generate_donut(df: pd.DataFrame, title: str, label_col: str, value_col: str) -> str:
        """
        Generates a donut chart JSON with central total annotation.
        label_col → categorical column for slice labels
        value_col → numeric column for slice sizes
        """
        try:
            # ── 1. Validate columns ──────────────────────────────────────────
            for col in [label_col, value_col]:
                if col not in df.columns:
                    return json.dumps({"error": f"Column '{col}' not found in dataset."})

            if not pd.api.types.is_numeric_dtype(df[value_col]):
                return json.dumps({"error": f"Column '{value_col}' must be numeric for donut chart."})

            # ── 2. Aggregate ─────────────────────────────────────────────────
            plot_df = (
                df.groupby(label_col)[value_col]
                .sum()
                .reset_index()
            )
            plot_df = plot_df[plot_df[value_col] > 0]

            if plot_df.empty:
                return json.dumps({"error": "No valid positive data available for donut chart."})

            # ── 3. Category cap — beyond 10 slices lose readability ──────────
            if len(plot_df) > 10:
                top_9 = plot_df.nlargest(9, value_col)
                other_sum = plot_df[~plot_df[label_col].isin(top_9[label_col])][value_col].sum()
                other_df = pd.DataFrame([{label_col: 'Other', value_col: other_sum}])
                plot_df = pd.concat([top_9, other_df], ignore_index=True)

            # ── 4. Central total annotation ──────────────────────────────────
            total = plot_df[value_col].sum()
            if total >= 1_000_000:
                total_label = f"{total / 1_000_000:.1f}M"
            elif total >= 1_000:
                total_label = f"{total / 1_000:.1f}K"
            else:
                total_label = f"{total:,.0f}"

            # ── 5. Build figure ──────────────────────────────────────────────
            fig = go.Figure(
                go.Pie(labels=plot_df[label_col], values=plot_df[value_col], hole=0.55,
                    marker=dict(
                        colors=[
                            '#8b5cf6', '#3b82f6', '#ec4899',
                            '#f97316', '#14b8a6', '#f59e0b',
                            '#ef4444', '#a78bfa', '#60a5fa', '#f472b6'
                        ],
                        line=dict(color='white', width=1.5)
                    ),
                    textinfo='label+percent',
                    textposition='outside',
                    textfont=dict(size=11, family='Inter, sans-serif'),
                    hovertemplate=(
                        '<b>%{label}</b><br>'
                        'Value: %{value:,.0f}<br>'
                        'Share: %{percent}<br>'
                        '<extra></extra>'
                    ),
                    pull=[0.03] * len(plot_df),     # slight pull on all slices — clean separation
                )
            )

            # ── 6. Central annotation — total value in the hole ──────────────
            fig.add_annotation(
                text=f'<b>{total_label}</b>',
                x=0.5, y=0.52,
                font=dict(size=22, color='#F2F2F0', family='Inter, sans-serif'),
                showarrow=False,
                xref='paper', yref='paper'
            )
            fig.add_annotation(
                text='Total',
                x=0.5, y=0.42,
                font=dict(size=12, color='#A8A8A3', family='Inter, sans-serif'),
                showarrow=False,
                xref='paper', yref='paper'
            )

            # ── 7. Layout polish ─────────────────────────────────────────────
            fig.update_layout(
                showlegend=True,
                legend=dict(
                    orientation='v',
                    x=1.02, y=0.5,
                    font=dict(size=11, color='#475569', family='Inter, sans-serif')
                ),
                margin=dict(l=20, r=120, t=60, b=20)   # right margin for legend
            )

            fig = Visualizer._apply_theme(fig, title)
            return fig.to_json()

        except Exception as e:
            return json.dumps({"error": f"Donut Chart Error: {str(e)}"})
