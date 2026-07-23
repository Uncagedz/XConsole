from __future__ import annotations

import asyncio
import base64
import json

from fastapi import HTTPException
from fastapi.testclient import TestClient
import pytest
from starlette.requests import Request

from app import main, security


def _clear_legacy_auth_environment(monkeypatch) -> None:
    monkeypatch.delenv("XCONSOLE_BASIC_AUTH_USER", raising=False)
    monkeypatch.delenv("XCONSOLE_BASIC_AUTH_PASSWORD", raising=False)
    monkeypatch.delenv("XCONSOLE_SESSION_SECRET", raising=False)
    monkeypatch.delenv("XCONSOLE_LEGACY_API_TOKEN", raising=False)


def _request(
    path: str,
    *,
    request_id: str | None = None,
) -> Request:
    headers = []
    if request_id is not None:
        headers.append((b"x-request-id", request_id.encode("ascii")))
    return Request(
        {
            "type": "http",
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": path,
            "raw_path": path.encode("ascii"),
            "query_string": b"",
            "headers": headers,
            "client": ("127.0.0.1", 12345),
            "server": ("testserver", 80),
            "root_path": "",
        }
    )


def test_legacy_auth_has_no_default_admin(monkeypatch, tmp_path) -> None:
    _clear_legacy_auth_environment(monkeypatch)
    monkeypatch.setattr(security, "USERS_PATH", tmp_path / "users.json")

    assert security.configured_basic_auth_credentials() is None
    assert security.configured_basic_auth_header() is None
    assert security.load_user_records() == []
    assert main._admin_bootstrap_script() == ""
    assert security._session_cookie_secret() == security.EPHEMERAL_SESSION_SECRET


def test_explicit_legacy_auth_configuration_remains_callable(monkeypatch, tmp_path) -> None:
    monkeypatch.setenv("XCONSOLE_BASIC_AUTH_USER", "configured-admin")
    monkeypatch.setenv("XCONSOLE_BASIC_AUTH_PASSWORD", "configured-password-123")
    monkeypatch.delenv("XCONSOLE_SESSION_SECRET", raising=False)
    monkeypatch.setattr(security, "USERS_PATH", tmp_path / "users.json")

    auth_header = security.configured_basic_auth_header()

    assert auth_header is not None
    encoded = auth_header.removeprefix("Basic ")
    assert base64.b64decode(encoded).decode("utf-8") == (
        "configured-admin:configured-password-123"
    )
    assert security.authenticate_basic_header(auth_header)["username"] == (
        "configured-admin"
    )
    assert "window.__XCONSOLE_BASIC_AUTH__" in main._admin_bootstrap_script()
    assert security._session_cookie_secret() != "configured-password-123"


def test_legacy_cors_requires_explicit_non_wildcard_origins(monkeypatch) -> None:
    monkeypatch.delenv("CORS_ORIGINS", raising=False)
    monkeypatch.delenv("XCONSOLE_CORS_ORIGINS", raising=False)
    assert main._configured_cors_origins() == list(main.DEFAULT_CORS_ORIGINS)

    monkeypatch.setenv(
        "CORS_ORIGINS",
        "https://xconsole.example, https://xconsole.example/, "
        "chrome-extension://abcdefghijklmnop",
    )
    assert main._configured_cors_origins() == [
        "https://xconsole.example",
        "chrome-extension://abcdefghijklmnop",
    ]

    monkeypatch.setenv("CORS_ORIGINS", "*")
    with pytest.raises(RuntimeError, match="Wildcard CORS origins"):
        main._configured_cors_origins()


def test_legacy_cors_middleware_allows_local_dashboard_and_denies_unknown_origin() -> None:
    client = TestClient(main.app)
    preflight_headers = {
        "Access-Control-Request-Method": "GET",
    }

    allowed = client.options(
        "/api/health",
        headers={
            **preflight_headers,
            "Origin": "http://localhost:5173",
        },
    )
    denied = client.options(
        "/api/health",
        headers={
            **preflight_headers,
            "Origin": "https://untrusted.example",
        },
    )

    assert allowed.status_code == 200
    assert allowed.headers["access-control-allow-origin"] == (
        "http://localhost:5173"
    )
    assert "access-control-allow-origin" not in denied.headers


