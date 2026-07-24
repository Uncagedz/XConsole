import pytest

from app import api


def test_render_listing_text_has_single_title_line():
    payload = api.FacebookPostRequest(
        vin="2C4RC1L78NR164218",
        title="2023 Demo Vehicle",
        price=25000,
    )
    rendered = api._render_listing_text(payload)
    lines = [line for line in rendered.splitlines() if line.strip()]
    assert lines[0] == "2023 Demo Vehicle"
    assert lines.count("2023 Demo Vehicle") == 1


def test_list_facebook_images_sorted(monkeypatch, tmp_path):
    image_dir = tmp_path / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    (image_dir / "b.jpg").write_text("x", encoding="utf-8")
    (image_dir / "A.jpg").write_text("x", encoding="utf-8")
    (image_dir / ".keep").write_text("", encoding="utf-8")
    (image_dir / "notes.txt").write_text("x", encoding="utf-8")
    monkeypatch.setattr(api, "FML_IMAGES_DIR", image_dir)

    items, total = api._list_facebook_images(limit=50)
    assert total == 2
    assert items == ["A.jpg", "b.jpg"]


def test_stack_readiness_happy_path(monkeypatch, tmp_path):
    admin_index = tmp_path / "admin" / "index.html"
    sales_frontend_index = tmp_path / "sales_frontend" / "index.html"
    sales_backend_entrypoint = tmp_path / "sales_backend" / "index.js"
    admin_index.parent.mkdir(parents=True, exist_ok=True)
    sales_frontend_index.parent.mkdir(parents=True, exist_ok=True)
    sales_backend_entrypoint.parent.mkdir(parents=True, exist_ok=True)
    admin_index.write_text("ok", encoding="utf-8")
    sales_frontend_index.write_text("ok", encoding="utf-8")
    sales_backend_entrypoint.write_text("ok", encoding="utf-8")

    monkeypatch.setattr(api, "ADMIN_BUNDLE_INDEX", admin_index)
    monkeypatch.setattr(api, "SALES_FRONTEND_INDEX", sales_frontend_index)
    monkeypatch.setattr(api, "SALES_BACKEND_ENTRYPOINT", sales_backend_entrypoint)
    monkeypatch.setattr(
        api,
        "_live_requirements_status",
        lambda: {
            "accounts_file_exists": True,
            "images_dir_exists": True,
            "drivers_dir_exists": True,
            "chromedriver_found": True,
            "accounts_with_password": 1,
        },
    )

    payload = api._stack_readiness_status()
    assert payload["ok"] is True
    assert payload["ready_for_live_facebook_posting"] is True
    assert payload["components"]["admin_bundle_exists"] is True
    assert payload["components"]["sales_frontend_bundle_exists"] is True
    assert payload["components"]["sales_backend_entrypoint_exists"] is True


def test_suggest_images_for_vin_prefers_stronger_matches(monkeypatch, tmp_path):
    image_dir = tmp_path / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    vin = "2C4RC1L78NR164218"
    (image_dir / f"{vin}_front.jpg").write_text("x", encoding="utf-8")
    (image_dir / "8NR164218_side.jpg").write_text("x", encoding="utf-8")
    (image_dir / "2C4RC1L7_misc.jpg").write_text("x", encoding="utf-8")
    monkeypatch.setattr(api, "FML_IMAGES_DIR", image_dir)

    items = api._suggest_images_for_vin(vin=vin, limit=10)
    assert items[0] == f"{vin}_front.jpg"
    assert "8NR164218_side.jpg" in items
    assert "2C4RC1L7_misc.jpg" in items


def test_run_live_preflight_includes_errors_and_suggestions(monkeypatch):
    monkeypatch.setattr(
        api,
        "_validate_live_requirements",
        lambda *, account_id, images: ["sample setup error"] if not images else [],
    )
    monkeypatch.setattr(
        api,
        "_suggest_images_for_vin",
        lambda vin, limit=20: ["VIN_1.jpg", "VIN_2.jpg"] if vin else [],
    )
    monkeypatch.setattr(
        api,
        "_live_requirements_status",
        lambda: {"accounts_with_password": 1, "chromedriver_found": True},
    )

    payload = api._run_live_preflight(
        account_id="main",
        images=[],
        vin="2C4RC1L78NR164218",
    )
    assert payload["ok"] is False
    assert payload["errors"] == ["sample setup error"]
    assert payload["suggested_images"] == ["VIN_1.jpg", "VIN_2.jpg"]
    assert payload["warnings"]


