from app import api


def test_vehicle_is_posting_eligible_when_ready_with_photos():
    vehicle = {
        "status_label": "Ready",
        "photos": ["https://example.com/photo.jpg"],
    }
    assert api._eligible_for_posting(vehicle) is True


def test_vehicle_is_not_posting_eligible_without_photos():
    vehicle = {
        "status_label": "Ready",
        "photos": [],
    }
    assert api._eligible_for_posting(vehicle) is False


def test_vehicle_is_not_posting_eligible_when_status_isnt_ready():
    vehicle = {
        "status_label": "Sold",
        "photos": ["https://example.com/photo.jpg"],
    }
    assert api._eligible_for_posting(vehicle) is False
