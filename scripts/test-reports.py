"""Screenshot all report tabs to verify layout alignment."""
from playwright.sync_api import sync_playwright
import time, os

SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

# Report tabs and their labels/selectors
TABS = [
    ("pl", "Profit & loss"),
    ("bs", "Balance sheet"),
    ("tb", "Trial balance"),
    ("ar-aging", "AR aging"),
    ("ap-aging", "AP aging"),
    ("vat", "VAT declaration"),
    ("annual", "Annual report"),
    ("budget", "Budget vs actual"),
]

PRESETS = ["This month", "Last month", "Q1", "Q2", "Q3", "Q4", "YTD", "Last year"]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto("http://localhost:5173")
    page.wait_for_load_state("networkidle")
    time.sleep(2)

    # Navigate to Reports page
    reports_link = page.locator("text=Reports").first
    if reports_link.is_visible():
        reports_link.click()
        page.wait_for_load_state("networkidle")
        time.sleep(1)

    # Screenshot each report tab with Q1 preset (should have data)
    for tab_id, tab_label in TABS:
        print(f"--- Tab: {tab_label} ---")
        btn = page.locator(f"button:has-text('{tab_label}')").first
        if btn.is_visible():
            btn.click()
            time.sleep(0.3)

        # Set Q1 preset to have a meaningful period
        q1_btn = page.locator("button:has-text('Q1')").last
        if q1_btn.is_visible():
            q1_btn.click()
            page.wait_for_load_state("networkidle")
            time.sleep(1)

        page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"report-{tab_id}.png"), full_page=True)
        print(f"  Saved report-{tab_id}.png")

    # Test Budget vs Actual with "Last year" preset specifically
    print("--- Budget vs Actual - Last year ---")
    budget_btn = page.locator("button:has-text('Budget vs actual')").first
    if budget_btn.is_visible():
        budget_btn.click()
        time.sleep(0.3)
    ly_btn = page.locator("button:has-text('Last year')").last
    if ly_btn.is_visible():
        ly_btn.click()
        page.wait_for_load_state("networkidle")
        time.sleep(1)
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"report-budget-last-year.png"), full_page=True)
    print("  Saved report-budget-last-year.png")

    # Also check P&L with Last year
    print("--- P&L - Last year ---")
    pl_btn = page.locator("button:has-text('Profit & loss')").first
    if pl_btn.is_visible():
        pl_btn.click()
        time.sleep(0.3)
    ly_btn = page.locator("button:has-text('Last year')").last
    if ly_btn.is_visible():
        ly_btn.click()
        page.wait_for_load_state("networkidle")
        time.sleep(1)
    page.screenshot(path=os.path.join(SCREENSHOTS_DIR, f"report-pl-last-year.png"), full_page=True)
    print("  Saved report-pl-last-year.png")

    # Check alignment: read the table structure for P&L
    print("\n--- P&L Table Structure ---")
    pl_btn2 = page.locator("button:has-text('Profit & loss')").first
    if pl_btn2.is_visible():
        pl_btn2.click()
        time.sleep(0.3)
    q1_btn2 = page.locator("button:has-text('Q1')").last
    if q1_btn2.is_visible():
        q1_btn2.click()
        page.wait_for_load_state("networkidle")
        time.sleep(1)

    # Check if report-table class is present  
    tables = page.locator("table.report-table").count()
    print(f"  Found {tables} report-table(s)")

    # Check section-label-row count
    section_rows = page.locator("tr.section-label-row").count()
    print(f"  Found {section_rows} section-label-row(s)")

    browser.close()
    print("\nDone!")