def test_bootstrap_facebook_lister_creates_missing_paths(monkeypatch, tmp_path):
    root = tmp_path / "facebook-marketplace-lister"
    images_dir = root / "images"
    drivers_dir = root / "drivers"
    accounts_path = root / "accounts.json"

    monkeypatch.setattr(api, "FML_DIR", root)
    monkeypatch.setattr(api, "FML_IMAGES_DIR", images_dir)
    monkeypatch.setattr(api, "FML_DRIVERS_DIR", drivers_dir)
    monkeypatch.setattr(api, "FML_ACCOUNTS_PATH", accounts_path)

    payload = api._bootstrap_facebook_lister(create_template_account_if_missing=True)
    assert payload["ok"] is True
    assert root.exists()
    assert images_dir.exists()
    assert drivers_dir.exists()
    assert (root / "jobs").exists()
    assert accounts_path.exists()
    assert (images_dir / ".keep").exists()
    assert (drivers_dir / ".keep").exists()

    accounts_json = api._safe_read_json(accounts_path, {})
    assert isinstance(accounts_json, dict)
    assert accounts_json.get("accounts")


def test_chromedriver_details_handles_missing_binary():
    payload = api._chromedriver_details(None)
    assert payload["found"] is False
    assert payload["path"] is None


def test_collect_vehicle_photo_urls_dedupes_and_filters(monkeypatch):
    monkeypatch.setattr(
        api,
        "_load_inventory_candidates",
        lambda: [
            {
                "vin": "2C4RC1L78NR164218",
                "photos": [
                    "https://example.com/a.jpg",
                    {"url": "https://example.com/b.png"},
                    {"src": "https://example.com/a.jpg"},
                    "not-a-url",
                ],
            }
        ],
    )
    urls = api._collect_vehicle_photo_urls("2C4RC1L78NR164218")
    assert urls == ["https://example.com/a.jpg", "https://example.com/b.png"]


