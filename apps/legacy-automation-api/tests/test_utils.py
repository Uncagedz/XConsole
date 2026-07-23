import json

from service.utils import best_matches, fuzzy_score


def test_fuzzy_score_exact():
    assert fuzzy_score("Title", "Title") == 1.0


def test_best_matches_returns_sorted_results():
    candidates = ["Vehicle Price", "Listing Title", "VIN", "Mileage"]
    results = best_matches("price", candidates, limit=2)
    assert results[0][0] == "Vehicle Price"
    assert results[0][1] >= results[1][1]


def test_best_matches_serializable():
    candidates = ["Alpha", "Beta"]
    results = best_matches("alpha", candidates)
    json.dumps(results)
