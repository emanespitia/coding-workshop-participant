"""
Finding incidents that may describe the same problem.

"Similar" means: still active (Open, In Progress, Blocked), reported in the last 30 days, in
the same building and category. Matches are ranked by same floor, same seat and shared words
in the title. Incidents on a different floor only count if their title shares a word.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.constants import ACTIVE_STATUSES
from app.incidents.models import Incident

SIMILAR_WINDOW_DAYS = 30
MAX_SIMILAR = 5
_MAX_CANDIDATES = 200

# Words too common to say two titles are about the same thing.
_STOPWORDS = frozenset(
    "a an and are at by for from has in is it its my no not of on or our the this to was with "
    "working broken issue problem".split()
)


def title_words(text: str) -> set[str]:
    """Meaningful lower-case words (2+ characters) in a title."""
    return {w for w in re.findall(r"[a-z0-9]+", text.lower()) if len(w) >= 2 and w not in _STOPWORDS}


def find_similar(session: Session, *, building_id: int, category: str, floor_id: Optional[int] = None,
                 seat_id: Optional[int] = None, title: str = "", exclude_id: Optional[int] = None) -> list[Incident]:
    """Up to MAX_SIMILAR active incidents that may be the same problem, best match first."""
    since = datetime.now(timezone.utc) - timedelta(days=SIMILAR_WINDOW_DAYS)
    conditions = [
        Incident.building_id == building_id,
        Incident.category == category,
        Incident.status.in_(ACTIVE_STATUSES),
        Incident.created_at >= since,
    ]
    if exclude_id is not None:
        conditions.append(Incident.id != exclude_id)
    candidates = session.scalars(
        select(Incident).where(*conditions).order_by(Incident.created_at.desc()).limit(_MAX_CANDIDATES)
    ).unique().all()

    words = title_words(title)
    scored = [(similarity(c, words, floor_id, seat_id), c) for c in candidates]
    ranked = sorted(((score, c) for score, c in scored if score is not None),
                    key=lambda item: (item[0], item[1].created_at), reverse=True)
    return [candidate for _, candidate in ranked[:MAX_SIMILAR]]


def similarity(candidate: Incident, words: set[str], floor_id: Optional[int],
               seat_id: Optional[int]) -> Optional[int]:
    """
    How closely a candidate in the same building and category matches: +4 same floor,
    +2 same seat, +1 per shared title word. None if it's on another floor with no shared word.
    """
    shared = len(words & title_words(candidate.title))
    if floor_id is not None and candidate.floor_id is not None and candidate.floor_id != floor_id and not shared:
        return None
    return (4 if floor_id is not None and candidate.floor_id == floor_id else 0) \
        + (2 if seat_id is not None and candidate.seat_id == seat_id else 0) + shared