def test_collect_vehicle_photo_urls_uses_cached_assets_first(monkeypatch, tmp_path):
    monkeypatch.setattr(api, "VEHICLE_ASSETS_CACHE_DIR", tmp_path / "vehicle_assets")
    cache_path = api._vehicle_assets_cache_path("2C4RC1L78NR164218")
    cache_path.write_text(
        (
            "{\n"
            '  "vin": "2C4RC1L78NR164218",\n'
            '  "photos": ["https://example.com/full-a.jpg", "https://example.com/full-b.jpg"]\n'
            "}\n"
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(
        api,
        "_load_inventory_candidates",
        lambda: [{"vin": "2C4RC1L78NR164218", "photos": ["https://example.com/thumb.jpg"]}],
    )
    urls = api._collect_vehicle_photo_urls("2C4RC1L78NR164218")
    assert urls == ["https://example.com/full-a.jpg", "https://example.com/full-b.jpg"]


def test_extract_vehicle_photos_prefers_complete_syndicated_account_gallery():
    html = """
    <script>accountId=tavernacdjrfllccllc</script>
    <img src="https://pictures.dealer.com/t/tavernacdjrfllccllc/1234/dealer-logo.png">
    <script>
    {"images":[
      "https://pictures.dealer.com/t/tavernainfinmiami/0001/frontx.jpg?impolicy=resize&w=1024",
      "https://pictures.dealer.com/t/tavernainfinmiami/0002/sidex.jpg?impolicy=resize&w=1024",
      "https://pictures.dealer.com/t/tavernainfinmiami/0003/rearx.jpg?impolicy=resize&w=1024",
      "https://pictures.dealer.com/t/tavernainfinmiami/0001/thumb_frontx.jpg"
    ]}
    </script>
    <button>1 of 3 Photos</button>
    """
    urls = api._extract_vehicle_photo_urls_from_html(html)
    assert urls == [
        "https://pictures.dealer.com/t/tavernainfinmiami/0001/frontx.jpg",
        "https://pictures.dealer.com/t/tavernainfinmiami/0002/sidex.jpg",
        "https://pictures.dealer.com/t/tavernainfinmiami/0003/rearx.jpg",
    ]
    assert api._expected_vehicle_photo_count_from_html(html) == 3


def test_image_extension_from_url_and_content_type():
    assert api._image_extension_from_url_and_content_type(
        "https://example.com/photo.jpeg",
        "image/jpeg",
    ) == ".jpg"
    assert api._image_extension_from_url_and_content_type(
        "https://example.com/no-ext",
        "image/png",
    ) == ".png"


def test_import_vehicle_images_raises_when_no_sources(monkeypatch):
    monkeypatch.setattr(api, "_collect_vehicle_photo_urls", lambda vin: [])
    with pytest.raises(api.HTTPException) as exc:
        api._import_vehicle_images(vin="2C4RC1L78NR164218", limit=10, overwrite=False)
    assert exc.value.status_code == 404


def test_import_vehicle_images_writes_and_skips_existing(monkeypatch, tmp_path):
    image_dir = tmp_path / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(api, "FML_IMAGES_DIR", image_dir)
    monkeypatch.setattr(
        api,
        "_collect_vehicle_photo_urls",
        lambda vin: [
            "https://example.com/front.jpg",
            "https://example.com/side",
        ],
    )

    class FakeResponse:
        def __init__(self, url: str):
            self.status_code = 200
            self.headers = {
                "content-type": "image/jpeg" if url.endswith(".jpg") else "image/png"
            }
            self.content = b"image-bytes"

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url: str):
            return FakeResponse(url)

    monkeypatch.setattr(api.httpx, "Client", FakeClient)

    first = api._import_vehicle_images(vin="2C4RC1L78NR164218", limit=20, overwrite=False)
    assert first["imported_count"] == 2
    assert (image_dir / "2C4RC1L78NR164218_01.jpg").exists()
    assert (image_dir / "2C4RC1L78NR164218_02.png").exists()

    second = api._import_vehicle_images(vin="2C4RC1L78NR164218", limit=20, overwrite=False)
    assert second["imported_count"] == 0
    assert second["skipped_existing_count"] == 2


def test_resolve_default_account_id_prefers_with_password(monkeypatch):
    monkeypatch.setattr(
        api,
        "_load_accounts_full",
        lambda: [
            {"id": "no-pass", "password": ""},
            {"id": "with-pass", "password": "secret"},
        ],
    )
    assert api._resolve_default_account_id() == "with-pass"


def test_prepare_live_post_aggregates_flow(monkeypatch):
    monkeypatch.setattr(api, "_resolve_default_account_id", lambda: "auto-account")
    monkeypatch.setattr(
        api,
        "_import_vehicle_images",
        lambda *, vin, limit, overwrite: {"ok": True, "imported_count": 2},
    )
    monkeypatch.setattr(api, "_suggest_images_for_vin", lambda vin, limit=20: ["VIN_01.jpg"])
    monkeypatch.setattr(
        api,
        "_run_live_preflight",
        lambda *, account_id, images, vin=None: {
            "ok": True,
            "account_id": account_id,
            "images_count": len(images),
            "vin": vin,
            "errors": [],
            "warnings": [],
            "suggested_images": images,
        },
    )
    monkeypatch.setattr(
        api,
        "_live_requirements_status",
        lambda: {"chromedriver_found": True, "accounts_with_password": 1},
    )

    payload = api._prepare_live_post(
        vin="2C4RC1L78NR164218",
        account_id=None,
        import_missing_images=True,
        image_limit=20,
        overwrite_images=False,
    )
    assert payload["ok"] is True
    assert payload["account_id"] == "auto-account"
    assert payload["selected_images"] == ["VIN_01.jpg"]
    assert payload["import_result"]["ok"] is True
    assert payload["import_error"] is None


def test_prepare_live_post_handles_import_error(monkeypatch):
    monkeypatch.setattr(api, "_resolve_default_account_id", lambda: "auto-account")

    def _raise_import(*, vin, limit, overwrite):
        raise api.HTTPException(status_code=404, detail={"message": "no photos"})

    monkeypatch.setattr(api, "_import_vehicle_images", _raise_import)
    monkeypatch.setattr(api, "_suggest_images_for_vin", lambda vin, limit=20: [])
    monkeypatch.setattr(
        api,
        "_run_live_preflight",
        lambda *, account_id, images, vin=None: {
            "ok": False,
            "account_id": account_id,
            "images_count": len(images),
            "vin": vin,
            "errors": ["images list is required"],
            "warnings": [],
            "suggested_images": [],
        },
    )
    monkeypatch.setattr(
        api,
        "_live_requirements_status",
        lambda: {"chromedriver_found": False, "accounts_with_password": 1},
    )

    payload = api._prepare_live_post(
        vin="2C4RC1L78NR164218",
        account_id=None,
        import_missing_images=True,
        image_limit=20,
        overwrite_images=False,
    )
    assert payload["ok"] is False
    assert payload["import_result"] is None
    assert payload["import_error"] == {"message": "no photos"}
    assert payload["guidance"]


def test_seed_placeholder_images_for_vin(monkeypatch, tmp_path):
    image_dir = tmp_path / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(api, "FML_IMAGES_DIR", image_dir)

    payload = api._seed_placeholder_images_for_vin(vin="2C4RC1L78NR164218", count=3)
    assert payload["ok"] is True
    assert payload["created_count"] == 3
    assert (image_dir / "2C4RC1L78NR164218_01.png").exists()
    assert (image_dir / "2C4RC1L78NR164218_02.png").exists()
    assert (image_dir / "2C4RC1L78NR164218_03.png").exists()


def test_relink_images_to_vin_copies_files(monkeypatch, tmp_path):
    image_dir = tmp_path / "images"
    image_dir.mkdir(parents=True, exist_ok=True)
    (image_dir / "front.jpg").write_bytes(b"a")
    (image_dir / "side.png").write_bytes(b"b")
    monkeypatch.setattr(api, "FML_IMAGES_DIR", image_dir)

    payload = api._relink_images_to_vin(
        vin="2C4RC1L78NR164218",
        images=["front.jpg", "side.png"],
        include_vin_matches=False,
        overwrite=False,
        delete_source=False,
    )
    assert payload["ok"] is True
    assert payload["linked_count"] == 2
    assert (image_dir / "2C4RC1L78NR164218_01.jpg").exists()
    assert (image_dir / "2C4RC1L78NR164218_02.png").exists()
    assert (image_dir / "front.jpg").exists()


def test_full_repair_and_relink_runs_end_to_end(monkeypatch):
    monkeypatch.setattr(api, "_resolve_repair_vin", lambda vin: "2C4RC1L78NR164218")
    monkeypatch.setattr(
        api,
        "_bootstrap_facebook_lister",
        lambda create_template_account_if_missing=True: {"ok": True},
    )
    monkeypatch.setattr(api, "_suggest_images_for_vin", lambda vin, limit=1: [])
    monkeypatch.setattr(
        api,
        "_seed_placeholder_images_for_vin",
        lambda *, vin, count, overwrite=False: {"ok": True, "created_count": count},
    )
    monkeypatch.setattr(api, "_list_facebook_images", lambda limit=2000: (["front.jpg"], 1))
    monkeypatch.setattr(
        api,
        "_relink_images_to_vin",
        lambda *, vin, images, include_vin_matches, overwrite, delete_source: {
            "ok": True,
            "linked_count": 1,
        },
    )
    monkeypatch.setattr(
        api,
        "_prepare_live_post",
        lambda **kwargs: {"ok": True, "vin": "2C4RC1L78NR164218"},
    )
    monkeypatch.setattr(
        api,
        "_stack_readiness_status",
        lambda: {"ready_for_live_facebook_posting": True},
    )

    payload = api._full_repair_and_relink(
        vin="2C4RC1L78NR164218",
        ensure_placeholder_images=True,
        placeholder_count=6,
    )
    assert payload["ok"] is True
    assert payload["vin"] == "2C4RC1L78NR164218"


def test_normalize_image_names_dedupes_and_trims():
    payload = api._normalize_image_names([" a.jpg ", "A.jpg", "", "b.png"])
    assert payload == ["a.jpg", "b.png"]


def test_wire_everything_aggregates_components(monkeypatch):
    monkeypatch.setattr(api, "_resolve_repair_vin", lambda vin: "2C4RC1L78NR164218")
    monkeypatch.setattr(
        api,
        "_full_repair_and_relink",
        lambda **kwargs: {
            "ok": True,
            "prepared": {
                "ok": True,
                "account_id": "acct-1",
                "selected_images": ["2C4RC1L78NR164218_01.png"],
            },
        },
    )
    monkeypatch.setattr(api, "_sales_assistant_health_status", lambda: {"ok": True})
    monkeypatch.setattr(
        api,
        "_sales_backend_request",
        lambda method, path, json_payload=None: (200, {"ok": True}),
    )
    monkeypatch.setattr(
        api,
        "_stack_readiness_status",
        lambda: {"ready_for_live_facebook_posting": True},
    )

    payload = api._wire_everything(
        vin="2C4RC1L78NR164218",
        ensure_placeholder_images=True,
        placeholder_count=6,
        reload_sales_data=True,
    )
    assert payload["ok"] is True
    assert payload["prepared_account_id"] == "acct-1"
    assert payload["prepared_images_count"] == 1
    assert payload["sales_reload"]["performed"] is True


def test_normalize_inventory_blob_handles_nested_vehicles():
    payload = {
        "vehicles": [
            {
                "vin": "WP0AB2A99KS123456",
                "year": "2024",
                "make": "Porsche",
                "model": "911",
                "price": "$139,991",
                "images": [{"url": "https://dealer.example/images/1.jpg"}],
                "url": "/new/vehicle/WP0AB2A99KS123456",
            }
        ]
    }
    items = api._normalize_inventory_blob(payload, source_url="https://dealer.example")
    assert len(items) == 1
    assert items[0]["vin"] == "WP0AB2A99KS123456"
    assert items[0]["title"] == "2024 Porsche 911"
    assert items[0]["detail_url"] == "https://dealer.example/new/vehicle/WP0AB2A99KS123456"
    assert items[0]["photos"] == ["https://dealer.example/images/1.jpg"]


def test_extract_inventory_dicts_from_html_reads_next_data_script():
    html = """
    <html>
      <body>
        <script id="__NEXT_DATA__" type="application/json">
          {"props":{"pageProps":{"inventory":{"vehicles":[{"vin":"WP0AA2A90LS654321","year":"2023","make":"Porsche","model":"Cayenne","price":"$89,500"}]}}}}
        </script>
      </body>
    </html>
    """
    records, notes = api._extract_inventory_dicts_from_html(html)
    assert any(item.get("vin") == "WP0AA2A90LS654321" for item in records)
    assert any(str(note).startswith("script_payloads=") for note in notes)


def test_proxy_markdown_url_for_source():
    assert (
        api._proxy_markdown_url_for_source("https://dealer.example/used-inventory/index.htm")
        == "https://r.jina.ai/http://dealer.example/used-inventory/index.htm"
    )


def test_extract_inventory_dicts_from_markdown_proxy_parses_listing():
    markdown = """
    [![Image 1](https://pictures.example.com/a.jpg)](http://dealer.example/used/Chrysler/2026-Chrysler-Pacifica-abc123.htm)
    [2026 Chrysler Pacifica Select](http://dealer.example/used/Chrysler/2026-Chrysler-Pacifica-abc123.htm)$34,417
    Price$34,417 Hide Pricing 9,385 miles
    """
    records, notes = api._extract_inventory_dicts_from_markdown_proxy(
        markdown,
        source_url="https://dealer.example/used-inventory/index.htm",
    )

    assert len(records) == 1
    row = records[0]
    assert row["title"] == "2026 Chrysler Pacifica Select"
    assert row["price"] == 34417
    assert row["mileage"] == 9385
    assert row["detail_url"] == "https://dealer.example/used/Chrysler/2026-Chrysler-Pacifica-abc123.htm"
    assert row["photos"] == ["https://pictures.example.com/a.jpg"]
    assert isinstance(row["vin"], str) and len(row["vin"]) == 17
    assert any(str(note).startswith("proxy_candidate_records=") for note in notes)


def test_extract_detail_facts_from_markdown_proxy_parses_vehicle_fields():
    markdown = """
    ## Used 2026 Chrysler Pacifica Select

    Exterior Color Bright White Clearcoat Interior Color Black Odometer 9,385 miles Transmission 9-Speed 948TE Automatic

    Drivetrain FWD Engine 3.6L V6 24V VVT VIN 2C4RC1BG9TR191376 Stock Number CV191376

    ### Highlighted Features
    *   Lane departure
    *   Wireless phone connectivity
    *   Heated front seats
    """
    facts = api._extract_detail_facts_from_markdown_proxy(markdown)
    assert facts["title"] == "2026 Chrysler Pacifica Select"
    assert facts["vin"] == "2C4RC1BG9TR191376"
    assert facts["stock_number"] == "CV191376"
    assert facts["mileage"] == 9385
    assert facts["drivetrain"] == "FWD"
    assert facts["engine"] == "3.6L V6 24V VVT"
    assert facts["transmission"] == "9-Speed 948TE Automatic"
    assert facts["exterior"] == "Bright White Clearcoat"
    assert facts["interior"] == "Black"
    assert facts["highlights"] == [
        "Lane departure",
        "Wireless phone connectivity",
        "Heated front seats",
    ]


def test_extract_standard_specs_from_html_summarizes_capability():
    html_text = """
    <ul>
      <li class="spec-item"><span class="spec-item-description">3rd row seats: </span><span class="spec-item-detail">split-bench</span></li>
      <li class="spec-item"><span class="spec-item-description">Curb weight: </span><span class="spec-item-detail">2,480kg (5,467lbs)</span></li>
      <li class="spec-item"><span class="spec-item-description">Maximum towing capacity: </span><span class="spec-item-detail">7,700lbs</span></li>
      <li class="spec-item"><span class="spec-item-description">Horsepower: </span><span class="spec-item-detail">362hp @ 5,500RPM</span></li>
      <li class="spec-item"><span class="spec-item-description">Torque: </span><span class="spec-item-detail">369 lb.-ft. @ 1,600RPM</span></li>
      <li class="spec-item"><span class="spec-item-description">GVWR: </span><span class="spec-item-detail">3,300kg (7,275lbs)</span></li>
      <li class="spec-item"><span class="spec-item-description">Interior maximum rear cargo volume: </span><span class="spec-item-detail">2,398 L (85 cu.ft.)</span></li>
    </ul>
    """
    assert api._extract_standard_specs_from_html(html_text) == {
        "third_row_seats": "split-bench",
        "curb_weight": "2,480kg (5,467lbs)",
        "max_towing_capacity": "7,700lbs",
        "horsepower": "362hp @ 5,500RPM",
        "torque": "369 lb.-ft. @ 1,600RPM",
        "gvwr": "3,300kg (7,275lbs)",
        "max_cargo_volume": "2,398 L (85 cu.ft.)",
    }


def test_merge_cached_vehicle_assets_prefers_cached_photos(monkeypatch, tmp_path):
    monkeypatch.setattr(api, "VEHICLE_ASSETS_CACHE_DIR", tmp_path / "vehicle_assets")
    cache_path = api._vehicle_assets_cache_path("2C4RC1BG9TR191376")
    cache_path.write_text(
        (
            "{\n"
            '  "vin": "2C4RC1BG9TR191376",\n'
            '  "photos": ["https://example.com/full-1.jpg", "https://example.com/full-2.jpg"],\n'
            '  "sticker_url": "https://example.com/sticker",\n'
            '  "carfax_url": "https://example.com/carfax",\n'
            '  "quick_specs": {"mileage": 74629, "stock_number": "NV946662"}\n'
            "}\n"
        ),
        encoding="utf-8",
    )

    items = api._merge_cached_vehicle_assets(
        [
            {
                "vin": "2C4RC1BG9TR191376",
                "title": "Vehicle",
                "mileage": 74,
                "photos": ["https://example.com/thumb.jpg"],
            }
        ]
    )
    assert items[0]["photos"] == ["https://example.com/full-1.jpg", "https://example.com/full-2.jpg"]
    assert items[0]["sticker_url"] == "https://example.com/sticker"
    assert items[0]["carfax_url"] == "https://example.com/carfax"
    assert items[0]["mileage"] == 74629
    assert items[0]["stock_number"] == "NV946662"


def test_load_inventory_candidates_prefers_live_cache(monkeypatch, tmp_path):
    live_path = tmp_path / "inventory_live.json"
    snapshot_path = tmp_path / "inventory_snapshot.json"
    manual_path = tmp_path / "inventory_manual.json"
    manual_path.write_text('{"items":[]}', encoding="utf-8")

    live_path.write_text(
        '[{"vin":"WP0AA2A90LS654321","title":"Live Vehicle","price":"$1"}]',
        encoding="utf-8",
    )
    snapshot_path.write_text(
        '[{"vin":"WP0AB2A99KS123456","title":"Snapshot Vehicle","price":"$2"}]',
        encoding="utf-8",
    )

    monkeypatch.setattr(api, "INVENTORY_LIVE_CACHE_PATH", live_path)
    monkeypatch.setattr(api, "INVENTORY_SNAPSHOT_PATH", snapshot_path)
    monkeypatch.setattr(api, "INVENTORY_LIVE_META_PATH", tmp_path / "meta.json")
    monkeypatch.setattr(api, "INVENTORY_MANUAL_PATH", manual_path)

    items = api._load_inventory_candidates()
    assert len(items) == 1
    assert items[0]["vin"] == "WP0AA2A90LS654321"


def test_sync_live_inventory_persists_when_items_exist(monkeypatch, tmp_path):
    live_path = tmp_path / "inventory_live.json"
    meta_path = tmp_path / "inventory_meta.json"
    snapshot_path = tmp_path / "inventory_snapshot.json"
    snapshot_path.write_text("[]", encoding="utf-8")

    monkeypatch.setattr(api, "INVENTORY_LIVE_CACHE_PATH", live_path)
    monkeypatch.setattr(api, "INVENTORY_LIVE_META_PATH", meta_path)
    monkeypatch.setattr(
        api,
        "INVENTORY_LIVE_BACKUP_PATH",
        tmp_path / "inventory_live.backup.json",
    )
    monkeypatch.setattr(
        api,
        "INVENTORY_LIVE_META_BACKUP_PATH",
        tmp_path / "inventory_meta.backup.json",
    )
    monkeypatch.setattr(api, "INVENTORY_SNAPSHOT_PATH", snapshot_path)
    monkeypatch.setattr(api, "CARFAX_SUMMARY_DIR", tmp_path / "carfax_summaries")
    monkeypatch.setattr(api, "_default_inventory_source_url", lambda: "https://dealer.example/new")
    monkeypatch.setattr(
        api,
        "_fetch_live_inventory_records",
        lambda *, source_url, timeout_seconds: {
            "source_url": source_url,
            "fetched_at": "2026-03-02T12:00:00+00:00",
            "items_count": 1,
            "items": [
                {
                    "vin": "WP0AA2A90LS654321",
                    "title": "2023 Porsche Cayenne",
                    "price": "$89,500",
                    "photos": [],
                    "status_label": "Ready",
                }
            ],
            "diagnostics": ["ok"],
        },
    )

    payload = api._sync_live_inventory(
        source_url=None,
        timeout_seconds=20,
        persist=True,
    )

    assert payload["ok"] is True
    assert payload["persisted"] is True
    assert live_path.exists()
    assert meta_path.exists()
    stored = api._safe_read_json(live_path, [])
    assert isinstance(stored, list)
    assert stored[0]["vin"] == "WP0AA2A90LS654321"


def test_fetch_live_inventory_records_uses_browser_fallback_when_proxy_returns_no_items(monkeypatch):
    class FakeResponse:
        def __init__(self, status_code: int, text: str = "", content_type: str = "text/html"):
            self.status_code = status_code
            self.text = text
            self.headers = {"content-type": content_type}

        def json(self):
            return {}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb):
            return False

        def get(self, url: str):
            return FakeResponse(403)

    monkeypatch.setattr(api.httpx, "Client", FakeClient)
    monkeypatch.setattr(
        api,
        "_fetch_live_inventory_records_via_proxy_markdown",
        lambda *, source_url, timeout_seconds: {
            "source_url": source_url,
            "fetched_at": "2026-03-26T12:00:00+00:00",
            "items": [],
            "items_count": 0,
            "diagnostics": ["proxy-empty"],
        },
    )
    monkeypatch.setattr(
        api,
        "_fetch_live_inventory_records_via_browser_html",
        lambda *, source_url, timeout_seconds: {
            "source_url": source_url,
            "fetched_at": "2026-03-26T12:00:05+00:00",
            "items": [
                {
                    "vin": "2C4RC1BG9TR191376",
                    "title": "2026 Chrysler Pacifica Select",
                    "price": 34283,
                    "mileage": 9385,
                    "detail_url": "https://dealer.example/used/vehicle.htm",
                    "photos": ["https://example.com/1.jpg"],
                    "status_label": "In Stock",
                }
            ],
            "items_count": 1,
            "diagnostics": ["browser-hit"],
        },
    )

    payload = api._fetch_live_inventory_records(
        source_url="https://dealer.example/used-inventory/index.htm",
        timeout_seconds=30,
    )
    assert payload["items_count"] == 1
    assert payload["items"][0]["vin"] == "2C4RC1BG9TR191376"
    assert "browser-hit" in payload["diagnostics"]


