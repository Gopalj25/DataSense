import pandas as pd
import json
import io
from PyPDF2 import PdfReader

class DataParser:
    @staticmethod
    def parse_csv(content: bytes) -> str:
        """Parses CSV bytes into a string summarizing the dataframe."""
        try:
            df = pd.read_csv(io.BytesIO(content))
            return DataParser._summarize_dataframe(df, "CSV")
        except Exception as e:
            return f"Error parsing CSV: {str(e)}"

    @staticmethod
    def parse_excel(content: bytes) -> str:
        """Parses XLSX bytes into a string summarizing the dataframe."""
        try:
            df = pd.read_excel(io.BytesIO(content))
            return DataParser._summarize_dataframe(df, "Excel")
        except Exception as e:
            return f"Error parsing Excel: {str(e)}"

    @staticmethod
    def parse_json(content: bytes) -> str:
        """Parses JSON bytes into a string."""
        try:
            data = json.loads(content.decode('utf-8'))
            # Flatten or summarize logic if list of dicts.
            if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                df = pd.DataFrame(data)
                return DataParser._summarize_dataframe(df, "JSON Array")
            elif isinstance(data, dict):
                # Basic string representation for dict
                keys_summary = ", ".join(data.keys())
                return f"JSON Object with keys: {keys_summary}. Content preview: {str(data)[:1000]}"
            else:
                return f"JSON Data: {str(data)[:1000]}"
        except Exception as e:
            return f"Error parsing JSON: {str(e)}"

    @staticmethod
    def parse_pdf(content: bytes) -> str:
        """Parses PDF bytes into extracted text."""
        try:
            pdf_file = io.BytesIO(content)
            reader = PdfReader(pdf_file)
            text = ""
            for i, page in enumerate(reader.pages):
                if i > 50:  # Prevent excessive parsing
                    text += f"\n... (Truncated after {i} pages)"
                    break
                page_text = page.extract_text()
                if page_text:
                    text += page_text + "\n"
            return f"PDF Document Text (Preview):\n{text[:5000]}"
        except Exception as e:
            return f"Error parsing PDF: {str(e)}"

    @staticmethod
    def extract_raw_sample(content: bytes, filename: str) -> list:
        """Extracts up to 50 rows of raw data for frontend chart rendering."""
        try:
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
                return df.head(50).fillna("").to_dict(orient="records")
            elif filename.endswith(".xlsx") or filename.endswith(".xls"):
                df = pd.read_excel(io.BytesIO(content))
                return df.head(50).fillna("").to_dict(orient="records")
            elif filename.endswith(".json"):
                data = json.loads(content.decode('utf-8'))
                if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                    df = pd.DataFrame(data)
                    return df.head(50).fillna("").to_dict(orient="records")
                return []
            return []
        except Exception:
            return []

    @staticmethod
    def extract_column_metadata(content: bytes, filename: str) -> dict:
        """
        Returns column metadata dict for structured files.
        Format: { colName: { type: 'numeric'|'categorical', samples: [...], nunique: N } }
        For PDFs, returns { '_is_document': True }.
        """
        try:
            df = None
            if filename.endswith(".csv"):
                df = pd.read_csv(io.BytesIO(content))
            elif filename.endswith(".xlsx") or filename.endswith(".xls"):
                df = pd.read_excel(io.BytesIO(content))
            elif filename.endswith(".json"):
                data = json.loads(content.decode('utf-8'))
                if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                    df = pd.DataFrame(data)

            if df is not None:
                meta = {}
                for col in df.columns:
                    is_numeric = pd.api.types.is_numeric_dtype(df[col])
                    samples = df[col].dropna().unique()[:5].tolist()
                    # Convert numpy types to Python native for JSON serialization
                    samples = [s.item() if hasattr(s, 'item') else s for s in samples]
                    meta[col] = {
                        "type": "numeric" if is_numeric else "categorical",
                        "samples": [str(s)[:40] for s in samples],
                        "nunique": int(df[col].nunique()),
                        "null_count": int(df[col].isna().sum())
                    }
                    if is_numeric:
                        meta[col]["min"] = float(df[col].min()) if not df[col].empty else 0
                        meta[col]["max"] = float(df[col].max()) if not df[col].empty else 0
                return meta
            # PDF or unstructured
            return {"_is_document": True}
        except Exception as e:
            return {"_is_document": True, "error": str(e)}

    @staticmethod
    def _summarize_dataframe(df: pd.DataFrame, file_type: str) -> str:
        """Generates a text summary of a pandas dataframe."""
        shapes = f"Rows: {df.shape[0]}, Columns: {df.shape[1]}"
        columns = ", ".join(df.columns.tolist())
        head = df.head(5).to_csv(index=False)
        return (
            f"File Type: {file_type}\n"
            f"{shapes}\n"
            f"Columns: {columns}\n\n"
            f"First 5 Rows:\n{head}\n"
        )
