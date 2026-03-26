import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileCheck, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import type { InsightData } from '../App';

interface FileUploadProps {
    onSuccess: (data: InsightData) => void;
}

export default function FileUpload({ onSuccess }: FileUploadProps) {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState("Analyzing data…");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!loading) return;
        const texts = [
            "Parsing file structure…",
            "Extracting schema and column metadata…",
            "AI is mapping relations…",
            "Generating optimized visual configurations…",
            "Finalizing your interactive dashboard…"
        ];
        let i = 0;
        setLoadingText(texts[0]);
        const interval = setInterval(() => { i = (i + 1) % texts.length; setLoadingText(texts[i]); }, 3000);
        return () => clearInterval(interval);
    }, [loading]);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(e.type === "dragenter" || e.type === "dragover");
    };
    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation(); setDragActive(false);
        if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
    };
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) handleFile(e.target.files[0]);
    };
    const handleFile = (f: File) => { setFile(f); setError(null); };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true); setError(null);
        const fd = new FormData(); fd.append("file", file);
        try {
            const res = await axios.post("http://localhost:8000/api/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
            });
            onSuccess(res.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || "Upload failed.");
        } finally { setLoading(false); }
    };

    return (
        <div className="flex-1 flex items-center justify-center" style={{ background: 'var(--bg-canvas)' }}>
            <div className="w-full max-w-[560px] mx-auto px-4 flex flex-col items-center">
                {/* Branding */}
                <div className="mb-10 text-center">
                    <div className="inline-flex items-center gap-2 mb-3">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <rect x="4" y="4" width="16" height="16" rx="3" transform="rotate(6 12 12)"
                                  fill="var(--accent)" opacity="0.8" />
                            <rect x="6" y="6" width="12" height="12" rx="2" transform="rotate(6 12 12)"
                                  fill="var(--accent)" />
                        </svg>
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 20, color: 'var(--text-primary)' }}>
                            DataSense
                        </span>
                    </div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Your data, instantly understood.</p>
                </div>

                {/* Dropzone */}
                <div
                    className="w-full cursor-pointer transition-all"
                    style={{
                        border: `1.5px dashed ${dragActive ? 'var(--accent)' : 'var(--border-strong)'}`,
                        borderRadius: 16, padding: '48px 32px',
                        background: dragActive ? 'var(--accent-dim)' : 'var(--bg-inset)',
                    }}
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag}
                    onDrop={handleDrop} onClick={() => inputRef.current?.click()}
                >
                    <input ref={inputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls,.json,.pdf" onChange={handleChange} />
                    <div className="flex flex-col items-center gap-3">
                        {!file ? (
                            <>
                                <UploadCloud size={28} style={{ color: 'var(--text-muted)' }} />
                                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)' }}>
                                    Drop file here or click to browse
                                </p>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    CSV · XLSX · JSON · PDF · ≤ 50MB
                                </p>
                            </>
                        ) : (
                            <>
                                <FileCheck size={28} style={{ color: 'var(--success)' }} />
                                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
                                    {file.name}
                                </p>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    {(file.size / 1024 / 1024).toFixed(2)} MB
                                </p>
                            </>
                        )}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-center gap-2 mt-4 px-4 py-3 rounded-lg w-full"
                         style={{ background: 'var(--danger-dim)', color: 'var(--danger)', border: '1px solid rgba(248,113,113,0.2)', fontSize: 13 }}>
                        <AlertCircle size={16} /> {error}
                    </div>
                )}

                {/* Submit */}
                <button
                    disabled={!file || loading} onClick={handleUpload}
                    className="w-full mt-4 flex items-center justify-center gap-2 transition-all"
                    style={{
                        background: !file || loading ? 'var(--bg-elevated)' : 'var(--accent)',
                        color: !file || loading ? 'var(--text-muted)' : 'white',
                        borderRadius: 10, padding: '10px 28px', fontSize: 14, fontWeight: 500,
                        cursor: !file || loading ? 'not-allowed' : 'pointer',
                    }}
                >
                    {loading ? (
                        <><Loader2 size={16} className="animate-spin" /><span>{loadingText}</span></>
                    ) : (
                        'Generate Dashboard'
                    )}
                </button>
            </div>
        </div>
    );
}