def test_normalize_inventory_records_handles_schema_product_offer_shape():
    records = [
        {
            "@type": ["Car", "Product"],
            "name": "2026 Porsche Taycan 4S Black Edition",
            "vehicleIdentificationNumber": "WP0AB2Y14TSA28516",
            "vehicleTransmission": "Automatic",
            "driveWheelConfiguration": "AWD",
            "vehicleEngine": {"name": "Electric"},
            "mileageFromOdometer": {"value": 0, "unitCode": "SMI"},
            "image": "https://images.example.com/car.jpg",
            "color": "Jet Black Metallic",
            "offers": {
                "@type": "Offer",
                "url": "https://westbroward.porsche.com/en/inventory/porsche/porsche-taycan-4s-black-edition-new-WZ3324",
                "price": 153200,
                "availability": "https://schema.org/InStock",
                "seller": {"name": "Porsche West Broward"},
            },
        }
    ]
    items = api._normalize_inventory_records(records)
    assert len(items) == 1
    assert items[0]["vin"] == "WP0AB2Y14TSA28516"
    assert items[0]["title"] == "2026 Porsche Taycan 4S Black Edition"
    assert items[0]["price"] == 153200
    assert items[0]["detail_url"].startswith("https://westbroward.porsche.com/")
    assert items[0]["photos"] == ["https://images.example.com/car.jpg"]
    assert items[0]["status_label"] == "In Stock"


