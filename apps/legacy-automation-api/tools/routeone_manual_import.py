from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from routeone_bank_docs_sync import (
    DEFAULT_BANK_ROOT,
    DEFAULT_DOWNLOAD_DIR,
    ROOT,
    bank_scan,
    build_bank_aliases,
    infer_bank,
    rel,
    sanitize_filename,
    unique_path,
)

DEFAULT_DOWNLOADS_DIR = Path.home() / "Downloads"
DEFAULT_MANUAL_MANIFEST = ROOT / "runtime" / "routeone_docs" / "manual_import_manifest.json"
DOC_EXTENSIONS = {".pdf", ".xlsx", ".xls", ".csv", ".doc", ".docx", ".txt", ".html", ".htm"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def candidate_files(source_dirs: list[Path], since_minutes: int | None) -> list[Path]:
    cutoff = None
    if since_minutes is not None and since_minutes > 0:
        cutoff = datetime.now().timestamp() - (since_minutes * 60)

    files: list[Path] = []
    seen: set[Path] = set()
    for source_dir in source_dirs:
        if not source_dir.exists() or not source_dir.is_dir():
            continue
        for path in source_dir.rglob("*"):
            if not path.is_file() or path in seen:
                continue
            if path.suffix.lower() not in DOC_EXTENSIONS:
                continue
            if path.suffix.lower() == ".crdownload":
                continue
            if cutoff is not None and path.stat().st_mtime < cutoff:
                continue
            seen.add(path)
            files.append(path)
    return sorted(files, key=lambda item: item.stat().st_mtime, reverse=True)


def existing_hashes(bank_root: Path) -> set[str]:
    hashes: set[str] = set()
    if not bank_root.exists():
        return hashes
    for path in bank_root.rglob("*"):
        if path.is_file():
            try:
                hashes.add(file_hash(path))
            except Exception:
                continue
    return hashes


def import_docs(args: argparse.Namespace) -> dict[str, Any]:
    bank_root = Path(args.bank_root).resolve()
    manifest = Path(args.manifest).resolve()
    source_dirs = [Path(item).expanduser().resolve() for item in args.source_dir]
    aliases = build_bank_aliases(bank_root)
    known_hashes = existing_hashes(bank_root)
    files = candidate_files(source_dirs, None if args.all else args.since_minutes)

    payload: dict[str, Any] = {
        "ok": True,
        "generated_at": now_iso(),
        "mode": "copy" if args.copy else "move",
        "bank_root": rel(bank_root),
        "source_dirs": [str(item) for item in source_dirs],
        "since_minutes": None if args.all else args.since_minutes,
        "seen_count": len(files),
        "imported_count": 0,
        "skipped_count": 0,
        "imported": [],
        "skipped": [],
        "errors": [],
        "bank_scan_before": bank_scan(bank_root),
        "bank_scan_after": [],
    }

    for source in files:
        try:
            digest = file_hash(source)
            if digest in known_hashes:
                payload["skipped_count"] += 1
                payload["skipped"].append({"source": str(source), "reason": "duplicate_hash"})
                continue
            bank = infer_bank(source.name, aliases)
            dest_dir = bank_root / bank
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_name = sanitize_filename(source.name, f"routeone_document{source.suffix.lower()}")
            dest = unique_path(dest_dir / dest_name)
            if args.copy:
                shutil.copy2(source, dest)
            else:
                shutil.move(str(source), str(dest))
            known_hashes.add(digest)
            payload["imported_count"] += 1
            payload["imported"].append(
                {
                    "bank": bank,
                    "source": str(source),
                    "path": rel(dest),
                    "filename": dest.name,
                    "size_bytes": dest.stat().st_size,
                    "sha256": digest,
                }
            )
        except Exception as exc:
            payload["errors"].append(f"{source}: {exc}")
            payload["ok"] = False

    payload["bank_scan_after"] = bank_scan(bank_root)
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import manually downloaded RouteOne bank docs into Bank/<lender> folders.")
    parser.add_argument("--bank-root", default=str(DEFAULT_BANK_ROOT))
    parser.add_argument("--manifest", default=str(DEFAULT_MANUAL_MANIFEST))
    parser.add_argument("--source-dir", action="append", default=[str(DEFAULT_DOWNLOADS_DIR), str(DEFAULT_DOWNLOAD_DIR)])
    parser.add_argument("--since-minutes", type=int, default=240, help="Only import documents modified in the last N minutes unless --all is used.")
    parser.add_argument("--all", action="store_true", help="Import all matching document files in the source directories.")
    parser.add_argument("--move", dest="copy", action="store_false", help="Move files instead of copying. Default copies and leaves Downloads untouched.")
    parser.set_defaults(copy=True)
    parser.add_argument("--json", action="store_true")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    payload = import_docs(args)
    if args.json:
        print(json.dumps(payload, indent=2))
    return 0 if payload.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