def test_legacy_api_health_is_public_but_other_routes_require_auth(
    monkeypatch,
    tmp_path,
) -> None:
    _clear_legacy_auth_environment(monkeypatch)
    monkeypatch.setattr(security, "USERS_PATH", tmp_path / "users.json")
    client = TestClient(main.app)

    health = client.get("/api/health")
    protected = client.get(
        "/api/status",
        headers={"X-Request-ID": "auth-test-123"},
    )

    assert health.status_code == 200
    assert protected.status_code == 401
    assert protected.headers["x-request-id"] == "auth-test-123"
    assert protected.json()["error"] == "authentication_required"
    assert protected.json()["path"] == "/api/status"


def test_legacy_api_accepts_explicit_service_bearer_token(monkeypatch) -> None:
    token = "legacy-service-token-with-at-least-32-characters"
    monkeypatch.setenv("XCONSOLE_LEGACY_API_TOKEN", token)
    client = TestClient(main.app)

    accepted = client.get(
        "/api/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    rejected = client.get(
        "/api/me",
        headers={"Authorization": "Bearer wrong-token"},
    )
    inventory = client.get(
        "/api/inventory/active",
        headers={"Authorization": f"Bearer {token}"},
    )
    admin = client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert accepted.status_code == 200
    assert accepted.json()["ok"] is True
    assert accepted.json()["user"]["role"] == "service"
    assert "inventory.view" in accepted.json()["user"]["permissions"]
    assert inventory.status_code == 200
    assert admin.status_code == 403
    assert rejected.status_code == 401

    monkeypatch.setenv("XCONSOLE_LEGACY_API_TOKEN", "too-short")
    with pytest.raises(RuntimeError, match="at least 32 characters"):
        main._configured_legacy_api_token()


def test_legacy_basic_auth_establishes_reusable_session_cookie(
    monkeypatch,
    tmp_path,
) -> None:
    monkeypatch.setenv("XCONSOLE_BASIC_AUTH_USER", "configured-admin")
    monkeypatch.setenv("XCONSOLE_BASIC_AUTH_PASSWORD", "configured-password-123")
    monkeypatch.delenv("XCONSOLE_LEGACY_API_TOKEN", raising=False)
    monkeypatch.setattr(security, "USERS_PATH", tmp_path / "users.json")
    client = TestClient(main.app)
    auth_header = security.configured_basic_auth_header()

    initial = client.get(
        "/api/me",
        headers={"Authorization": str(auth_header)},
    )
    session = client.get("/api/me")

    assert initial.status_code == 200
    assert initial.json()["user"]["username"] == "configured-admin"
    assert "xconsole_session=" in initial.headers["set-cookie"]
    assert session.status_code == 200
    assert session.json()["user"]["username"] == "configured-admin"


def test_internal_errors_are_sanitized_and_correlated(monkeypatch) -> None:
    monkeypatch.setattr(main.LOGGER, "error", lambda *args, **kwargs: None)
    request = _request("/explode", request_id="request-123")

    response = asyncio.run(
        main._global_exception_handler(
            request,
            RuntimeError("database-password-should-not-leak"),
        )
    )
    payload = json.loads(response.body)

    assert response.status_code == 500
    assert response.headers["x-request-id"] == "request-123"
    assert payload == {
        "ok": False,
        "error": "internal_server_error",
        "message": "An unexpected error occurred.",
        "path": "/explode",
        "request_id": "request-123",
        "status_code": 500,
    }
    assert "database-password-should-not-leak" not in response.body.decode("utf-8")


def test_explicit_http_500_details_are_sanitized() -> None:
    request = _request("/dependency")

    response = asyncio.run(
        main._http_exception_handler(
            request,
            HTTPException(
                status_code=500,
                detail={
                    "message": "driver failed with password=secret",
                    "error": "private stack detail",
                },
            ),
        )
    )
    payload = json.loads(response.body)

    assert response.status_code == 500
    assert payload["message"] == "An unexpected error occurred."
    assert payload["error"] == "internal_server_error"
    assert "details" not in payload
    assert "secret" not in response.body.decode("utf-8")
