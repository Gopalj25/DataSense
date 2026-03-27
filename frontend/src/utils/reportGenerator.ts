import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import axios from 'axios';
import type { InsightData, ChartConfig } from '../App';

// ─── Types ───────────────────────────────────────────────────
interface ReportNarrative {
    executive_summary: string;
    chart_interpretations: Record<string, string>;
    key_findings: string[];
    closing_takeaway: string;
}

// ─── Constants ───────────────────────────────────────────────
const PAGE_W = 210;  // A4 mm
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - MARGIN * 2;
const ACCENT = '#6366F1';
const TEXT_PRIMARY = '#1a1a1a';
const TEXT_SECONDARY = '#4a4a4a';
const TEXT_MUTED = '#6b7280';
const DIVIDER = '#e5e7eb';

// ─── Helpers ─────────────────────────────────────────────────

function addPageNumber(pdf: jsPDF, pageNum: number) {
    pdf.setFontSize(8);
    pdf.setTextColor(TEXT_MUTED);
    pdf.text(`Page ${pageNum}`, PAGE_W / 2, PAGE_H - 10, { align: 'center' });
    pdf.text('DataSense Report', MARGIN, PAGE_H - 10);
}

function drawDivider(pdf: jsPDF, y: number): number {
    pdf.setDrawColor(DIVIDER);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
    return y + 6;
}

/** Wraps text and returns lines + actual height consumed */
function writeWrappedText(pdf: jsPDF, text: string, x: number, y: number,
                          maxWidth: number, lineHeight: number): number {
    const lines = pdf.splitTextToSize(text, maxWidth);
    pdf.text(lines, x, y);
    return y + lines.length * lineHeight;
}

/** Ensures we're not overflowing the page — adds new page if needed */
function ensureSpace(pdf: jsPDF, currentY: number, needed: number, pageNum: { val: number }): number {
    if (currentY + needed > PAGE_H - 25) {
        addPageNumber(pdf, pageNum.val);
        pdf.addPage();
        pageNum.val += 1;
        return MARGIN + 10;
    }
    return currentY;
}

// ─── Main Export Function ────────────────────────────────────