def test_select_vehicle_photo_urls_default_skip_thumbnail_indexes():
    vehicle = {
        "photos": [
            "https://example.com/0.jpg",
            "https://example.com/1.jpg",
            "https://example.com/2.jpg",
            "https://example.com/3.jpg",
        ]
    }
    selected_urls, selected_indexes, all_urls = api._select_vehicle_photo_urls(
        vehicle=vehicle,
        selected_indexes=[],
        skip_indexes=[0, 2],
        limit=10,
    )
    assert all_urls == [
        "https://example.com/0.jpg",
        "https://example.com/1.jpg",
        "https://example.com/2.jpg",
        "https://example.com/3.jpg",
    ]
    assert selected_indexes == [1, 3]
    assert selected_urls == ["https://example.com/1.jpg", "https://example.com/3.jpg"]


def test_one_click_post_from_inventory_uses_selected_indexes(monkeypatch):
    monkeypatch.setattr(
        api,
        "_find_vehicle_by_vin",
        lambda vin: {
            "vin": "WP0TESTVIN1234567",
            "title": "2026 Test Vehicle",
            "price": 55000,
            "photos": [
                "https://example.com/0.jpg",
                "https://example.com/1.jpg",
                "https://example.com/2.jpg",
                "https://example.com/3.jpg",
            ],
        },
    )
    monkeypatch.setattr(
        api,
        "_import_image_urls_for_vin",
        lambda *, vin, urls, overwrite=False: {
            "imported": ["WP0TESTVIN1234567_FB_01.jpg", "WP0TESTVIN1234567_FB_02.jpg"],
            "skipped_existing": [],
        },
    )
    monkeypatch.setattr(api, "_resolve_default_account_id", lambda: "main")
    monkeypatch.setattr(
        api,
        "_facebook_post_impl",
        lambda request: {
            "ok": True,
            "mode": request.mode,
            "live_success": True,
            "live_detail": "ok",
        },
    )
    monkeypatch.setattr(api, "_mark_vehicle_posted", lambda **kwargs: None)
    monkeypatch.setattr(api, "_append_audit_event", lambda *args, **kwargs: None)

    payload = api._run_one_click_post_from_inventory(
        api.FacebookOneClickPostRequest(vin="WP0TESTVIN1234567", mode="live"),
        queue_live=False,
    )
    assert payload["selected_photo_indexes"] == [1, 3]
    assert payload["images_for_post"] == [
        "WP0TESTVIN1234567_FB_01.jpg",
        "WP0TESTVIN1234567_FB_02.jpg",
    ]
    assert payload["post_result"]["live_success"] is True


