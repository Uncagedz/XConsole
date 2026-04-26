from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _env_flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() not in {"0", "false", "no", "off"}


def _terminate(processes: list[subprocess.Popen[bytes]]) -> None:
    for process in processes:
        if process.poll() is None:
            process.terminate()

    deadline = time.time() + 10
    for process in processes:
        remaining = max(0.1, deadline - time.time())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            process.kill()


def _rebuild_bank_brain_on_start() -> None:
    if not _env_flag("XCONSOLE_REBUILD_BANK_BRAIN_ON_START", True):
        return

    bank_root = os.getenv("BANK_DOCS_ROOT", str(ROOT / "Bank"))
    command = [
        sys.executable,
        str(ROOT / "tools" / "rebuild_bank_brain.py"),
        "--bank-root",
        bank_root,
        "--json",
    ]
    print("Rebuilding Bank Brain profiles from RouteOne docs...", flush=True)
    try:
        result = subprocess.run(command, cwd=ROOT, text=True, timeout=180)
    except Exception as exc:
        print(f"Bank Brain startup rebuild skipped: {exc}", flush=True)
        return

    if result.returncode != 0:
        print(
            f"Bank Brain startup rebuild returned exit code {result.returncode}; app will continue with fallback/generated profiles.",
            flush=True,
        )


def main() -> int:
    public_port = os.getenv("PORT", "8100")
    sales_port = os.getenv("SALES_BACKEND_PORT", "4300")
    sales_entrypoint = ROOT / "sales-assistant" / "backend" / "dist" / "index.js"

    _rebuild_bank_brain_on_start()

    processes: list[subprocess.Popen[bytes]] = []

    sales_env = os.environ.copy()
    sales_env["PORT"] = sales_port
    sales = subprocess.Popen(
        ["node", str(sales_entrypoint)],
        cwd=ROOT / "sales-assistant" / "backend",
        env=sales_env,
    )
    processes.append(sales)

    api_env = os.environ.copy()
    api_env["SALES_ASSISTANT_BACKEND_URL"] = f"http://127.0.0.1:{sales_port}"
    api = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "0.0.0.0",
            "--port",
            str(public_port),
        ],
        cwd=ROOT,
        env=api_env,
    )
    processes.append(api)

    def handle_signal(signum: int, _frame: object) -> None:
        print(f"Received signal {signum}; stopping xConsole stack.", flush=True)
        _terminate(processes)
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, handle_signal)
    signal.signal(signal.SIGINT, handle_signal)

    print(
        f"xConsole running on 0.0.0.0:{public_port}; sales assistant backend on 127.0.0.1:{sales_port}.",
        flush=True,
    )

    while True:
        for process in processes:
            code = process.poll()
            if code is not None:
                _terminate(processes)
                return int(code or 1)
        time.sleep(1)


if __name__ == "__main__":
    raise SystemExit(main())
