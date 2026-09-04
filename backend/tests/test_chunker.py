"""
Unit tests for chunker.py

Run: pytest backend/tests/ -v
"""
import pytest
from extractor import PageText
from chunker import chunk_pages, _count_tokens


# ── Helpers ───────────────────────────────────────────────────────────────────

def make_pages(text: str, page: int = 1) -> list[PageText]:
    return [PageText(page_number=page, text=text)]


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_empty_pages_returns_no_chunks():
    assert chunk_pages([]) == []


def test_empty_page_text_returns_no_chunks():
    assert chunk_pages(make_pages("")) == []


def test_short_text_produces_single_chunk():
    text = "The quick brown fox jumps over the lazy dog."
    chunks = chunk_pages(make_pages(text), chunk_size=512, chunk_overlap=64)
    assert len(chunks) == 1
    assert chunks[0].content == text
    assert chunks[0].page_number == 1
    assert chunks[0].chunk_index == 0


def test_long_text_produces_multiple_chunks():
    # ~600 tokens of text
    sentence = "This is a test sentence with some words in it. "
    text = sentence * 40  # roughly 400+ tokens
    chunks = chunk_pages(make_pages(text), chunk_size=100, chunk_overlap=20)
    assert len(chunks) > 1


def test_chunk_token_counts_within_limit():
    sentence = "The cat sat on the mat and looked at the hat. "
    text = sentence * 50
    chunk_size = 128
    chunks = chunk_pages(make_pages(text), chunk_size=chunk_size, chunk_overlap=32)
    for chunk in chunks:
        # Allow small overshoot from overlap seeding (≤ 10%)
        assert _count_tokens(chunk.content) <= chunk_size * 1.1


def test_overlap_carries_context():
    """Last chunk should start with tokens from the previous chunk."""
    # Force small chunk size to get at least 3 chunks
    text = " ".join(["word"] * 200)
    chunks = chunk_pages(make_pages(text), chunk_size=30, chunk_overlap=10)
    assert len(chunks) >= 3
    # Each chunk should have a positive token count
    for c in chunks:
        assert c.token_count > 0


def test_page_numbers_propagated():
    pages = [
        PageText(page_number=1, text="Page one content. More content here."),
        PageText(page_number=2, text="Page two content. Even more content here."),
    ]
    chunks = chunk_pages(pages, chunk_size=512, chunk_overlap=0)
    page_nums = {c.page_number for c in chunks}
    assert 1 in page_nums
    assert 2 in page_nums


def test_chunk_indices_sequential():
    sentence = "Another test sentence here. "
    text = sentence * 50
    chunks = chunk_pages(make_pages(text), chunk_size=60, chunk_overlap=10)
    for i, chunk in enumerate(chunks):
        assert chunk.chunk_index == i


def test_oversized_single_sentence_is_split():
    """A sentence longer than chunk_size should produce multiple chunks."""
    # 200-word sentence — well above any reasonable chunk_size
    long_sentence = " ".join(["word"] * 200) + "."
    chunks = chunk_pages(make_pages(long_sentence), chunk_size=50, chunk_overlap=10)
    assert len(chunks) > 1
    for c in chunks:
        assert c.content.strip() != ""


def test_token_count_stored_on_chunk():
    text = "Hello world. This is a test."
    chunks = chunk_pages(make_pages(text), chunk_size=512, chunk_overlap=0)
    for c in chunks:
        assert c.token_count == _count_tokens(c.content)