export async function generateReport(
    data: InsightData,
    onProgress?: (status: string) => void
): Promise<void> {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageNum = { val: 1 };

    // ── Step 1: Fetch AI narrative (non-blocking, fallback on failure) ──
    onProgress?.('Generating AI insights…');
    let narrative: ReportNarrative = {
        executive_summary: '',
        chart_interpretations: {},
        key_findings: [],
        closing_takeaway: ''
    };

    try {
        const res = await axios.post('http://localhost:8000/api/report-summary', {
            content_summary: data.content_summary,
            column_meta: data.column_meta,
            chart_configs: (data.chart_configs || []).map(c => ({
                type: c.type, title: c.title, description: c.description
            })),
            filename: data.filename
        });
        if (res.data) narrative = res.data;
    } catch (e) {
        console.warn('AI narrative unavailable, proceeding with screenshot-only report');
    }

    const hasNarrative = !!narrative.executive_summary;

    // ═══════════════════════════════════════════════════════════
    // PAGE 1 — Cover
    // ═══════════════════════════════════════════════════════════
    onProgress?.('Building cover page…');

    // Accent bar at top
    pdf.setFillColor(ACCENT);
    pdf.rect(0, 0, PAGE_W, 4, 'F');

    // Logo mark
    pdf.setFillColor(ACCENT);
    pdf.roundedRect(MARGIN, 60, 14, 14, 3, 3, 'F');
    pdf.setFontSize(9);
    pdf.setTextColor('#ffffff');
    pdf.text('DS', MARGIN + 3.5, 69);

    // Title
    pdf.setFontSize(32);
    pdf.setTextColor(TEXT_PRIMARY);
    pdf.setFont('helvetica', 'bold');
    pdf.text('DataSense', MARGIN + 20, 70);

    pdf.setFontSize(14);
    pdf.setTextColor(TEXT_SECONDARY);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Analysis Report', MARGIN + 20, 79);

    // File info block
    const rowCount = data.original_data?.length ?? 0;
    const colCount = data.column_meta ? Object.keys(data.column_meta).length : 0;
    const chartCount = data.chart_configs?.length ?? 0;
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    pdf.setDrawColor(DIVIDER);
    pdf.setLineWidth(0.5);
    pdf.line(MARGIN, 100, PAGE_W - MARGIN, 100);

    pdf.setFontSize(11);
    pdf.setTextColor(TEXT_PRIMARY);
    pdf.setFont('helvetica', 'bold');

    const infoItems = [
        ['File', data.filename],
        ['Generated', `${dateStr} at ${timeStr}`],
        ['Dataset', `${rowCount.toLocaleString()} rows × ${colCount} columns`],
        ['Charts', `${chartCount} visualizations`],
    ];

    let infoY = 112;
    for (const [label, value] of infoItems) {
        pdf.setFontSize(9);
        pdf.setTextColor(TEXT_MUTED);
        pdf.setFont('helvetica', 'normal');
        pdf.text(label.toUpperCase(), MARGIN, infoY);
        pdf.setFontSize(11);
        pdf.setTextColor(TEXT_PRIMARY);
        pdf.text(value, MARGIN + 35, infoY);
        infoY += 10;
    }

    pdf.line(MARGIN, infoY + 2, PAGE_W - MARGIN, infoY + 2);

    // Quick summary at bottom of cover
    if (data.insights?.summary) {
        pdf.setFontSize(10);
        pdf.setTextColor(TEXT_SECONDARY);
        pdf.setFont('helvetica', 'italic');
        const summaryLines = pdf.splitTextToSize(data.insights.summary, CONTENT_W);
        pdf.text(summaryLines.slice(0, 6), MARGIN, infoY + 14);
    }

    // Footer
    pdf.setFontSize(7);
    pdf.setTextColor(TEXT_MUTED);
    pdf.text('Generated by DataSense · AI-Powered Data Intelligence', PAGE_W / 2, PAGE_H - 15, { align: 'center' });
    addPageNumber(pdf, pageNum.val);

    // ═══════════════════════════════════════════════════════════
    // PAGE 2 — Executive Summary (if AI narrative available)
    // ═══════════════════════════════════════════════════════════
    if (hasNarrative) {
        onProgress?.('Writing executive summary…');
        pdf.addPage();
        pageNum.val += 1;
        let y = MARGIN;

        // Section header
        pdf.setFillColor(ACCENT);
        pdf.rect(MARGIN, y, 3, 10, 'F');
        pdf.setFontSize(16);
        pdf.setTextColor(TEXT_PRIMARY);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Executive Summary', MARGIN + 8, y + 8);
        y += 20;

        pdf.setFontSize(10);
        pdf.setTextColor(TEXT_SECONDARY);
        pdf.setFont('helvetica', 'normal');

        // Split paragraphs
        const paragraphs = narrative.executive_summary.split('\n').filter(p => p.trim());
        for (const para of paragraphs) {
            y = ensureSpace(pdf, y, 30, pageNum);
            y = writeWrappedText(pdf, para.trim(), MARGIN, y, CONTENT_W, 4.5);
            y += 4;
        }

        addPageNumber(pdf, pageNum.val);
    }

    // ═══════════════════════════════════════════════════════════
    // PAGES 3+ — Charts (one per page)
    // ═══════════════════════════════════════════════════════════
    onProgress?.('Capturing charts…');

    const plotlyElements = document.querySelectorAll('.js-plotly-plot');
    const chartConfigs = data.chart_configs || [];

    for (let i = 0; i < chartConfigs.length; i++) {
        const cfg = chartConfigs[i];
        if (!cfg.plotly_json) continue;

        pdf.addPage();
        pageNum.val += 1;
        let y = MARGIN;

        // Chart title
        pdf.setFillColor(ACCENT);
        pdf.rect(MARGIN, y, 3, 8, 'F');
        pdf.setFontSize(14);
        pdf.setTextColor(TEXT_PRIMARY);
        pdf.setFont('helvetica', 'bold');
        pdf.text(cfg.title || `Chart ${i + 1}`, MARGIN + 8, y + 6);
        y += 14;

        if (cfg.description) {
            pdf.setFontSize(9);
            pdf.setTextColor(TEXT_MUTED);
            pdf.setFont('helvetica', 'italic');
            y = writeWrappedText(pdf, cfg.description, MARGIN, y, CONTENT_W, 3.8);
            y += 4;
        }

        y = drawDivider(pdf, y);

        // Capture chart screenshot via html2canvas on the Plotly DOM element
        // We render the chart fresh using Plotly.toImage for cleaner output
        const Plotly = (window as any).Plotly;
        if (Plotly && cfg.plotly_json) {
            try {
                const parsed = JSON.parse(cfg.plotly_json);
                const imgData = await Plotly.toImage(
                    { data: parsed.data, layout: { ...parsed.layout, width: 1000, height: 550, paper_bgcolor: '#ffffff', plot_bgcolor: '#fafafa', font: { color: '#1a1a1a' } } },
                    { format: 'png', width: 1000, height: 550 }
                );
                const imgW = CONTENT_W;
                const imgH = imgW * (550 / 1000);
                pdf.addImage(imgData, 'PNG', MARGIN, y, imgW, imgH);
                y += imgH + 6;
            } catch (e) {
                // Fallback: try html2canvas on DOM element
                if (plotlyElements[i]) {
                    try {
                        const canvas = await html2canvas(plotlyElements[i] as HTMLElement, {
                            backgroundColor: '#ffffff', scale: 2, useCORS: true
                        });
                        const imgData = canvas.toDataURL('image/png');
                        const imgW = CONTENT_W;
                        const imgH = (canvas.height / canvas.width) * imgW;
                        pdf.addImage(imgData, 'PNG', MARGIN, y, imgW, Math.min(imgH, 140));
                        y += Math.min(imgH, 140) + 6;
                    } catch {
                        pdf.setFontSize(10);
                        pdf.setTextColor(TEXT_MUTED);
                        pdf.text('[Chart could not be captured]', MARGIN, y + 10);
                        y += 20;
                    }
                }
            }
        }

        // AI caption for this chart
        const caption = narrative.chart_interpretations?.[cfg.title || ''];
        if (caption) {
            y = ensureSpace(pdf, y, 20, pageNum);
            pdf.setFillColor('#f3f4f6');
            const captionLines = pdf.splitTextToSize(caption, CONTENT_W - 16);
            const captionH = captionLines.length * 4.5 + 8;
            pdf.roundedRect(MARGIN, y, CONTENT_W, captionH, 2, 2, 'F');
            pdf.setFontSize(9);
            pdf.setTextColor(TEXT_SECONDARY);
            pdf.setFont('helvetica', 'italic');
            pdf.text(captionLines, MARGIN + 8, y + 6);
            y += captionH + 4;
        }

        addPageNumber(pdf, pageNum.val);
    }

    // ═══════════════════════════════════════════════════════════
    // KEY FINDINGS PAGE
    // ═══════════════════════════════════════════════════════════
    if (narrative.key_findings?.length > 0) {
        onProgress?.('Adding key findings…');
        pdf.addPage();
        pageNum.val += 1;
        let y = MARGIN;

        pdf.setFillColor(ACCENT);
        pdf.rect(MARGIN, y, 3, 10, 'F');
        pdf.setFontSize(16);
        pdf.setTextColor(TEXT_PRIMARY);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Key Findings', MARGIN + 8, y + 8);
        y += 22;

        for (let fi = 0; fi < narrative.key_findings.length; fi++) {
            y = ensureSpace(pdf, y, 25, pageNum);

            // Numbered badge
            pdf.setFillColor(ACCENT);
            pdf.circle(MARGIN + 4, y + 1, 4, 'F');
            pdf.setFontSize(8);
            pdf.setTextColor('#ffffff');
            pdf.setFont('helvetica', 'bold');
            pdf.text(String(fi + 1), MARGIN + 2.5, y + 3.3);

            // Finding text
            pdf.setFontSize(10);
            pdf.setTextColor(TEXT_SECONDARY);
            pdf.setFont('helvetica', 'normal');
            y = writeWrappedText(pdf, narrative.key_findings[fi], MARGIN + 14, y + 2, CONTENT_W - 14, 4.5);
            y += 6;
        }

        // Closing takeaway
        if (narrative.closing_takeaway) {
            y = ensureSpace(pdf, y, 30, pageNum);
            y += 4;
            y = drawDivider(pdf, y);
            y += 2;

            pdf.setFillColor('#eef2ff');
            const takeawayLines = pdf.splitTextToSize(narrative.closing_takeaway, CONTENT_W - 16);
            const tH = takeawayLines.length * 5 + 12;
            pdf.roundedRect(MARGIN, y, CONTENT_W, tH, 3, 3, 'F');

            pdf.setFontSize(8);
            pdf.setTextColor(ACCENT);
            pdf.setFont('helvetica', 'bold');
            pdf.text('KEY TAKEAWAY', MARGIN + 8, y + 7);

            pdf.setFontSize(10);
            pdf.setTextColor(TEXT_PRIMARY);
            pdf.setFont('helvetica', 'normal');
            pdf.text(takeawayLines, MARGIN + 8, y + 14);
        }

        addPageNumber(pdf, pageNum.val);
    }

    // ═══════════════════════════════════════════════════════════
    // KNOWLEDGE GRAPH PAGE (if SVG exists in DOM)
    // ═══════════════════════════════════════════════════════════
    const kgSvg = document.querySelector('svg[viewBox]');
    if (kgSvg) {
        try {
            onProgress?.('Capturing knowledge graph…');
            const kgContainer = kgSvg.closest('div');
            if (kgContainer) {
                const canvas = await html2canvas(kgContainer as HTMLElement, {
                    backgroundColor: '#ffffff', scale: 2, useCORS: true
                });
                const imgData = canvas.toDataURL('image/png');

                pdf.addPage();
                pageNum.val += 1;
                let y = MARGIN;

                pdf.setFillColor(ACCENT);
                pdf.rect(MARGIN, y, 3, 10, 'F');
                pdf.setFontSize(16);
                pdf.setTextColor(TEXT_PRIMARY);
                pdf.setFont('helvetica', 'bold');
                pdf.text('Knowledge Graph', MARGIN + 8, y + 8);
                y += 18;

                const imgW = CONTENT_W;
                const imgH = (canvas.height / canvas.width) * imgW;
                pdf.addImage(imgData, 'PNG', MARGIN, y, imgW, Math.min(imgH, 180));

                addPageNumber(pdf, pageNum.val);
            }
        } catch {
            // KG capture failed — skip silently
        }
    }

    // ═══════════════════════════════════════════════════════════
    // DATA SAMPLE TABLE (first 10 rows)
    // ═══════════════════════════════════════════════════════════
    if (data.original_data?.length > 0) {
        onProgress?.('Building data sample table…');
        pdf.addPage();
        pageNum.val += 1;
        let y = MARGIN;

        pdf.setFillColor(ACCENT);
        pdf.rect(MARGIN, y, 3, 10, 'F');
        pdf.setFontSize(16);
        pdf.setTextColor(TEXT_PRIMARY);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Data Sample', MARGIN + 8, y + 8);
        y += 14;

        pdf.setFontSize(8);
        pdf.setTextColor(TEXT_MUTED);
        pdf.setFont('helvetica', 'normal');
        pdf.text(`First 10 rows of ${data.original_data.length.toLocaleString()} total rows`, MARGIN + 8, y + 2);
        y += 10;

        const rows = data.original_data.slice(0, 10);
        const cols = Object.keys(rows[0] || {});
        const maxCols = Math.min(cols.length, 8); // limit columns to fit
        const visibleCols = cols.slice(0, maxCols);
        const colW = CONTENT_W / maxCols;

        // Header
        pdf.setFillColor('#f3f4f6');
        pdf.rect(MARGIN, y, CONTENT_W, 7, 'F');
        pdf.setFontSize(6.5);
        pdf.setTextColor(TEXT_PRIMARY);
        pdf.setFont('helvetica', 'bold');
        for (let ci = 0; ci < visibleCols.length; ci++) {
            const label = visibleCols[ci].length > 12 ? visibleCols[ci].slice(0, 11) + '…' : visibleCols[ci];
            pdf.text(label, MARGIN + ci * colW + 2, y + 5);
        }
        y += 8;

        // Rows
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        for (const row of rows) {
            y = ensureSpace(pdf, y, 7, pageNum);
            pdf.setDrawColor(DIVIDER);
            pdf.line(MARGIN, y, PAGE_W - MARGIN, y);
            y += 1;

            for (let ci = 0; ci < visibleCols.length; ci++) {
                const val = row[visibleCols[ci]];
                const display = val != null ? String(val).slice(0, 18) : '—';
                pdf.setTextColor(typeof val === 'number' ? TEXT_PRIMARY : TEXT_SECONDARY);
                pdf.text(display, MARGIN + ci * colW + 2, y + 4);
            }
            y += 6;
        }

        if (cols.length > maxCols) {
            y += 4;
            pdf.setFontSize(7);
            pdf.setTextColor(TEXT_MUTED);
            pdf.setFont('helvetica', 'italic');
            pdf.text(`+ ${cols.length - maxCols} more columns not shown`, MARGIN, y);
        }

        addPageNumber(pdf, pageNum.val);
    }

    // ═══════════════════════════════════════════════════════════
    // Save
    // ═══════════════════════════════════════════════════════════
    onProgress?.('Saving PDF…');
    const safeName = data.filename.replace(/[^a-z0-9]/gi, '_');
    pdf.save(`DataSense_${safeName}_Report.pdf`);
}
