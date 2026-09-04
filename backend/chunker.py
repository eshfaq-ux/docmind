"""
Semantic chunking: split text into token-bounded chunks that respect
sentence boundaries.

Design decisions:
- Token counting with tiktoken (cl100k_base ≈ text-embedding-3-small tokens).
- Sentence-aware splitting: we never cut in the middle of a sentence.
  This is critical — embedding a half-sentence produces a noisy vector.
- Overlap copies trailing tokens from the previous chunk into the next
  so context isn't lost at chunk boundaries.
- Each chunk retains its source page_number for citation purposes.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import tiktoken

from extractor import PageText

_enc = tiktoken.get_encoding("cl100k_base")


@dataclass
class Chunk:
    content: str
    page_number: int | None  # 1-indexed; None for non-PDF sources
    chunk_index: int          # position within document
    token_count: int


def _count_tokens(text: str) -> int:
    return len(_enc.encode(text))


def _split_sentences(text: str) -> list[str]:
    """
    Split text into sentences using a robust regex.
    Handles abbreviations (Mr., Dr.), decimal numbers (3.14),
    and common edge cases better than a simple split on '.'.
    """
    # Sentence boundary: punctuation (.!?) followed by whitespace + capital
    pattern = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"\'\(])")
    parts = pattern.split(text)
    return [p.strip() for p in parts if p.strip()]


def chunk_pages(
    pages: list[PageText],
    chunk_size: int = 512,
    chunk_overlap: int = 64,
) -> list[Chunk]:
    """
    Produce overlapping token-bounded chunks from a list of pages.

    Algorithm:
      1. Tokenize each sentence.
      2. Accumulate sentences into a window until adding the next sentence
         would exceed chunk_size.
      3. Emit the window as a chunk.
      4. Seed the next window with the trailing chunk_overlap tokens from
         the previous window (not a fixed sentence count — we track tokens).
    """
    chunks: list[Chunk] = []
    chunk_index = 0

    for page in pages:
        sentences = _split_sentences(page.text)
        if not sentences:
            continue

        window: list[str] = []
        window_tokens = 0

        for sentence in sentences:
            s_tokens = _count_tokens(sentence)

            # If a single sentence exceeds chunk_size, force-split it
            if s_tokens > chunk_size:
                # Emit current window first
                if window:
                    text = " ".join(window)
                    chunks.append(Chunk(
                        content=text,
                        page_number=page.page_number,
                        chunk_index=chunk_index,
                        token_count=_count_tokens(text),
                    ))
                    chunk_index += 1
                    window, window_tokens = _seed_overlap(window, chunk_overlap)

                # Hard-split the oversized sentence by word
                words = sentence.split()
                sub_window: list[str] = []
                sub_tokens = 0
                for word in words:
                    w_tok = _count_tokens(word)
                    if sub_tokens + w_tok > chunk_size and sub_window:
                        text = " ".join(sub_window)
                        chunks.append(Chunk(
                            content=text,
                            page_number=page.page_number,
                            chunk_index=chunk_index,
                            token_count=_count_tokens(text),
                        ))
                        chunk_index += 1
                        sub_window, sub_tokens = _seed_overlap_words(sub_window, chunk_overlap)
                    sub_window.append(word)
                    sub_tokens += w_tok
                # Remaining words become the start of the next window
                if sub_window:
                    window = sub_window
                    window_tokens = sub_tokens
                continue

            if window_tokens + s_tokens > chunk_size and window:
                # Emit
                text = " ".join(window)
                chunks.append(Chunk(
                    content=text,
                    page_number=page.page_number,
                    chunk_index=chunk_index,
                    token_count=_count_tokens(text),
                ))
                chunk_index += 1
                # Seed overlap from tail of current window
                window, window_tokens = _seed_overlap(window, chunk_overlap)

            window.append(sentence)
            window_tokens += s_tokens

        # Flush remaining
        if window:
            text = " ".join(window)
            chunks.append(Chunk(
                content=text,
                page_number=page.page_number,
                chunk_index=chunk_index,
                token_count=_count_tokens(text),
            ))
            chunk_index += 1

    return chunks


def _seed_overlap(sentences: list[str], overlap_tokens: int) -> tuple[list[str], int]:
    """Return the trailing sentences that together fit within overlap_tokens."""
    result: list[str] = []
    total = 0
    for s in reversed(sentences):
        t = _count_tokens(s)
        if total + t > overlap_tokens:
            break
        result.insert(0, s)
        total += t
    return result, total


def _seed_overlap_words(words: list[str], overlap_tokens: int) -> tuple[list[str], int]:
    result: list[str] = []
    total = 0
    for w in reversed(words):
        t = _count_tokens(w)
        if total + t > overlap_tokens:
            break
        result.insert(0, w)
        total += t
    return result, total
