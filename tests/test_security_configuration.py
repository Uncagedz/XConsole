from __future__ import annotations

import base64

from app import main, security


def _clear_legacy_auth_environment(monkeypatch) -> None:
    monkeypatch.delenv("XCONSOLE_BASIC_AUTH_USER", raising=False)
    monkeypatch.delenv("XCONSOLE_BASIC_AUTH_PASSWORD", raising=False)
    monkeypatch.delenv("XCONSOLE_SESSION_SECRET", raising=False)


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
