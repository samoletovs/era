"""
Comprehensive smoke test of the deployed ERA app.
Tests every page, nav link, buttons, and the company creation flow.
"""
import sys
import json
import time
from playwright.sync_api import sync_playwright

BASE = "https://era-dev-api.blackdune-26b951eb.northeurope.azurecontainerapps.io"
SCREENSHOTS_DIR = "scripts/screenshots"

PAGES = [
    ("/", "Dashboard"),
    ("/chat", "Agent chat"),
    ("/invoices", "Invoices"),
    ("/upload", "Upload invoice"),
    ("/bank", "Bank recon"),
    ("/recurring", "Recurring"),
    ("/accounting", "Accounting"),
    ("/accounts", "Chart of accounts"),
    ("/contacts", "Contacts"),
    ("/items", "Items"),
    ("/fixed-assets", "Fixed assets"),
    ("/reports", "Reports"),
    ("/events", "Event log"),
    ("/settings", "Settings"),
]

results = []

def log(status, msg):
    icon = "PASS" if status else "FAIL"
    results.append((status, msg))
    print(f"  [{icon}] {msg}")

def test_health():
    """Test health endpoint returns 200"""
    import urllib.request
    try:
        res = urllib.request.urlopen(f"{BASE}/health", timeout=10)
        data = json.loads(res.read())
        log(data.get("status") == "healthy", f"Health endpoint: {data}")
    except Exception as e:
        log(False, f"Health endpoint failed: {e}")

def test_api_companies():
    """Test API companies endpoint"""
    import urllib.request
    try:
        req = urllib.request.Request(f"{BASE}/api/companies", headers={"Authorization": "Bearer dev-bypass"})
        res = urllib.request.urlopen(req, timeout=10)
        data = json.loads(res.read())
        log(True, f"API /companies: {len(data.get('data', []))} companies")
        return data.get("data", [])
    except Exception as e:
        log(False, f"API /companies failed: {e}")
        return []

