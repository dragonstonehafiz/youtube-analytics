"""Comment-related API endpoints."""

from __future__ import annotations

from collections import Counter
import html
import io
import re

from fastapi import APIRouter, Query, Response
from PIL import Image, ImageDraw
from wordcloud import WordCloud

from src.database.db import get_connection, row_to_dict

router = APIRouter()

_WORD_RE = re.compile(r"[A-Za-z0-9']+")
_TAG_RE = re.compile(r"<[^>]+>")
_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "been",
    "but",
    "by",
    "for",
    "from",
    "had",
    "has",
    "have",
    "he",
    "her",
    "his",
    "i",
    "if",
    "in",
    "into",
    "is",
    "it",
    "its",
    "just",
    "me",
    "my",
    "not",
    "of",
    "on",
    "or",
    "our",
    "out",
    "so",
    "that",
    "the",
    "their",
    "them",
    "there",
    "they",
    "this",
    "to",
    "was",
    "we",
    "were",
    "what",
    "when",
    "where",
    "which",
    "who",
    "will",
    "with",
    "you",
    "your",
    "can",
    "cant",
    "don't",
    "dont",
    "im",
    "ive",
    "id",
    "you're",
    "youre",
    "it's",
    "its",
}
_WORD_TYPE_ALL = {"noun", "verb", "proper_noun", "adjective", "adverb"}
_COMMON_VERBS = {
    "be",
    "been",
    "being",
    "am",
    "is",
    "are",
    "was",
    "were",
    "do",
    "does",
    "did",
    "done",
    "have",
    "has",
    "had",
    "go",
    "goes",
    "went",
    "gone",
    "make",
    "makes",
    "made",
    "get",
    "gets",
    "got",
    "say",
    "says",
    "said",
    "play",
    "plays",
    "played",
    "talk",
    "talks",
    "talked",
    "watch",
    "watched",
    "love",
    "loved",
    "like",
    "liked",
}


def _parse_word_types(word_types: str | None) -> set[str]:
    """Parse optional CSV word-type filter."""
    if not word_types:
        return set(_WORD_TYPE_ALL)
    parsed = {part.strip().lower() for part in word_types.split(",") if part.strip()}
    allowed = parsed & _WORD_TYPE_ALL
    return allowed


def _classify_word_type(raw_token: str, normalized: str) -> set[str]:
    """Classify a token into one or more broad word-type buckets."""
    kinds: set[str] = set()
    is_proper_noun = raw_token[:1].isupper()
    if is_proper_noun:
        kinds.add("proper_noun")
        kinds.add("noun")
    if (
        normalized in _COMMON_VERBS
        or normalized.endswith("ing")
        or normalized.endswith("ed")
        or normalized.endswith("ize")
        or normalized.endswith("ise")
        or normalized.endswith("ify")
    ):
        kinds.add("verb")
    if normalized.endswith("ly"):
        kinds.add("adverb")
    if (
        normalized.endswith("ous")
        or normalized.endswith("ful")
        or normalized.endswith("able")
        or normalized.endswith("ible")
        or normalized.endswith("ive")
        or normalized.endswith("less")
        or normalized.endswith("ic")
        or normalized.endswith("al")
    ):
        kinds.add("adjective")
    if not kinds:
        kinds.add("noun")
    return kinds


def _build_comments_where(
    video_id: str | None = None,
    playlist_id: str | None = None,
    author_channel_id: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    q: str | None = None,
) -> tuple[str, list[object]]:
    """Build shared comments WHERE SQL and parameters."""
    where_clauses = []
    params: list[object] = []
    if video_id:
        where_clauses.append("c.video_id = ?")
        params.append(video_id)
    if playlist_id:
        where_clauses.append(
            """
            EXISTS (
                SELECT 1
                FROM playlist_items pi
                WHERE pi.playlist_id = ? AND pi.video_id = c.video_id
            )
            """
        )
        params.append(playlist_id)
    if author_channel_id:
        where_clauses.append("c.author_channel_id = ?")
        params.append(author_channel_id)
    if published_after:
        where_clauses.append("date(c.published_at) >= ?")
        params.append(published_after)
    if published_before:
        where_clauses.append("date(c.published_at) <= ?")
        params.append(published_before)
    if q:
        where_clauses.append("LOWER(COALESCE(c.text_display, '')) LIKE ?")
        params.append(f"%{q.lower()}%")
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    return where_sql, params