def test_one_click_post_from_inventory_fallback_when_skip_removes_all(monkeypatch):
    monkeypatch.setattr(
        api,
        "_find_vehicle_by_vin",
        lambda vin: {
            "vin": "WP0SINGLEPHOTO0001",
            "title": "Single Photo Vehicle",
            "price": 41000,
            "photos": ["https://example.com/only.jpg"],
        },
    )
    monkeypatch.setattr(
        api,
        "_import_image_urls_for_vin",
        lambda *, vin, urls, overwrite=False: {
            "imported": ["WP0SINGLEPHOTO0001_FB_01.jpg"],
            "skipped_existing": [],
        },
    )
    monkeypatch.setattr(api, "_resolve_default_account_id", lambda: "main")
    monkeypatch.setattr(
        api,
        "_facebook_post_impl",
        lambda request: {
            "ok": True,
            "mode": request.mode,
            "live_success": True,
            "live_detail": "ok",
        },
    )
    monkeypatch.setattr(api, "_mark_vehicle_posted", lambda **kwargs: None)
    monkeypatch.setattr(api, "_append_audit_event", lambda *args, **kwargs: None)

    payload = api._run_one_click_post_from_inventory(
        api.FacebookOneClickPostRequest(vin="WP0SINGLEPHOTO0001", mode="live"),
        queue_live=False,
    )
    assert payload["selected_photo_indexes"] == [0]
    assert payload["selection_fallback_used"] is True
    assert payload["images_for_post"] == ["WP0SINGLEPHOTO0001_FB_01.jpg"]
    assert payload["post_result"]["live_success"] is True


