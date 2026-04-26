import json
import os
import re
import shutil
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from Helpers import read_json
from colorama import Fore, Style
from selenium import webdriver
from selenium.common.exceptions import NoSuchElementException, TimeoutException
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.wait import WebDriverWait


class Lister:
    def __init__(self):
        self.driver_file = "chromedriver.exe"
        self.sleep_time = 1
        self.profile_dir = (Path("chrome-profile")).resolve()
        self.marketplace_vehicle_url = "https://www.facebook.com/marketplace/create/vehicle"
        chrome_options = webdriver.ChromeOptions()
        prefs = {"profile.default_content_setting_values.notifications": 2}
        chrome_options.add_experimental_option("prefs", prefs)
        chrome_options.add_argument("--start-maximized")
        chrome_options.add_argument(f"--user-data-dir={self.profile_dir}")
        chrome_options.add_argument("--profile-directory=Default")
        chrome_options.add_argument("--disable-notifications")
        self.profile_dir.mkdir(parents=True, exist_ok=True)

        chrome_binary = self._find_chrome_binary()
        if chrome_binary:
            chrome_options.binary_location = chrome_binary

        driver_path = Path("drivers") / self.driver_file
        if not driver_path.exists():
            raise FileNotFoundError(f"Missing ChromeDriver: {driver_path}")

        chrome_service = Service(executable_path=str(driver_path))
        self.driver = webdriver.Chrome(service=chrome_service, options=chrome_options)
        self.driver.implicitly_wait(10)

    def _find_chrome_binary(self):
        env_binary = os.getenv("CHROME_BINARY", "").strip()
        if env_binary and Path(env_binary).exists():
            return env_binary

        local_candidates = [
            Path("chrome-for-testing") / "chrome-win64" / "chrome.exe",
            Path("chrome-114") / "chrome-win64" / "chrome.exe",
            Path("chrome-win64") / "chrome.exe",
        ]
        for candidate in local_candidates:
            if candidate.exists():
                return str(candidate.resolve())

        system_candidates = [
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        ]
        for candidate in system_candidates:
            if Path(candidate).exists():
                return candidate

        for command in ("chrome", "chrome.exe"):
            resolved = shutil.which(command)
            if resolved:
                return resolved
        return None

    def read_accounts(self):
        return read_json("accounts")["accounts"]

    def _dismiss_cookie_banner(self):
        cookie_selectors = [
            (By.XPATH, "//button[contains(., 'Allow all cookies')]"),
            (By.XPATH, "//button[contains(., 'Accept all')]"),
            (By.XPATH, "//button[contains(., 'Only allow essential cookies')]"),
            (By.XPATH, "//button[contains(., 'Allow essential and optional cookies')]"),
            (By.XPATH, "//div[@role='button' and contains(., 'Accept')]"),
        ]
        for by, query in cookie_selectors:
            try:
                button = self.driver.find_element(by, query)
                if button.is_displayed() and button.is_enabled():
                    button.click()
                    time.sleep(1)
                    return True
            except Exception:
                continue
        return False

    def _summarize_inputs(self):
        snippets = []
        try:
            inputs = self.driver.find_elements(By.TAG_NAME, "input")[:20]
            for element in inputs:
                try:
                    snippets.append(
                        {
                            "id": element.get_attribute("id"),
                            "name": element.get_attribute("name"),
                            "type": element.get_attribute("type"),
                            "autocomplete": element.get_attribute("autocomplete"),
                            "placeholder": element.get_attribute("placeholder"),
                            "aria_label": element.get_attribute("aria-label"),
                        }
                    )
                except Exception:
                    continue
        except Exception:
            pass
        return snippets

    def _visible_named_input(self, name):
        for element in self.driver.find_elements(By.NAME, name):
            try:
                if element.is_displayed():
                    return element
            except Exception:
                continue
        return None

    def _page_has_login_form(self):
        return bool(self._visible_named_input("email") and self._visible_named_input("pass"))

    def _body_text(self):
        try:
            return (self.driver.find_element(By.TAG_NAME, "body").text or "").strip()
        except Exception:
            return ""

    def _looks_like_vehicle_form(self):
        body_text = self._body_text().lower()
        if "sell a vehicle" in body_text or "vehicle details" in body_text:
            return True
        try:
            if self.driver.find_elements(By.CSS_SELECTOR, "input[type='file']"):
                return True
        except Exception:
            pass
        return bool(
            self._find_field_candidate(["price"], prefer_multiline=False, include_textboxes=False)
            or self._find_field_candidate(["mileage", "odometer"], prefer_multiline=False, include_textboxes=False)
            or self._find_field_candidate(["description"], prefer_multiline=True, include_textboxes=True)
        )

    def _session_status(self):
        self.driver.get(self.marketplace_vehicle_url)
        time.sleep(4)
        self._dismiss_cookie_banner()

        current_url = self.driver.current_url or ""
        lowered_url = current_url.lower()
        body_preview = self._body_text()[:600]
        if "two_factor" in lowered_url or "checkpoint" in lowered_url or "remember_browser" in lowered_url:
            return {
                "ok": False,
                "authenticated": False,
                "state": "checkpoint",
                "current_url": current_url,
                "title": self.driver.title,
                "message": "Facebook requires one-time checkpoint/two-factor completion in the saved browser profile.",
                "inputs": self._summarize_inputs(),
                "body_preview": body_preview,
            }

        if self._page_has_login_form():
            return {
                "ok": False,
                "authenticated": False,
                "state": "login_required",
                "current_url": current_url,
                "title": self.driver.title,
                "inputs": self._summarize_inputs(),
                "body_preview": body_preview,
            }

        form_ready = self._looks_like_vehicle_form()
        return {
            "ok": form_ready,
            "authenticated": True,
            "state": "vehicle_form_ready" if form_ready else "authenticated_no_form",
            "current_url": current_url,
            "title": self.driver.title,
            "body_preview": body_preview,
        }

    def _scroll_into_view(self, element):
        try:
            self.driver.execute_script(
                "arguments[0].scrollIntoView({block:'center', inline:'nearest'});",
                element,
            )
        except Exception:
            pass

    def _click_element(self, element):
        self._scroll_into_view(element)
        try:
            element.click()
            return True
        except Exception:
            try:
                self.driver.execute_script("arguments[0].click();", element)
                return True
            except Exception:
                return False

    def _type_value(self, element, value, *, multiline=False):
        text = str(value or "").strip()
        if not text:
            return False
        self._scroll_into_view(element)
        tag_name = (element.tag_name or "").lower()
        content_editable = (element.get_attribute("contenteditable") or "").lower() == "true"
        self._click_element(element)
        try:
            element.send_keys(Keys.CONTROL, "a")
            element.send_keys(Keys.BACKSPACE)
        except Exception:
            pass
        try:
            if tag_name in {"input", "textarea"}:
                element.clear()
        except Exception:
            pass
        try:
            element.send_keys(text)
            return True
        except Exception:
            pass

        try:
            if content_editable or tag_name == "div":
                self.driver.execute_script(
                    """
                    const el = arguments[0];
                    const value = arguments[1];
                    el.focus();
                    el.textContent = value;
                    el.dispatchEvent(new InputEvent('input', {bubbles: true, data: value}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    """,
                    element,
                    text,
                )
            else:
                self.driver.execute_script(
                    """
                    const el = arguments[0];
                    const value = arguments[1];
                    el.focus();
                    el.value = value;
                    el.dispatchEvent(new Event('input', {bubbles: true}));
                    el.dispatchEvent(new Event('change', {bubbles: true}));
                    """,
                    element,
                    text,
                )
            return True
        except Exception:
            return False

    def _find_field_candidate(self, terms, *, prefer_multiline=False, include_textboxes=True):
        normalized = [str(term or "").strip().lower() for term in terms if str(term or "").strip()]
        if not normalized:
            return None

        selector = [
            "input:not([type='hidden']):not([type='file'])",
            "textarea",
        ]
        if include_textboxes:
            selector.extend(["[role='textbox']", "[contenteditable='true']"])

        script = """
        const terms = arguments[0];
        const preferMultiline = arguments[1];
        const selector = arguments[2];
        const nodes = Array.from(document.querySelectorAll(selector));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;

          let context = '';
          context += ' ' + (element.getAttribute('aria-label') || '');
          context += ' ' + (element.getAttribute('placeholder') || '');
          context += ' ' + (element.getAttribute('name') || '');
          context += ' ' + (element.getAttribute('id') || '');

          const wrappingLabel = element.closest('label');
          if (wrappingLabel) context += ' ' + wrappingLabel.innerText;
          if (element.id) {
            const forLabel = document.querySelector(`label[for="${element.id.replace(/"/g, '\\"')}"]`);
            if (forLabel) context += ' ' + forLabel.innerText;
          }
          const container = element.closest('div, form, section, label');
          if (container) context += ' ' + container.innerText.slice(0, 350);

          const haystack = normalize(context);
          if (!haystack) return -1;

          let score = 0;
          for (const term of terms) {
            if (haystack.includes(term)) {
              score += haystack.indexOf(term) < 120 ? 6 : 3;
            }
          }
          if (!score) return -1;

          const tagName = (element.tagName || '').toLowerCase();
          if (preferMultiline && (tagName === 'textarea' || (element.getAttribute('role') || '') === 'textbox')) {
            score += 6;
          }
          if (!preferMultiline && tagName === 'input') {
            score += 4;
          }
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(script, normalized, prefer_multiline, ",".join(selector))
        except Exception:
            return None

    def _find_clickable_candidate(self, terms):
        normalized = [str(term or "").strip().lower() for term in terms if str(term or "").strip()]
        if not normalized:
            return None

        selector = ",".join(
            [
                "[role='combobox']",
                "[aria-haspopup='listbox']",
                "button",
                "[role='button']",
                "input:not([type='hidden']):not([type='file'])",
            ]
        )
        script = """
        const terms = arguments[0];
        const selector = arguments[1];
        const nodes = Array.from(document.querySelectorAll(selector));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;

          let context = '';
          context += ' ' + (element.innerText || '');
          context += ' ' + (element.getAttribute('aria-label') || '');
          context += ' ' + (element.getAttribute('placeholder') || '');
          context += ' ' + (element.getAttribute('name') || '');
          context += ' ' + (element.getAttribute('id') || '');
          const container = element.closest('div, form, section, label');
          if (container) context += ' ' + container.innerText.slice(0, 350);
          const haystack = normalize(context);
          if (!haystack) return -1;

          let score = 0;
          for (const term of terms) {
            if (haystack.includes(term)) {
              score += haystack.indexOf(term) < 120 ? 5 : 2;
            }
          }
          if (!score) return -1;

          const role = (element.getAttribute('role') || '').toLowerCase();
          if (role === 'combobox') score += 5;
          if (element.getAttribute('aria-haspopup') === 'listbox') score += 3;
          if ((element.tagName || '').toLowerCase() === 'button') score += 2;
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(script, normalized, selector)
        except Exception:
            return None

    def _find_option_candidate(self, values):
        normalized = [str(value or "").strip().lower() for value in values if str(value or "").strip()]
        if not normalized:
            return None

        selector = ",".join(["[role='option']", "li", "button", "[role='button']", "span", "div"])
        script = """
        const values = arguments[0];
        const selector = arguments[1];
        const nodes = Array.from(document.querySelectorAll(selector));
        const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim().toLowerCase();

        const scoreElement = (element) => {
          if (!element || !element.isConnected) return -1;
          const rect = element.getBoundingClientRect();
          if (rect.width < 2 || rect.height < 2) return -1;
          const style = window.getComputedStyle(element);
          if (style.visibility === 'hidden' || style.display === 'none') return -1;

          const text = normalize(element.innerText || element.getAttribute('aria-label') || '');
          if (!text || text.length > 220) return -1;
          let score = -1;
          for (const value of values) {
            if (text === value) score = Math.max(score, 100);
            else if (text.startsWith(value)) score = Math.max(score, 90);
            else if (text.includes(value)) score = Math.max(score, 70);
          }
          return score;
        };

        let best = null;
        let bestScore = -1;
        for (const element of nodes) {
          const score = scoreElement(element);
          if (score > bestScore) {
            best = element;
            bestScore = score;
          }
        }
        return best;
        """
        try:
            return self.driver.execute_script(script, normalized, selector)
        except Exception:
            return None

    def _select_option(self, values):
        option = self._find_option_candidate(values)
        if not option:
            return False
        return self._click_element(option)

    def _set_field_value(self, terms, value, *, required=False, multiline=False, option_values=None):
        clean_value = str(value or "").strip()
        if not clean_value:
            return False

        text_candidate = self._find_field_candidate(
            terms,
            prefer_multiline=multiline,
            include_textboxes=True,
        )
        if text_candidate and self._type_value(text_candidate, clean_value, multiline=multiline):
            if option_values:
                time.sleep(1)
                self._select_option(option_values)
            return True

        clickable = self._find_clickable_candidate(terms)
        if clickable and self._click_element(clickable):
            time.sleep(1)
            if self._select_option(option_values or [clean_value]):
                return True

        if required:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "required facebook vehicle field was not found",
                        "field_terms": terms,
                        "value": clean_value,
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )
        return False

    def _parse_title_parts(self, title):
        text = str(title or "").strip()
        match = re.match(r"^(?P<year>(?:19|20)\d{2})\s+(?P<rest>.+)$", text)
        if not match:
            return {"year": "", "make": "", "model": "", "trim": ""}
        rest_tokens = match.group("rest").split()
        return {
            "year": match.group("year"),
            "make": rest_tokens[0] if len(rest_tokens) > 0 else "",
            "model": rest_tokens[1] if len(rest_tokens) > 1 else "",
            "trim": " ".join(rest_tokens[2:]) if len(rest_tokens) > 2 else "",
        }

    def _normalized_price(self, value):
        digits = re.sub(r"[^\d]", "", str(value or ""))
        return digits or str(value or "").strip()

    def _normalized_mileage(self, value):
        digits = re.sub(r"[^\d]", "", str(value or ""))
        return digits

    def _infer_body_style(self, title):
        lowered = str(title or "").lower()
        if any(token in lowered for token in ["pacifica", "voyager", "caravan", "minivan"]):
            return "Minivan"
        if any(token in lowered for token in ["durango", "journey", "hornet", "grand cherokee", "wrangler", "suv"]):
            return "SUV"
        if any(token in lowered for token in ["charger", "dart", "300", "sedan"]):
            return "Sedan"
        if any(token in lowered for token in ["1500", "2500", "3500", "truck", "pickup", "ram"]):
            return "Truck"
        return ""

    def _infer_fuel_type(self, item):
        blob = " ".join(
            [
                str(item.get("title") or ""),
                str(item.get("engine") or ""),
                str(item.get("description") or ""),
            ]
        ).lower()
        if any(token in blob for token in ["electric", "ev", "bev"]):
            return "Electric"
        if any(token in blob for token in ["hybrid", "plug-in", "phev"]):
            return "Hybrid"
        if any(token in blob for token in ["diesel", "eco diesel"]):
            return "Diesel"
        return "Gasoline"

    def _normalize_color(self, value):
        lowered = str(value or "").strip().lower()
        if not lowered:
            return ""

        token_map = [
            ("black", "Black"),
            ("white", "White"),
            ("ivory", "White"),
            ("pearl", "White"),
            ("silver", "Silver"),
            ("gray", "Gray"),
            ("grey", "Gray"),
            ("granite", "Gray"),
            ("charcoal", "Gray"),
            ("graphite", "Gray"),
            ("blue", "Blue"),
            ("navy", "Blue"),
            ("red", "Red"),
            ("burgundy", "Red"),
            ("maroon", "Red"),
            ("green", "Green"),
            ("olive", "Green"),
            ("brown", "Brown"),
            ("tan", "Brown"),
            ("beige", "Beige"),
            ("orange", "Orange"),
            ("yellow", "Yellow"),
            ("gold", "Gold"),
            ("purple", "Purple"),
            ("violet", "Purple"),
        ]
        for token, label in token_map:
            if token in lowered:
                return label
        return str(value or "").strip()

    def _upload_images(self, item):
        images = item.get("images") or []
        paths = [os.path.abspath(f"images/{image['file']}") for image in images if image.get("file")]
        if not paths:
            raise RuntimeError(json.dumps({"message": "no images supplied for facebook vehicle publish"}))

        log("Uploading Images", "main")
        upload = WebDriverWait(self.driver, 30).until(
            lambda driver: driver.find_element(By.CSS_SELECTOR, "input[type='file']")
        )
        self.driver.execute_script(
            """
            arguments[0].removeAttribute('hidden');
            arguments[0].style.display = 'block';
            arguments[0].style.visibility = 'visible';
            arguments[0].style.opacity = 1;
            """,
            upload,
        )
        upload.send_keys("\n".join(paths[:20]))
        log("Uploaded Images Successfully.", "success")

    def _publish(self):
        next_labels = ["next", "continue"]
        publish_labels = ["publish", "post", "list"]

        next_button = self._find_clickable_candidate(next_labels)
        if next_button:
            log("Clicking Next", "main")
            self._click_element(next_button)
            time.sleep(2)

        publish_button = self._find_clickable_candidate(publish_labels)
        if not publish_button:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "publish button not found on facebook vehicle form",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )

        log("Clicking Publish", "main")
        self._click_element(publish_button)

        try:
            WebDriverWait(self.driver, 60).until(
                lambda driver: (
                    "/marketplace/create/" not in (driver.current_url or "").lower()
                    or any(
                        token in (driver.find_element(By.TAG_NAME, "body").text or "").lower()
                        for token in ["your listing", "marketplace", "boost listing", "pending review"]
                    )
                )
            )
        except TimeoutException as exc:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook publish did not complete in time",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            ) from exc

    def login(self, account_id):
        registered_accounts = self.read_accounts()
        account_info = list(filter(lambda acc: acc["id"] == account_id, registered_accounts))[0]
        log('Logging in as "%s" ..' % account_info["name"], "main")

        status = self._session_status()
        if status.get("authenticated") and status.get("ok"):
            log("Existing authenticated session detected.", "success")
            return True
        if status.get("state") == "checkpoint":
            raise RuntimeError(json.dumps(status))

        self.driver.get("https://www.facebook.com/login")
        time.sleep(3)
        self._dismiss_cookie_banner()
        current_url = (self.driver.current_url or "").lower()
        if "two_factor" in current_url or "checkpoint" in current_url or "remember_browser" in current_url:
            raise RuntimeError(
                json.dumps(
                    {
                        "ok": False,
                        "authenticated": False,
                        "state": "checkpoint",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "message": "Facebook requires one-time checkpoint/two-factor completion in the saved browser profile.",
                        "inputs": self._summarize_inputs(),
                    }
                )
            )

        email_input = self._visible_named_input("email")
        password_input = self._visible_named_input("pass")
        if not email_input or not password_input:
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook login form was not found",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )

        self._type_value(email_input, account_info["email"])
        self._type_value(password_input, account_info["password"])
        password_input.send_keys(Keys.ENTER)

        try:
            WebDriverWait(self.driver, 90).until(
                lambda driver: (
                    "login" not in (driver.current_url or "").lower()
                    or "two_factor" in (driver.current_url or "").lower()
                    or "checkpoint" in (driver.current_url or "").lower()
                )
            )
        except TimeoutException:
            pass

        status = self._session_status()
        if status.get("authenticated") and status.get("ok"):
            log("Logged in Successfully.", "success")
            return True
        raise RuntimeError(json.dumps(status))

    def list(self, item):
        status = self._session_status()
        if not status.get("authenticated") or not status.get("ok"):
            raise RuntimeError(json.dumps(status))

        self.driver.get(self.marketplace_vehicle_url)
        time.sleep(4)

        if not self._looks_like_vehicle_form():
            raise RuntimeError(
                json.dumps(
                    {
                        "message": "facebook vehicle form did not load",
                        "current_url": self.driver.current_url,
                        "title": self.driver.title,
                        "inputs": self._summarize_inputs(),
                    }
                )
            )

        title_parts = self._parse_title_parts(item.get("title"))
        exterior_color = self._normalize_color(item.get("exterior"))
        interior_color = self._normalize_color(item.get("interior"))
        self._set_field_value(
            ["vehicle type"],
            item.get("vehicle_type") or "Car/Truck",
            option_values=[item.get("vehicle_type") or "Car/Truck", "Car/Truck"],
        )
        time.sleep(self.sleep_time)

        self._upload_images(item)
        time.sleep(self.sleep_time)

        self._set_field_value(["price"], self._normalized_price(item.get("price")), required=True)
        time.sleep(self.sleep_time)

        self._set_field_value(["year"], title_parts.get("year"), required=True)
        self._set_field_value(
            ["make"],
            title_parts.get("make"),
            required=True,
            option_values=[title_parts.get("make", "")],
        )
        self._set_field_value(
            ["model"],
            title_parts.get("model"),
            required=True,
            option_values=[title_parts.get("model", "")],
        )
        self._set_field_value(["mileage", "odometer"], self._normalized_mileage(item.get("mileage")))
        self._set_field_value(
            ["body style"],
            item.get("body_style") or self._infer_body_style(item.get("title")),
            option_values=[item.get("body_style") or self._infer_body_style(item.get("title"))],
        )
        self._set_field_value(
            ["vehicle condition", "condition"],
            item.get("condition") or "Good",
            option_values=[item.get("condition") or "Good", "Good", "Used"],
        )
        self._set_field_value(
            ["fuel type"],
            item.get("fuel_type") or self._infer_fuel_type(item),
            option_values=[item.get("fuel_type") or self._infer_fuel_type(item), "Gasoline", "Hybrid", "Electric", "Diesel"],
        )
        self._set_field_value(
            ["transmission"],
            item.get("transmission"),
            option_values=[item.get("transmission") or "", "Automatic", "Manual"],
        )
        self._set_field_value(
            ["exterior color", "exterior"],
            exterior_color,
            option_values=[exterior_color or ""],
        )
        self._set_field_value(
            ["interior color", "interior"],
            interior_color,
            option_values=[interior_color or ""],
        )
        self._set_field_value(["description"], item.get("description"), multiline=True)
        self._set_field_value(["location"], item.get("location"), option_values=[item.get("location") or ""])
        time.sleep(self.sleep_time)

        self._publish()
        log("Clicked Publish Successfully.", "success")
        return True

    def close(self):
        try:
            self.driver.quit()
        except Exception:
            pass


def log(msg, type=None):
    now = datetime.now()
    current_time = now.strftime("%H:%M:%S")
    msg = "[%s] : %s" % (current_time, msg)
    if type is not None:
        if type == "failure":
            msg = Fore.RED + "\t- " + msg + Style.RESET_ALL
        elif type == "success":
            msg = Fore.GREEN + "\t+ " + msg + Style.RESET_ALL
        elif type == "sub":
            msg = Fore.WHITE + "\t> " + msg + Style.RESET_ALL
        elif type == "main":
            msg = Fore.WHITE + ">> " + msg + Style.RESET_ALL
        else:
            msg = msg + Style.RESET_ALL
    else:
        msg = msg + Style.RESET_ALL
    print(msg)