def _load_filtered_comment_texts(
    video_id: str | None = None,
    playlist_id: str | None = None,
    author_channel_id: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    q: str | None = None,
) -> tuple[list[str], int]:
    """Load comment text_display rows matching filters."""
    where_sql, params = _build_comments_where(
        video_id=video_id,
        playlist_id=playlist_id,
        author_channel_id=author_channel_id,
        published_after=published_after,
        published_before=published_before,
        q=q,
    )
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT c.text_display
            FROM comments c
            {where_sql}
            """,
            tuple(params),
        ).fetchall()
    texts = [str(row["text_display"] or "") for row in rows]
    return texts, len(rows)


def _build_word_counts(texts: list[str], include_word_types: set[str] | None = None) -> Counter[str]:
    """Build token counts from comment texts with optional word-type filtering."""
    counts: Counter[str] = Counter()
    allowed_types = include_word_types if include_word_types is not None else set(_WORD_TYPE_ALL)
    if not allowed_types:
        return counts
    for text in texts:
        plain = html.unescape(_TAG_RE.sub(" ", text))
        for token in _WORD_RE.findall(plain):
            normalized = token.strip("'").lower()
            if len(normalized) < 3 or normalized.isdigit() or normalized in _STOP_WORDS:
                continue
            token_types = _classify_word_type(token, normalized)
            if token_types.isdisjoint(allowed_types):
                continue
            counts[normalized] += 1
    return counts


@router.get("/comments")
def list_comments(
    q: str | None = None,
    video_id: str | None = None,
    playlist_id: str | None = None,
    author_channel_id: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="published_at"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return comments with optional text/date/video/playlist/author filters and pagination."""
    where_sql, params = _build_comments_where(
        q=q,
        video_id=video_id,
        playlist_id=playlist_id,
        author_channel_id=author_channel_id,
        published_after=published_after,
        published_before=published_before,
    )
    sort_map = {
        "published_at": "c.published_at",
        "likes": "COALESCE(c.like_count, 0)",
        "reply_count": "COALESCE(c.reply_count, 0)",
    }
    sort_column = sort_map.get(sort_by, "published_at")
    sort_dir = "ASC" if direction.lower() == "asc" else "DESC"
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT c.*, v.title AS video_title, v.thumbnail_url AS video_thumbnail_url
            FROM comments c
            LEFT JOIN videos v ON v.id = c.video_id
            {where_sql}
            ORDER BY {sort_column} {sort_dir}, c.id DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*) AS total FROM comments c {where_sql}",
            tuple(params),
        ).fetchone()
    items = [row_to_dict(row) for row in rows]
    total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": items, "total": total}


@router.get("/comments/word-cloud/image")
def render_comments_word_cloud_image(
    q: str | None = None,
    video_id: str | None = None,
    playlist_id: str | None = None,
    author_channel_id: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    width: int = Query(default=1080, ge=480, le=2400),
    height: int = Query(default=560, ge=240, le=1200),
    max_words: int = Query(default=120, ge=1, le=300),
    min_count: int = Query(default=2, ge=1, le=50),
    word_types: str | None = None,
) -> Response:
    """Render a word-cloud PNG from all comments matching active filters."""
    texts, _ = _load_filtered_comment_texts(
        q=q,
        video_id=video_id,
        playlist_id=playlist_id,
        author_channel_id=author_channel_id,
        published_after=published_after,
        published_before=published_before,
    )
    counts = _build_word_counts(texts, include_word_types=_parse_word_types(word_types))
    top_counts: dict[str, int] = {}
    for word, count in counts.most_common():
        if count < min_count:
            continue
        top_counts[word] = count
        if len(top_counts) >= max_words:
            break

    if not top_counts:
        image = Image.new("RGB", (width, height), "#ffffff")
        draw = ImageDraw.Draw(image)
        draw.text((24, height // 2 - 8), "No terms available for current filtered comments.", fill="#64748b")
    else:
        cloud = WordCloud(
            width=width,
            height=height,
            max_words=max_words,
            stopwords=_STOP_WORDS,
            background_color="white",
            prefer_horizontal=0.9,
            collocations=False,
            margin=4,
            random_state=42,
            min_font_size=12,
        )
        cloud.generate_from_frequencies(top_counts)
        image = cloud.to_image()

    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return Response(content=buffer.getvalue(), media_type="image/png")
