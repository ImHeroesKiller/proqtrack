import json
import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("PROQTRACK_BASE_URL", "https://proqtrack.arywibowo.workers.dev")
CRED_FILE = Path(sys.argv[1])
TOKEN_FILE = Path(sys.argv[2])
ARTIFACT_DIR = Path(sys.argv[3])
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

with CRED_FILE.open("r", encoding="utf-8") as fh:
    creds = json.load(fh)

ROLE_CASES = [
    ("merchandiser", "employee", {"width": 390, "height": 844}, ["#/myday", "#/myvisits", "#/mysales", "#/surveys"]),
    ("spg", "employee", {"width": 390, "height": 844}, ["#/myday", "#/myvisits", "#/mysales", "#/surveys"]),
    ("supervisor", "supervisor", {"width": 430, "height": 932}, ["#/", "#/myday", "#/visits", "#/reports"]),
    ("manager", "manager", {"width": 1440, "height": 900}, ["#/", "#/employees", "#/projects", "#/reports", "#/reports/schedules"]),
    ("head", "head", {"width": 1440, "height": 900}, ["#/", "#/employees", "#/reports", "#/reports/approvals", "#/settings"]),
    ("superadmin", "superadmin", {"width": 1440, "height": 900}, ["#/", "#/organizations", "#/reports", "#/settings"]),
]

summary = {"baseUrl": BASE_URL, "roles": [], "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
tokens = {}

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for label, expected_role, viewport, routes in ROLE_CASES:
        row = creds[label]
        context = browser.new_context(viewport=viewport)
        page = context.new_page()
        page_errors = []
        console_errors = []
        page.on("pageerror", lambda exc, bag=page_errors: bag.append(str(exc)))
        page.on("console", lambda msg, bag=console_errors: bag.append(msg.text) if msg.type == "error" else None)

        response = page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
        if not response or response.status >= 400:
            raise AssertionError(f"{label}: initial page failed: {getattr(response, 'status', None)}")
        page.wait_for_selector("#loginEmail", timeout=30000)
        page.fill("#loginEmail", row["email"])
        page.fill("#loginPassword", row["password"])

        if label == "merchandiser":
            toggle = page.locator(".password-toggle")
            toggle.click()
            if page.locator("#loginPassword").get_attribute("type") != "text":
                raise AssertionError("merchandiser: password visibility toggle failed")
            toggle.click()
            if page.locator("#loginPassword").get_attribute("type") != "password":
                raise AssertionError("merchandiser: password hide toggle failed")
            page.locator("#loginPassword").press("Enter")
        else:
            page.locator('button[type="submit"]').click()

        page.wait_for_function(
            "(role) => window.FT?.state?.loggedIn === true && window.FT?.state?.account?.role === role",
            expected_role,
            timeout=45000,
        )
        page.wait_for_function("() => window.__PROQTRACK_BOOT__?.stage === 'ready'", timeout=30000)

        account = page.evaluate("() => ({role: window.FT.state.account.role, organizationId: window.FT.state.account.organizationId, route: location.hash})")
        if account["role"] != expected_role:
            raise AssertionError(f"{label}: role mismatch {account['role']} != {expected_role}")
        if account.get("organizationId") != "ORG-DEFAULT":
            raise AssertionError(f"{label}: tenant mismatch {account.get('organizationId')}")

        token = page.evaluate("() => sessionStorage.getItem('proqtrack_api_token_v1') || ''")
        if not token:
            raise AssertionError(f"{label}: API session token missing after UI login")
        tokens[label] = token

        visible_text = page.locator("body").inner_text().lower()
        for forbidden in ("cloudflare", "github", " d1 ", " r2 ", "stack trace"):
            if forbidden in visible_text:
                raise AssertionError(f"{label}: technical implementation term leaked to UI: {forbidden.strip()}")

        route_results = []
        for route in routes:
            page.evaluate("(r) => { location.hash = r; window.dispatchEvent(new Event('hashchange')); }", route)
            page.wait_for_timeout(450)
            content_text = page.locator("#app").inner_text().strip()
            if len(content_text) < 20:
                raise AssertionError(f"{label}: route {route} rendered empty content")
            if "Aksi tidak dapat dijalankan" in content_text or "Data belum dapat dimuat" in content_text:
                raise AssertionError(f"{label}: route {route} displayed runtime error")
            route_results.append({"route": route, "chars": len(content_text)})

        if viewport["width"] <= 430:
            overflow = page.evaluate("() => Math.max(0, document.documentElement.scrollWidth - window.innerWidth)")
            if overflow > 3:
                raise AssertionError(f"{label}: mobile horizontal overflow {overflow}px")

        screenshot = ARTIFACT_DIR / f"{label}.png"
        page.screenshot(path=str(screenshot), full_page=True)
        role_summary = {
            "persona": label,
            "role": expected_role,
            "viewport": viewport,
            "initialRoute": account["route"],
            "routes": route_results,
            "pageErrors": page_errors,
            "consoleErrorCount": len(console_errors),
            "screenshot": screenshot.name,
        }
        if page_errors:
            raise AssertionError(f"{label}: page errors: {page_errors}")
        summary["roles"].append(role_summary)
        context.close()

    browser.close()

summary["completedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
TOKEN_FILE.write_text(json.dumps(tokens), encoding="utf-8")
os.chmod(TOKEN_FILE, 0o600)
(ARTIFACT_DIR / "ui-summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
print("Production browser UAT PASS: 6 personas, mobile/desktop routes, login, password toggle, tenant binding, runtime boot")