def run_tests():
    print(f"\n{'='*60}")
    print(f"ERA Smoke Test — {BASE}")
    print(f"{'='*60}\n")

    # 1. Health check
    print("[1] API health check")
    test_health()

    # 2. API companies
    print("\n[2] API companies endpoint")
    companies = test_api_companies()

    # 3. Browser tests
    print("\n[3] Browser tests — all pages")
    import os
    os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        # Navigate to home
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        # Check if we're on onboarding or dashboard
        url = page.url
        if "/onboarding" in url or page.locator("text=Add a company").first.is_visible():
            print("\n  App shows onboarding — no companies yet. Testing onboarding flow.")
            log(True, "Onboarding page loads correctly")
            page.screenshot(path=f"{SCREENSHOTS_DIR}/01-onboarding.png", full_page=True)

            # Test company search
            print("\n[4] Company search flow")
            search_input = page.locator("input[placeholder*='Dais']")
            if search_input.count() > 0:
                search_input.fill("Dais")
                log(True, "Search input accepts text")

                search_btn = page.locator("button:has-text('Search')")
                search_btn.click()
                page.wait_for_timeout(3000)
                page.screenshot(path=f"{SCREENSHOTS_DIR}/02-search-results.png", full_page=True)

                # Check for results
                result_items = page.locator(".result-item, .search-result, tr, .result-row")
                if result_items.count() > 0:
                    log(True, f"Search returned {result_items.count()} result elements")

                    # Click first result
                    first_result = result_items.first
                    first_result.click()
                    page.wait_for_timeout(1000)
                    page.screenshot(path=f"{SCREENSHOTS_DIR}/03-confirm-company.png", full_page=True)

                    # Should be on confirm step
                    confirm_heading = page.locator("text=Confirm company details")
                    if confirm_heading.count() > 0:
                        log(True, "Confirm company details page shown")

                        # Test Create button
                        create_btn = page.locator("button:has-text('Create this company')")
                        if create_btn.count() > 0:
                            log(True, "Create this company button visible")
                            create_btn.click()
                            page.wait_for_timeout(5000)  # Wait for creation
                            page.screenshot(path=f"{SCREENSHOTS_DIR}/04-after-create.png", full_page=True)

                            # Check outcome
                            error_elem = page.locator("text=/Error|error|Failed/i")
                            success_elem = page.locator("text=Company created")
                            creating_elem = page.locator("text=Setting up your company")

                            if success_elem.count() > 0:
                                log(True, "Company created successfully!")
                                # Click go to dashboard
                                dash_btn = page.locator("button:has-text('Go to dashboard')")
                                if dash_btn.count() > 0:
                                    dash_btn.click()
                                    page.wait_for_timeout(2000)
                            elif creating_elem.count() > 0:
                                log(True, "Company creation in progress (spinner shown)")
                                page.wait_for_timeout(10000)
                                page.screenshot(path=f"{SCREENSHOTS_DIR}/04b-create-wait.png", full_page=True)
                            elif error_elem.count() > 0:
                                error_text = error_elem.first.text_content()
                                log(False, f"Company creation error: {error_text}")
                            else:
                                log(True, "Company creation initiated (checking page state)")
                        else:
                            log(False, "Create button not found")
                    else:
                        log(False, "Confirm page not shown after selecting company")
                else:
                    # Maybe no results for that query
                    no_results = page.locator("text=No companies found")
                    if no_results.count() > 0:
                        log(True, "Search returned no results (expected for some queries)")
                    else:
                        log(False, "No search results and no error message")
            else:
                log(False, "Search input not found on onboarding")
        else:
            print("  App loaded with existing company — testing all pages")

        # Now test all nav pages (whether we just created a company or had one)
        print("\n[5] Testing all navigation pages")
        page.goto(BASE, wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(2000)

        # Take dashboard screenshot
        page.screenshot(path=f"{SCREENSHOTS_DIR}/05-dashboard.png", full_page=True)
        log(True, f"Home page loaded: {page.url}")

        for route, name in PAGES:
            try:
                page.goto(f"{BASE}{route}", wait_until="networkidle", timeout=15000)
                page.wait_for_timeout(1000)

                # Check page loaded (no blank page)
                body_text = page.locator("body").text_content() or ""
                has_content = len(body_text.strip()) > 10

                # Check for error displays
                error_visible = page.locator("text=/COSMOS_ENDPOINT not set|COSMOS_KEY not set|Internal Server Error/i").count() > 0

                safe_name = name.replace(" ", "-").lower()
                page.screenshot(path=f"{SCREENSHOTS_DIR}/page-{safe_name}.png", full_page=True)

                if error_visible:
                    log(False, f"{name} ({route}): shows error")
                elif has_content:
                    log(True, f"{name} ({route}): loaded OK")
                else:
                    log(False, f"{name} ({route}): blank page")
            except Exception as e:
                log(False, f"{name} ({route}): {e}")

        # 6. Test sidebar navigation links exist
        print("\n[6] Sidebar nav links")
        page.goto(BASE, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(1000)
        nav_links = page.locator("nav a")
        link_count = nav_links.count()
        log(link_count >= 10, f"Sidebar has {link_count} nav links (expected ≥10)")

        # 7. Test feedback button
        print("\n[7] Feedback button")
        fab = page.locator(".feedback-fab")
        if fab.count() > 0:
            fab.click()
            page.wait_for_timeout(500)
            popover = page.locator(".feedback-popover")
            log(popover.count() > 0, "Feedback popover opens on click")
            page.screenshot(path=f"{SCREENSHOTS_DIR}/07-feedback.png", full_page=True)
            # Close it
            fab.click()
        else:
            log(False, "Feedback FAB not found")

        # 8. Console errors
        print("\n[8] Console errors")
        real_errors = [e for e in console_errors if "favicon" not in e.lower() and "devtools" not in e.lower()]
        if real_errors:
            for e in real_errors[:5]:
                log(False, f"Console error: {e[:120]}")
        else:
            log(True, "No console errors detected")

        browser.close()

    # Summary
    passed = sum(1 for s, _ in results if s)
    failed = sum(1 for s, _ in results if not s)
    print(f"\n{'='*60}")
    print(f"Results: {passed} passed, {failed} failed, {passed+failed} total")
    print(f"Screenshots saved to {SCREENSHOTS_DIR}/")
    print(f"{'='*60}\n")

    if failed > 0:
        print("FAILURES:")
        for s, msg in results:
            if not s:
                print(f"  - {msg}")
        return 1
    return 0

if __name__ == "__main__":
    sys.exit(run_tests())
