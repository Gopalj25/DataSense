import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileType, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import axios from 'axios';
import type { InsightData } from '../App';

interface FileUploadProps {
    onSuccess: (data: InsightData) => void;
}

export default function FileUpload({ onSuccess }: FileUploadProps) {
    const [dragActive, setDragActive] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingText, setLoadingText] = useState("Analyzing Data...");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!loading) return;
        const texts = [
            "Parsing file structure...",
            "Extracting schema and column metadata...",
            "AI is mapping relations...",
            "Generating optimized visual configurations...",
            "Finalizing your interactive dashboard..."
        ];
        let i = 0;
        setLoadingText(texts[0]);
        const interval = setInterval(() => {
            i = (i + 1) % texts.length;
            setLoadingText(texts[i]);
        }, 3000);
        return () => clearInterval(interval);
    }, [loading]);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.preventDefault();
        if (e.target.files && e.target.files[0]) {
            handleFile(e.target.files[0]);
        }
    };

    const handleFile = (selectedFile: File) => {
        setFile(selectedFile);
        setError(null);
    };

    const handleUpload = async () => {
        if (!file) return;
        setLoading(true);
        setError(null);

        const formData = new FormData();
        formData.append("file", file);

        try {
            const response = await axios.post("http://localhost:8000/api/upload", formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });
            onSuccess(response.data);
        } catch (err: any) {
            console.error(err);
            setError(err.response?.data?.detail || "An error occurred during file upload.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full max-w-5xl px-4 flex flex-col items-center justify-center my-auto min-h-[600px] animate-in fade-in zoom-in-95 duration-500">
            <div className="text-center mb-10 w-full max-w-3xl">
                <h2 className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-orange-600 to-yellow-500 mb-6 drop-shadow-sm">
                    Uncover Hidden Insights
                </h2>
                <p className="text-slate-600 text-xl leading-relaxed">
                    Upload your data securely and let our AI Agent generate visual summaries and answer your questions instantly.
                </p>
            </div>

            <div
                className={`relative group flex flex-col items-center justify-center w-full h-96 md:h-[450px] rounded-3xl border-2 border-dashed transition-all duration-300 ${dragActive
                    ? "border-orange-500 bg-orange-100 scale-[1.02]"
                    : "border-slate-300 bg-white hover:border-orange-400 hover:bg-orange-50"
                    } shadow-lg`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
            >
                <input
                    ref={inputRef}
                    type="file"
                    className="hidden"
                    accept=".csv,.xlsx,.xls,.json,.pdf"
                    onChange={handleChange}
                />

                {!file ? (
                    <div className="flex flex-col items-center space-y-4 pointer-events-none">
                        <div className="p-4 bg-gradient-to-tr from-orange-100 to-yellow-100 rounded-full group-hover:scale-110 transition-transform duration-300">
                            <UploadCloud size={48} className="text-orange-500" />
                        </div>
                        <div className="text-center">
                            <p className="text-xl font-semibold text-slate-700">
                                Click to upload or drag and drop
                            </p>
                            <p className="text-slate-500 mt-2">
                                CSV, XLSX, JSON, or PDF (max. 50MB)
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center space-y-4 z-10">
                        <div className="p-4 bg-green-100 rounded-full">
                            <FileType size={48} className="text-green-500" />
                        </div>
                        <p className="text-xl font-semibold text-slate-800">{file.name}</p>
                        <p className="text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                )}

                {/* Glossy overlay effect */}
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent rounded-3xl pointer-events-none" />
            </div>

            <div className="mt-8 flex flex-col items-center gap-4">
                {error && (
                    <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-4 py-3 rounded-xl border border-red-400/20 w-full justify-center">
                        <AlertCircle size={20} />
                        <span>{error}</span>
                    </div>
                )}

                <button
                    disabled={!file || loading}
                    onClick={handleUpload}
                    className={`relative overflow-hidden group px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 w-full sm:w-auto min-w-[200px] flex items-center justify-center gap-3 ${!file || loading
                        ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                        : "bg-orange-500 hover:bg-orange-600 text-white shadow-md hover:shadow-lg border border-orange-400/50"
                        }`}
                >
                    {loading ? (
                        <>
                            <Loader2 size={24} className="animate-spin" />
                            <span className="min-w-[280px] text-center">{loadingText}</span>
                            {/* Progress bar overlay animation */}
                            <div className="absolute inset-0 bg-white/20 animate-pulse" />
                        </>
                    ) : (
                        <>
                            <CheckCircle size={24} />
                            <span>Generate Dashboard</span>
                        </>
                    )}
                </button>
            </div>
        </div>
    );
}