def test_simulate_credit_structure_returns_recommendation(monkeypatch):
    monkeypatch.setattr(api, "_append_audit_event", lambda *args, **kwargs: None)
    monkeypatch.setattr(api, "_bank_bias_scores", lambda: {})
    request = api.CreditStructureRequest(
        vehicle_price=32000,
        taxes=2200,
        fees=999,
        backend_products=1800,
        down_payment=4000,
        term_months=72,
        apr=10.5,
        monthly_income=6200,
        current_dti=22,
        credit_score=690,
        tradelines=14,
        derogatories=1,
        utilization=38,
    )
    payload = api._simulate_credit_structure(request)
    assert payload["ok"] is True
    assert payload["structure"]["financed_amount"] > 0
    assert payload["recommendation"]["best_bank"] is not None


def test_jd_power_parser_and_ltv_use_trade_in_value():
    raw = (
        "Vehicle,Stock #,VIN,Price,Jd Power Trade In\n"
        "2025 Test SUV,T100,1HGCM82633A004352,30000,28000\n"
    ).encode("utf-8")
    parsed = api._parse_jd_power_file(raw, "valuations.csv", "text/csv")

    assert parsed["diagnostics"]["rows_seen"] == 2
    assert parsed["items"] == [{
        "vin": "1HGCM82633A004352",
        "vehicle": "2025 Test SUV",
        "stock_number": "T100",
        "class": "",
        "new_used": "",
        "dealer_price": 30000.0,
        "jd_power_trade_in": 28000.0,
        "source_file": "valuations.csv",
    }]
    assert api._jd_power_ltv_from_pricing(
        inventory_price=30000,
        jd_trade_value=28000,
    ) == {
        "bank_sale_price": 32400.0,
        "taxes": 1944.0,
        "ltv_basis": 34344.0,
        "ltv": 122.66,
    }


def test_jd_power_upload_saves_to_configured_persistent_state(monkeypatch, tmp_path):
    target = tmp_path / "_xconsole" / "jd_power_trade_values.json"
    monkeypatch.setattr(api, "JD_POWER_VALUATIONS_PATH", target)

    saved = api._save_jd_power_valuations([
        {
            "vin": "1HGCM82633A004352",
            "jd_power_trade_in": 28000.0,
            "source_file": "valuations.xls",
        },
    ], "valuations.xls")

    assert saved["count"] == 1
    assert target.exists()
    assert api._load_jd_power_valuations()["1HGCM82633A004352"]["jd_power_trade_in"] == 28000.0
