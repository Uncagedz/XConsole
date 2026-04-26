from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import sys
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urljoin, urlparse

import requests

try:
    from selenium import webdriver
    from selenium.common.exceptions import TimeoutException, WebDriverException
    from selenium.webdriver.chrome.service import Service as ChromeService
    from selenium.webdriver.edge.service import Service as EdgeService
    from selenium.webdriver.common.by import By
except Exception:  # pragma: no cover - reported cleanly at runtime
    webdriver = None
    ChromeService = None
    EdgeService = None
    By = None
    TimeoutException = Exception
    WebDriverException = Exception


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_BANK_ROOT = ROOT / "Bank"
DEFAULT_DOWNLOAD_DIR = ROOT / "runtime" / "routeone_docs" / "incoming"
DEFAULT_MANIFEST = ROOT / "runtime" / "routeone_docs" / "manifest.json"
DEFAULT_PROFILE_DIR = ROOT / "automation" / "routeone-profile"
DEFAULT_START_URL = os.getenv(
    "ROUTEONE_START_URL",
    "https://www.routeone.net/auth0-login/webjars/auth0-login-ui/dist/auth0-login-ui/userSelector?locale=en-US",
)
CHROME_EXE = ROOT / "automation" / "facebook-marketplace-lister" / "chrome-for-testing" / "chrome-win64" / "chrome.exe"
CHROMEDRIVER_EXE = ROOT / "automation" / "facebook-marketplace-lister" / "drivers" / "chromedriver.exe"
EDGE_EXE = Path(os.getenv("EDGE_BINARY", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"))
EDGEDRIVER_EXE = ROOT / "automation" / "edgedriver" / "msedgedriver.exe"
DEFAULT_EDGE_USER_DATA_DIR = Path.home() / "AppData" / "Local" / "Microsoft" / "Edge" / "User Data"

DOCUMENT_RE = re.compile(
    r"(\.pdf\b|rate\s*sheet|rate\s*card|\brates\b|forms?\b|programs?\b|guidelines?|"
    r"dealer\s*agreement|credit\s*application|retail\s*contract|lease\s*contract|bulletin|"
    r"stips?|lender\s*guide|funding\s*checklist|download)",
    re.IGNORECASE,
)
NAV_RE = re.compile(
    r"(lender|bank|rate|form|program|guideline|document|resource|download|library|finance)",
    re.IGNORECASE,
)
STATIC_RE = re.compile(r"\.(?:png|jpe?g|gif|svg|webp|css|js|ico|woff2?)(?:\?|$)", re.IGNORECASE)

MANUAL_ALIASES: dict[str, list[str]] = {
    "Ally": ["ally", "ally financial"],
    "American_Credit_Acceptance_LLC": ["american credit acceptance", "aca"],
    "AMERICREDIT": ["americredit", "gm financial", "general motors financial"],
    "Axos_Bank": ["axos", "axos bank"],
    "Bank_of_America": ["bank of america", "bofa", "boa"],
    "Cal_Automotive": ["cal automotive", "cal auto"],
    "CapitalOne": ["capital one", "capitalone", "cap one", "capital one auto"],
    "Chase": ["chase", "jp morgan", "jpmorgan", "jpmorgan chase", "chase auto"],
    "Dade_County_Federal_Credit_Union": ["dade county federal", "dade county fcu", "dcfcu"],
    "Exeter_Finance": ["exeter", "exeter finance"],
    "FCA_Mastercard": ["fca mastercard", "first citizens", "first citizens bank"],
    "Fifth_Third_Bank_National_Association": ["fifth third", "5/3", "53 bank"],
    "First_Help_Financial": ["first help", "first help financial"],
    "Foursight_Capital": ["foursight", "foursight capital"],
    "Global_Lending_Services": ["global lending services", "gls"],
    "GoFi_LLC": ["gofi", "go financial", "gofi llc"],
    "GTE_Federal_Credit_Union": ["gte federal", "gte financial", "gte fcu"],
    "Mid_Florida_Credit_Union": ["mid florida", "midflorida", "mid florida credit union"],
    "PNC_Bank": ["pnc", "pnc bank"],
    "Santander": ["santander", "santander consumer", "chrysler capital", "ccap"],
    "Space_Coast_Credit_Union": ["space coast", "space coast credit union", "sccu"],
    "Teachers_Federal_Credit_Union": ["teachers federal", "teachers fcu"],
    "Tropical_Financial_Credit_Union": ["tropical financial", "tropical fcu"],
    "US_Bank": ["us bank", "u.s. bank", "usb"],
    "Valley_National_Bank": ["valley national", "valley bank"],
    "Valley_Strong_Credit_Union": ["valley strong", "valley strong credit union"],
    "Wells_Fargo_Auto": ["wells fargo", "wells fargo auto", "wf auto"],
    "Westlake_Financial_Services": ["westlake", "westlake financial"],
}


@dataclass(frozen=True)
class Candidate:
    sync_id: str
    tag: str
    href: str
    text: str
    title: str
    aria: str

    @property
    def context(self) -> str:
        return " ".join(part for part in [self.text, self.title, self.aria, self.href] if part).strip()


def log(message: str) -> None:
    print(f"[routeone-sync] {message}", file=sys.stderr)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def rel(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT)).replace("\\", "/")
    except Exception:
        return str(path.resolve())


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.lower()).strip()


