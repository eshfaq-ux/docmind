"""
Unit tests for extractor.py
"""
import io
import pytest
from extractor import extract_txt, extract_pdf, extract_docx, extract, _normalize


# ── Normalize ─────────────────────────────────────────────────────────────────

def test_normalize_strips_form_feeds():
    text = "Hello\x0cWorld"
    result = _normalize(text)
    assert "\x0c" not in result
    assert "Hello" in result
    assert "World" in result


def test_normalize_collapses_blank_lines():
    text = "A\n\n\n\n\n\nB"
    result = _normalize(text)
    assert result.count("\n") <= 3  # max 2 blank lines = 3 newlines


def test_normalize_null_bytes():
    text = "Hello\x00World"
    assert "\x00" not in _normalize(text)


# ── TXT extraction ────────────────────────────────────────────────────────────

def test_extract_txt_basic():
    data = b"Hello, world.\nThis is a test."
    result = extract_txt(data)
    assert result.error is None
    assert "Hello, world." in result.full_text
    assert result.page_count == 1
    assert len(result.pages) == 1
    assert result.pages[0].page_number == 1


def test_extract_txt_utf8_with_errors():
    data = b"Hello \xff\xfe world"
    result = extract_txt(data)
    assert result.error is None
    assert "Hello" in result.full_text


def test_extract_txt_empty():
    result = extract_txt(b"")
    # Empty text is normalised to empty string — pages will be empty
    assert result.error is None


# ── PDF extraction ────────────────────────────────────────────────────────────

def test_extract_pdf_invalid_bytes():
    result = extract_pdf(b"not a pdf")
    assert result.error is not None


# ── Dispatch ─────────────────────────────────────────────────────────────────

def test_extract_dispatch_txt():
    data = b"Simple text content."
    result = extract(data, "txt")
    assert result.error is None
    assert "Simple text" in result.full_text


def test_extract_dispatch_unsupported():
    result = extract(b"data", "xlsx")
    assert result.error is not None
    assert "Unsupported" in result.error
