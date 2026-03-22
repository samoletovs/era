"""Test company creation flow end-to-end on deployed app."""
import time
from playwright.sync_api import sync_playwright

BASE = "https://era-dev-api.blackdune-26b951eb.northeurope.azurecontainerapps.io"
DIR = "scripts/screenshots"

def test_create_company():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 900})

        # Go to onboarding
        page.goto(f"{BASE}/onboarding", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{DIR}/create-01-onboarding.png", full_page=True)

        # Search for a company
        search = page.locator("input[placeholder*='Dais']")
        search.fill("Microsoft")
        page.locator("button:has-text('Search')").click()
        page.wait_for_timeout(3000)
        page.screenshot(path=f"{DIR}/create-02-search.png", full_page=True)

        # Click first result
        results = page.locator(".search-result-card")
        count = results.count()
        print(f"Search results: {count}")
        if count == 0:
            print("No results found, trying 'Dais' instead")
            page.goto(f"{BASE}/onboarding", wait_until="networkidle")
            page.wait_for_timeout(1000)
            search = page.locator("input[placeholder*='Dais']")
            search.fill("Dais")
            page.locator("button:has-text('Search')").click()
            page.wait_for_timeout(3000)
            page.screenshot(path=f"{DIR}/create-02b-search-dais.png", full_page=True)
            results = page.locator(".search-result-card")
            count = results.count()
            print(f"Dais results: {count}")

        if count > 0:
            results.first.click()
            page.wait_for_timeout(1000)
            page.screenshot(path=f"{DIR}/create-03-confirm.png", full_page=True)

            # Verify confirm page
            confirm = page.locator("text=Confirm company details")
            if confirm.count() > 0:
                print("PASS: Confirm page shown")

                # Check for error messages before clicking
                pre_errors = page.locator("text=/Error:|Invalid token|COSMOS/i")
                if pre_errors.count() > 0:
                    print(f"FAIL: Pre-existing error: {pre_errors.first.text_content()}")
                else:
                    print("PASS: No pre-existing errors")

                # Click create
                btn = page.locator("button:has-text('Create this company')")
                btn.click()
                page.wait_for_timeout(8000)
                page.screenshot(path=f"{DIR}/create-04-result.png", full_page=True)

                # Check result
                current_text = page.locator("body").text_content() or ""
                if "Company created" in current_text:
                    print("PASS: Company created successfully!")
                elif "Setting up your company" in current_text:
                    print("PASS: Company creation in progress")
                    page.wait_for_timeout(10000)
                    page.screenshot(path=f"{DIR}/create-04b-wait.png", full_page=True)
                elif "Error" in current_text or "error" in current_text:
                    # Find specific error
                    err = page.locator("[style*='color']")
                    for i in range(err.count()):
                        t = err.nth(i).text_content()
                        if t and ("error" in t.lower() or "Error" in t):
                            print(f"FAIL: {t}")
                else:
                    print(f"UNKNOWN state: {current_text[:200]}")
            else:
                print("FAIL: Confirm page not shown")
        else:
            print("FAIL: No search results found at all")

        browser.close()

test_create_company()