def sanitize_filename(value: str, fallback: str = "routeone_document") -> str:
    cleaned = unquote(value or "").strip()
    cleaned = re.sub(r"[\\/:*?\"<>|]+", "-", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" .-_")
    cleaned = cleaned[:140].strip()
    return cleaned or fallback


def unique_path(path: Path) -> Path:
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    for index in range(2, 1000):
        candidate = parent / f"{stem}_{index}{suffix}"
        if not candidate.exists():
            return candidate
    return parent / f"{stem}_{int(time.time())}{suffix}"


def bank_scan(bank_root: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not bank_root.exists():
        return rows
    folders = sorted([item for item in bank_root.iterdir() if item.is_dir()], key=lambda item: item.name.lower())
    for folder in folders:
        files = [item for item in folder.rglob("*") if item.is_file()]
        rows.append(
            {
                "bank": folder.name,
                "files": len(files),
                "latest_file": rel(max(files, key=lambda item: item.stat().st_mtime)) if files else None,
            }
        )
    return rows


def build_bank_aliases(bank_root: Path) -> dict[str, set[str]]:
    aliases: dict[str, set[str]] = {
        bank: {
            normalize(bank),
            normalize(bank.replace("_", " ")),
            normalize(re.sub(r"([a-z])([A-Z])", r"\1 \2", bank).replace("_", " ")),
            *(normalize(alias) for alias in manual_aliases),
        }
        for bank, manual_aliases in MANUAL_ALIASES.items()
    }
    if not bank_root.exists():
        return {bank: {term for term in terms if term} for bank, terms in aliases.items()}
    for folder in [item for item in bank_root.iterdir() if item.is_dir()]:
        terms = {
            normalize(folder.name),
            normalize(folder.name.replace("_", " ")),
            normalize(re.sub(r"([a-z])([A-Z])", r"\1 \2", folder.name).replace("_", " ")),
        }
        for alias in MANUAL_ALIASES.get(folder.name, []):
            terms.add(normalize(alias))
        aliases.setdefault(folder.name, set()).update(term for term in terms if term)
    return {bank: {term for term in terms if term} for bank, terms in aliases.items()}


def infer_bank(context: str, aliases: dict[str, set[str]]) -> str:
    normalized_context = normalize(context)
    best_bank = ""
    best_len = 0
    for bank, terms in aliases.items():
        for term in terms:
            if term and term in normalized_context and len(term) > best_len:
                best_bank = bank
                best_len = len(term)
    return best_bank or "Unmatched"


def configure_driver(
    download_dir: Path,
    profile_dir: Path,
    headless: bool,
    browser: str,
    edge_user_data_dir: Path,
    edge_profile_directory: str,
) -> Any:
    if webdriver is None or ChromeService is None or EdgeService is None:
        raise RuntimeError("Selenium is not installed in the active Python environment.")

    download_dir.mkdir(parents=True, exist_ok=True)

    if browser == "edge":
        if not EDGEDRIVER_EXE.exists():
            raise FileNotFoundError(f"Missing EdgeDriver: {EDGEDRIVER_EXE}")
        if not EDGE_EXE.exists():
            raise FileNotFoundError(f"Missing Microsoft Edge executable: {EDGE_EXE}")
        options = webdriver.EdgeOptions()
        options.binary_location = str(EDGE_EXE)
        options.add_argument(f"--user-data-dir={edge_user_data_dir.resolve()}")
        options.add_argument(f"--profile-directory={edge_profile_directory}")
    else:
        if not CHROMEDRIVER_EXE.exists():
            raise FileNotFoundError(f"Missing ChromeDriver: {CHROMEDRIVER_EXE}")
        profile_dir.mkdir(parents=True, exist_ok=True)
        options = webdriver.ChromeOptions()
        if CHROME_EXE.exists():
            options.binary_location = str(CHROME_EXE)
        options.add_argument(f"--user-data-dir={profile_dir.resolve()}")
        options.add_argument("--profile-directory=Default")

    prefs = {
        "download.default_directory": str(download_dir.resolve()),
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "plugins.always_open_pdf_externally": True,
        "profile.default_content_setting_values.notifications": 2,
        "profile.default_content_settings.popups": 0,
        "safebrowsing.enabled": True,
    }
    options.add_experimental_option("prefs", prefs)
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-popup-blocking")
    options.add_argument("--start-maximized")
    if headless:
        options.add_argument("--headless=new")

    if browser == "edge":
        driver = webdriver.Edge(service=EdgeService(executable_path=str(EDGEDRIVER_EXE)), options=options)
    else:
        driver = webdriver.Chrome(service=ChromeService(executable_path=str(CHROMEDRIVER_EXE)), options=options)
    driver.set_page_load_timeout(60)
    try:
        driver.execute_cdp_cmd(
            "Page.setDownloadBehavior",
            {"behavior": "allow", "downloadPath": str(download_dir.resolve())},
        )
    except Exception:
        pass
    return driver


def make_session(driver: Any) -> requests.Session:
    session = requests.Session()
    for cookie in driver.get_cookies():
        try:
            session.cookies.set(cookie["name"], cookie["value"], domain=cookie.get("domain"), path=cookie.get("path", "/"))
        except Exception:
            continue
    session.headers.update(
        {
            "User-Agent": "Mozilla/5.0 RouteOneBankDocsSync/1.0",
            "Accept": "application/pdf,application/octet-stream,text/html;q=0.8,*/*;q=0.5",
        }
    )
    return session


def is_login_page(driver: Any) -> bool:
    current_url = (driver.current_url or "").lower()
    title = ""
    body_text = ""
    try:
        title = (driver.title or "").lower()
    except Exception:
        pass
    try:
        body_text = driver.find_element(By.TAG_NAME, "body").text.lower()[:5000]
    except Exception:
        pass
    try:
        password_inputs = driver.find_elements(By.CSS_SELECTOR, "input[type='password']")
        if any(element.is_displayed() for element in password_inputs):
            return True
    except Exception:
        pass

    login_signals = ["login", "log in", "sign in", "username", "password", "multi-factor", "mfa"]
    haystack = f"{current_url} {title} {body_text}"
    return ("routeone" in haystack and any(signal in haystack for signal in login_signals)) or (
        "login" in current_url and any(signal in haystack for signal in login_signals)
    )


def wait_for_routeone_session(driver: Any, wait_seconds: int) -> bool:
    if not is_login_page(driver):
        return True
    if wait_seconds <= 0:
        return False
    log(f"RouteOne login required. Waiting up to {wait_seconds}s for the saved browser profile to be authenticated.")
    deadline = time.time() + wait_seconds
    while time.time() < deadline:
        time.sleep(3)
        if not is_login_page(driver):
            return True
    return False


def wait_for_manual_handoff(driver: Any, wait_seconds: int) -> None:
    if wait_seconds <= 0:
        return
    log(
        "Manual RouteOne handoff active. Log in, open the lender rates/forms page, "
        "then leave that page still for a few seconds."
    )
    deadline = time.time() + wait_seconds
    last_url = ""
    stable_since = time.time()
    while time.time() < deadline:
        time.sleep(2)
        try:
            current_url = driver.current_url or ""
        except Exception:
            continue
        if current_url != last_url:
            last_url = current_url
            stable_since = time.time()
        if is_login_page(driver):
            continue
        try:
            candidates = collect_candidates(driver)
            document_candidates = [candidate for candidate in candidates if is_document_candidate(candidate)]
            title = driver.title or ""
            page_hint = f"{current_url} {title}"
            if (document_candidates or DOCUMENT_RE.search(page_hint)) and time.time() - stable_since >= 6:
                log(f"Manual handoff detected a scannable RouteOne page: {current_url}")
                return
        except Exception:
            continue
    log("Manual handoff wait expired; scanning the current browser page.")


def scroll_page(driver: Any) -> None:
    for ratio in [0, 0.35, 0.7, 1]:
        try:
            driver.execute_script("window.scrollTo(0, document.body.scrollHeight * arguments[0]);", ratio)
            time.sleep(0.35)
        except Exception:
            break
    try:
        driver.execute_script("window.scrollTo(0, 0);")
    except Exception:
        pass


def collect_candidates(driver: Any) -> list[Candidate]:
    raw_items = driver.execute_script(
        """
        const nodes = Array.from(document.querySelectorAll(
          'a,button,[role="button"],iframe,embed,object,[onclick],[data-href],[data-url]'
        )).slice(0, 800);
        return nodes.map((el, index) => {
          const syncId = 'routeone-sync-' + index;
          el.setAttribute('data-routeone-sync-id', syncId);
          const attr = (name) => el.getAttribute(name) || '';
          const href = el.href || el.src || el.data || attr('data-href') || attr('data-url') || attr('href') || attr('src') || '';
          return {
            syncId,
            tag: el.tagName || '',
            href,
            text: ((el.innerText || el.textContent || '') + '').trim().slice(0, 500),
            title: attr('title'),
            aria: attr('aria-label')
          };
        });
        """
    )
    candidates: list[Candidate] = []
    for item in raw_items or []:
        if not isinstance(item, dict):
            continue
        candidates.append(
            Candidate(
                sync_id=str(item.get("syncId") or ""),
                tag=str(item.get("tag") or ""),
                href=str(item.get("href") or ""),
                text=str(item.get("text") or ""),
                title=str(item.get("title") or ""),
                aria=str(item.get("aria") or ""),
            )
        )
    return candidates


def is_http_url(url: str) -> bool:
    return url.lower().startswith(("http://", "https://"))


def is_document_candidate(candidate: Candidate) -> bool:
    context = candidate.context
    if not context:
        return False
    if STATIC_RE.search(context):
        return False
    return bool(DOCUMENT_RE.search(context))


def is_relevant_nav(url: str, context: str, base_host: str) -> bool:
    if not is_http_url(url) or STATIC_RE.search(url):
        return False
    parsed = urlparse(url)
    if parsed.netloc and parsed.netloc != base_host and "routeone" not in parsed.netloc.lower():
        return False
    path_text = f"{parsed.path} {parsed.query} {context}"
    return bool(NAV_RE.search(path_text))


def filename_from_response(url: str, response: requests.Response, context: str) -> str:
    disposition = response.headers.get("content-disposition", "")
    match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', disposition, flags=re.IGNORECASE)
    if match:
        return sanitize_filename(match.group(1))
    parsed_name = Path(urlparse(url).path).name
    if parsed_name:
        return sanitize_filename(parsed_name)
    compact_context = re.sub(r"\s+", " ", context).strip()
    return sanitize_filename(compact_context[:80], "routeone_document.pdf")


def looks_like_pdf(content: bytes) -> bool:
    return content[:5] == b"%PDF-"


def store_file(source_path: Path, context: str, bank_root: Path, aliases: dict[str, set[str]], saved: list[dict[str, Any]]) -> dict[str, Any]:
    bank = infer_bank(f"{context} {source_path.name}", aliases)
    dest_dir = bank_root / bank
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest_path = unique_path(dest_dir / sanitize_filename(source_path.name))
    shutil.move(str(source_path), str(dest_path))
    entry = {
        "bank": bank,
        "path": rel(dest_path),
        "filename": dest_path.name,
        "source_context": context[:500],
        "size_bytes": dest_path.stat().st_size,
    }
    saved.append(entry)
    return entry


def download_http(
    session: requests.Session,
    url: str,
    context: str,
    download_dir: Path,
    bank_root: Path,
    aliases: dict[str, set[str]],
    saved: list[dict[str, Any]],
    errors: list[str],
) -> dict[str, Any] | None:
    try:
        response = session.get(url, timeout=45, allow_redirects=True)
    except Exception as exc:
        errors.append(f"download_failed {url}: {exc}")
        return None

    content_type = response.headers.get("content-type", "").lower()
    disposition = response.headers.get("content-disposition", "").lower()
    if response.status_code >= 400:
        errors.append(f"download_http_{response.status_code} {url}")
        return None

    content = response.content or b""
    is_download = (
        "pdf" in content_type
        or "octet-stream" in content_type
        or "attachment" in disposition
        or looks_like_pdf(content)
        or urlparse(response.url).path.lower().endswith(".pdf")
    )
    if not is_download:
        return None

    filename = filename_from_response(response.url, response, context)
    if "pdf" in content_type or looks_like_pdf(content) or filename.lower().endswith(".pdf"):
        if not filename.lower().endswith(".pdf"):
            filename = f"{Path(filename).stem}.pdf"
    temp_path = unique_path(download_dir / sanitize_filename(filename))
    temp_path.write_bytes(content)
    return store_file(temp_path, f"{context} {response.url}", bank_root, aliases, saved)


def wait_for_browser_downloads(download_dir: Path, start_time: float, timeout_seconds: int = 20) -> list[Path]:
    deadline = time.time() + timeout_seconds
    latest: list[Path] = []
    while time.time() < deadline:
        files = [item for item in download_dir.glob("*") if item.is_file() and item.stat().st_mtime >= start_time - 0.5]
        pending = [item for item in files if item.suffix.lower() == ".crdownload"]
        complete = [item for item in files if item.suffix.lower() != ".crdownload"]
        latest = complete
        if complete and not pending:
            return sorted(complete, key=lambda item: item.stat().st_mtime)
        time.sleep(0.5)
    return sorted(latest, key=lambda item: item.stat().st_mtime)


def print_current_page_to_pdf(
    driver: Any,
    context: str,
    download_dir: Path,
    bank_root: Path,
    aliases: dict[str, set[str]],
    saved: list[dict[str, Any]],
    errors: list[str],
) -> dict[str, Any] | None:
    try:
        title = driver.title or "routeone_interactive_document"
        result = driver.execute_cdp_cmd(
            "Page.printToPDF",
            {
                "printBackground": True,
                "preferCSSPageSize": True,
                "landscape": False,
            },
        )
        raw = base64.b64decode(result["data"])
    except Exception as exc:
        errors.append(f"print_to_pdf_failed {context[:80]}: {exc}")
        return None
    if len(raw) < 1000:
        return None
    temp_name = sanitize_filename(f"{title}.pdf", "routeone_interactive_document.pdf")
    if not temp_name.lower().endswith(".pdf"):
        temp_name = f"{temp_name}.pdf"
    temp_path = unique_path(download_dir / temp_name)
    temp_path.write_bytes(raw)
    return store_file(temp_path, f"{context} {driver.current_url}", bank_root, aliases, saved)


def click_and_capture(
    driver: Any,
    candidate: Candidate,
    session: requests.Session,
    download_dir: Path,
    bank_root: Path,
    aliases: dict[str, set[str]],
    saved: list[dict[str, Any]],
    errors: list[str],
) -> None:
    if not candidate.sync_id:
        return
    before_handles = set(driver.window_handles)
    before_url = driver.current_url
    started = time.time()
    try:
        element = driver.find_element(By.CSS_SELECTOR, f"[data-routeone-sync-id='{candidate.sync_id}']")
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", element)
        time.sleep(0.2)
        driver.execute_script("arguments[0].click();", element)
    except Exception as exc:
        errors.append(f"click_failed {candidate.context[:120]}: {exc}")
        return

    time.sleep(1.5)
    for file_path in wait_for_browser_downloads(download_dir, started, timeout_seconds=6):
        if file_path.exists():
            store_file(file_path, candidate.context, bank_root, aliases, saved)

    new_handles = [handle for handle in driver.window_handles if handle not in before_handles]
    active_handle = driver.current_window_handle
    for handle in new_handles:
        try:
            driver.switch_to.window(handle)
            time.sleep(1)
            url = driver.current_url
            if is_http_url(url):
                downloaded = download_http(session, url, candidate.context, download_dir, bank_root, aliases, saved, errors)
                if downloaded is None and (DOCUMENT_RE.search(url) or DOCUMENT_RE.search(candidate.context)):
                    print_current_page_to_pdf(driver, candidate.context, download_dir, bank_root, aliases, saved, errors)
            else:
                print_current_page_to_pdf(driver, candidate.context, download_dir, bank_root, aliases, saved, errors)
            driver.close()
        except Exception as exc:
            errors.append(f"new_tab_capture_failed {candidate.context[:120]}: {exc}")
        finally:
            try:
                driver.switch_to.window(active_handle)
            except Exception:
                pass

    if not new_handles and driver.current_url != before_url:
        try:
            url = driver.current_url
            downloaded = download_http(session, url, candidate.context, download_dir, bank_root, aliases, saved, errors) if is_http_url(url) else None
            if downloaded is None and (DOCUMENT_RE.search(url) or DOCUMENT_RE.search(candidate.context)):
                print_current_page_to_pdf(driver, candidate.context, download_dir, bank_root, aliases, saved, errors)
            driver.get(before_url)
            time.sleep(0.5)
        except Exception as exc:
            errors.append(f"same_tab_capture_failed {candidate.context[:120]}: {exc}")


def write_manifest(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def sync_routeone_docs(args: argparse.Namespace) -> dict[str, Any]:
    bank_root = Path(args.bank_root).resolve()
    download_dir = Path(args.download_dir).resolve()
    profile_dir = Path(args.profile_dir).resolve()
    edge_user_data_dir = Path(args.edge_user_data_dir).resolve()
    manifest_path = Path(args.manifest).resolve()
    start_url = args.start_url
    aliases = build_bank_aliases(bank_root)

    payload: dict[str, Any] = {
        "ok": False,
        "mode": "dry_run" if args.dry_run else "live_browser",
        "generated_at": now_iso(),
        "start_url": start_url,
        "bank_root": rel(bank_root),
        "download_dir": rel(download_dir),
        "profile_dir": rel(profile_dir),
        "browser": args.browser,
        "edge_user_data_dir": str(edge_user_data_dir) if args.browser == "edge" else None,
        "edge_profile_directory": args.edge_profile_directory if args.browser == "edge" else None,
        "manifest_path": rel(manifest_path),
        "authenticated": False,
        "needs_login": False,
        "visited": [],
        "saved": [],
        "saved_count": 0,
        "errors": [],
        "warnings": [],
        "bank_scan_before": bank_scan(bank_root),
        "bank_scan_after": [],
    }

    if args.dry_run:
        payload["ok"] = True
        payload["bank_scan_after"] = payload["bank_scan_before"]
        write_manifest(manifest_path, payload)
        return payload

    driver = None
    try:
        driver = configure_driver(
            download_dir=download_dir,
            profile_dir=profile_dir,
            headless=args.headless,
            browser=args.browser,
            edge_user_data_dir=edge_user_data_dir,
            edge_profile_directory=args.edge_profile_directory,
        )
        log(f"Opening RouteOne start URL: {start_url}")
        driver.get(start_url)
        time.sleep(2)
        wait_for_manual_handoff(driver, args.manual_handoff_seconds)
        payload["authenticated"] = wait_for_routeone_session(driver, args.login_wait_seconds)
        if not payload["authenticated"]:
            payload["needs_login"] = True
            payload["errors"].append(
                "RouteOne login/session is required. Re-run with --login-wait-seconds 300 and complete login once in the opened browser profile."
            )
            payload["bank_scan_after"] = bank_scan(bank_root)
            write_manifest(manifest_path, payload)
            return payload

        session = make_session(driver)
        queue: deque[str] = deque([driver.current_url or start_url])
        visited: set[str] = set()
        seen_docs: set[str] = set()
        base_host = urlparse(driver.current_url or start_url).netloc

        while queue and len(visited) < args.max_pages:
            url = queue.popleft()
            if not is_http_url(url) or url in visited:
                continue
            visited.add(url)
            payload["visited"].append(url)
            log(f"Scanning page {len(visited)}/{args.max_pages}: {url}")
            try:
                driver.get(url)
            except TimeoutException:
                payload["errors"].append(f"page_timeout {url}")
            except WebDriverException as exc:
                payload["errors"].append(f"page_load_failed {url}: {exc}")
                continue
            time.sleep(1)
            if is_login_page(driver):
                payload["needs_login"] = True
                payload["authenticated"] = False
                payload["errors"].append(f"RouteOne session expired or auth wall reached at {url}")
                break
            scroll_page(driver)
            candidates = collect_candidates(driver)
            click_candidates: list[Candidate] = []
            for candidate in candidates:
                context = candidate.context
                href = candidate.href.strip()
                absolute_url = urljoin(driver.current_url, href) if href else ""
                if href and is_document_candidate(candidate):
                    fingerprint = absolute_url or context
                    if fingerprint in seen_docs:
                        continue
                    seen_docs.add(fingerprint)
                    if is_http_url(absolute_url):
                        download_http(session, absolute_url, context, download_dir, bank_root, aliases, payload["saved"], payload["errors"])
                    else:
                        click_candidates.append(candidate)
                elif href and is_relevant_nav(absolute_url, context, base_host):
                    if absolute_url not in visited and absolute_url not in queue:
                        queue.append(absolute_url)
                elif not href and is_document_candidate(candidate):
                    click_candidates.append(candidate)

            for candidate in click_candidates[: args.max_clicks_per_page]:
                click_and_capture(driver, candidate, session, download_dir, bank_root, aliases, payload["saved"], payload["errors"])

        payload["saved_count"] = len(payload["saved"])
        payload["bank_scan_after"] = bank_scan(bank_root)
        if payload["saved_count"] == 0:
            payload["warnings"].append(
                "No RouteOne bank documents were downloaded. Use a post-login RouteOne lender documents, rate sheets, or forms page as --start-url."
            )
        payload["ok"] = bool(payload["authenticated"]) and payload["saved_count"] > 0 and not payload["needs_login"] and not any(
            str(error).startswith(("Selenium", "Missing ChromeDriver")) for error in payload["errors"]
        )
    except Exception as exc:
        payload["errors"].append(str(exc))
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        payload["saved_count"] = len(payload["saved"])
        payload["bank_scan_after"] = bank_scan(bank_root)
        write_manifest(manifest_path, payload)
    return payload


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download RouteOne bank rate sheets/forms into the local Bank folder.")
    parser.add_argument("--start-url", default=DEFAULT_START_URL, help="RouteOne page to start from. Defaults to ROUTEONE_START_URL or routeone.net.")
    parser.add_argument("--bank-root", default=str(DEFAULT_BANK_ROOT), help="Bank folder root.")
    parser.add_argument("--download-dir", default=str(DEFAULT_DOWNLOAD_DIR), help="Temporary browser download folder.")
    parser.add_argument("--profile-dir", default=str(DEFAULT_PROFILE_DIR), help="Persistent Chrome profile for RouteOne login/session reuse.")
    parser.add_argument("--browser", choices=["chrome", "edge"], default=os.getenv("ROUTEONE_BROWSER", "chrome"), help="Browser to drive. Edge uses the normal Edge user profile by default.")
    parser.add_argument("--edge-user-data-dir", default=str(DEFAULT_EDGE_USER_DATA_DIR), help="Existing Microsoft Edge user-data directory to use when --browser edge.")
    parser.add_argument("--edge-profile-directory", default=os.getenv("ROUTEONE_EDGE_PROFILE_DIRECTORY", "Default"), help="Existing Microsoft Edge profile directory to use when --browser edge.")
    parser.add_argument("--manifest", default=str(DEFAULT_MANIFEST), help="JSON manifest output path.")
    parser.add_argument("--max-pages", type=int, default=30, help="Max RouteOne pages to crawl after login.")
    parser.add_argument("--max-clicks-per-page", type=int, default=20, help="Max document-like no-href controls to click on each page.")
    parser.add_argument("--login-wait-seconds", type=int, default=int(os.getenv("ROUTEONE_LOGIN_WAIT_SECONDS", "0")), help="Wait this long for manual login when a login page is detected.")
    parser.add_argument("--manual-handoff-seconds", type=int, default=int(os.getenv("ROUTEONE_MANUAL_HANDOFF_SECONDS", "0")), help="Keep Chrome open so you can log in and navigate to RouteOne rates/forms before scanning.")
    parser.add_argument("--headless", action="store_true", help="Run Chrome headless. Not recommended for first login.")
    parser.add_argument("--dry-run", action="store_true", help="Only rescan local Bank folders and write manifest.")
    parser.add_argument("--json", action="store_true", help="Print manifest JSON to stdout.")
    return parser.parse_args(argv)


def main(argv: list[str]) -> int:
    args = parse_args(argv)
    payload = sync_routeone_docs(args)
    if args.json:
        print(json.dumps(payload, indent=2))
    return 0 if payload.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
