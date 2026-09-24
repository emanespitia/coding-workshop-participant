"""Unit tests for duplicate matching (no database)."""

from types import SimpleNamespace

from app.incidents.duplicates import similarity, title_words


def test_title_words_ignore_case_punctuation_and_filler():
    assert title_words("The AC is NOT working!") == {"ac"}
    assert title_words("Wi-Fi drops on Floor 2") == {"wi", "fi", "drops", "floor"}


def _incident(title, floor_id=None, seat_id=None):
    return SimpleNamespace(title=title, floor_id=floor_id, seat_id=seat_id)


def test_similarity_scores_floor_seat_and_shared_words():
    words = title_words("AC not cooling")
    assert similarity(_incident("AC not cooling", floor_id=1, seat_id=9), words, 1, 9) == 4 + 2 + 2
    assert similarity(_incident("Too warm", floor_id=1), words, 1, None) == 4
    assert similarity(_incident("AC broken"), words, 1, None) == 1          # floor unknown: kept
    assert similarity(_incident("Too warm", floor_id=2), words, 1, None) is None  # other floor, nothing shared
    assert similarity(_incident("AC broken", floor_id=2), words, 1, None) == 1    # other floor, shared word
