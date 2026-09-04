"""
Text extraction for PDF, DOCX, and TXT files.

Design decisions:
- pdfplumber over PyPDF2: pdfplumber handles tables, multi-column layouts,
  and non-standard encodings far better for production documents.
- python-docx for DOCX: extracts paragraphs in order preserving headings.
- Page numbers are extracted at the PDF page level and propagated to chunks
  so citations can reference exact pages.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass, field
from typing import Iterator

import pdfplumber
from docx import Document as DocxDocument


@dataclass
class PageText:
    page_number: int  # 1-indexed
    text: str


@dataclass
class ExtractionResult:
    pages: list[PageText] = field(default_factory=list)
    full_text: str = ""
    page_count: int = 0
    error: str | None = None


def _normalize(text: str) -> str:
    """
    Clean extracted text without destroying semantic content.
    - Collapse 3+ blank lines to 2 (preserve paragraph breaks)
    - Remove form feeds / null bytes
    - Normalize whitespace within lines
    """
    text = text.replace("\x0c", "\n").replace("\x00", "")
    # Normalize within-line multiple spaces (but not indent/newlines)
    lines = [re.sub(r" {3,}", "  ", line) for line in text.splitlines()]
    text = "\n".join(lines)
    # Collapse excess blank lines
    text = re.sub(r"\n{4,}", "\n\n\n", text)
    return text.strip()


def _table_to_text(table: list[list[str | None]]) -> str:
    """
    Convert a pdfplumber table (list of rows, each a list of cell strings)
    into a readable pipe-delimited markdown-style table.
    Empty/None cells become empty strings.
    """
    if not table:
        return ""
    rows = []
    for row in table:
        cells = [str(c).strip() if c else "" for c in row]
        rows.append(" | ".join(cells))
    return "\n".join(rows)


def extract_pdf(data: bytes) -> ExtractionResult:
    result = ExtractionResult()
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            result.page_count = len(pdf.pages)
            for i, page in enumerate(pdf.pages, start=1):
                parts: list[str] = []

                # Extract tables first and record their bounding boxes so
                # the plain-text pass can exclude those regions (avoids duplicate
                # garbled column text).
                tables = page.extract_tables()
                table_bboxes: list[tuple[float, float, float, float]] = []
                for table_obj in page.find_tables():
                    table_bboxes.append(table_obj.bbox)

                for table in tables:
                    t = _table_to_text(table)
                    if t:
                        parts.append(t)

                # Extract plain text from non-table regions
                if table_bboxes:
                    # Crop away table regions and extract remaining text
                    remaining = page
                    for bbox in table_bboxes:
                        try:
                            # pdfplumber: filter out words inside each table bbox
                            remaining = remaining.filter(
                                lambda obj, b=bbox: not (
                                    obj.get("object_type") in ("char", "anno")
                                    and b[0] <= obj["x0"] <= b[2]
                                    and b[1] <= obj["top"] <= b[3]
                                )
                            )
                        except Exception:
                            pass
                    raw = remaining.extract_text(x_tolerance=3, y_tolerance=3) or ""
                else:
                    raw = page.extract_text(x_tolerance=3, y_tolerance=3) or ""

                cleaned = _normalize(raw)
                if cleaned:
                    parts.insert(0, cleaned)  # text before tables

                page_text = "\n\n".join(p for p in parts if p.strip())
                if page_text:
                    result.pages.append(PageText(page_number=i, text=page_text))

    except Exception as exc:
        result.error = f"PDF extraction failed: {exc}"
        return result

    result.full_text = "\n\n".join(p.text for p in result.pages)
    return result


def extract_docx(data: bytes) -> ExtractionResult:
    result = ExtractionResult()
    try:
        doc = DocxDocument(io.BytesIO(data))
        paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
        full_text = _normalize("\n\n".join(paragraphs))
        # DOCX has no page concept — treat whole document as page 1
        result.pages = [PageText(page_number=1, text=full_text)]
        result.full_text = full_text
        result.page_count = 1
    except Exception as exc:
        result.error = f"DOCX extraction failed: {exc}"
    return result


def extract_txt(data: bytes) -> ExtractionResult:
    result = ExtractionResult()
    try:
        text = data.decode("utf-8", errors="replace")
        cleaned = _normalize(text)
        result.pages = [PageText(page_number=1, text=cleaned)]
        result.full_text = cleaned
        result.page_count = 1
    except Exception as exc:
        result.error = f"TXT extraction failed: {exc}"
    return result


def extract(data: bytes, source_type: str) -> ExtractionResult:
    """Dispatch to the correct extractor."""
    if source_type == "pdf":
        return extract_pdf(data)
    if source_type == "docx":
        return extract_docx(data)
    if source_type in ("txt", "md"):
        return extract_txt(data)
    return ExtractionResult(error=f"Unsupported source type: {source_type}")
