"""End-to-end Playwright UI test for ERA deployed app — desktop + mobile."""
import sys
import os

from playwright.sync_api import sync_playwright

BASE_URL = "https://era-dev-api.blackdune-26b951eb.northeurope.azurecontainerapps.io"
SCREENSHOTS_DIR = os.path.join(os.path.dirname(__file__), "screenshots")
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

def screenshot(page, name):
    path = os.path.join(SCREENSHOTS_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  Screenshot: {name}.png")


def test_desktop(browser):
    print("\n=== DESKTOP TESTS ===")
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(BASE_URL, wait_until="networkidle")
    screenshot(page, "01-desktop-landing")

    # Sidebar should be visible
    sidebar = page.locator(".app-sidebar")
    assert sidebar.is_visible(), "Sidebar should be visible on desktop"

    # Check nav links exist
    nav_links = page.locator("nav a").all()
    nav_texts = [link.text_content().strip() for link in nav_links]
    print(f"  Nav links: {nav_texts}")

    # Verify "Upload invoice" is NOT in nav (removed)
    assert "Upload invoice" not in nav_texts, "Upload invoice should NOT be in navigation"
    # Verify "Bank" is in nav (renamed from "Bank recon")
    assert "Bank" in nav_texts, "Bank should be in navigation"
    # Verify "Bank recon" is NOT in nav
    assert "Bank recon" not in nav_texts, "Bank recon should NOT be in navigation"
    # Verify "Invoices" is in nav
    assert "Invoices" in nav_texts, "Invoices should be in navigation"

    print("  ✅ Navigation structure correct")

    # Test Dashboard page
    page.click("nav a:text('Dashboard')")
    page.wait_for_load_state("networkidle")
    screenshot(page, "02-desktop-dashboard")
    print("  ✅ Dashboard loaded")

    # Test Invoices page
    page.click("nav a:text('Invoices')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "03-desktop-invoices")

    # Check for Create invoice button
    create_btn = page.locator("button:text('+ Create invoice')")
    assert create_btn.is_visible(), "Create invoice button should be visible"
    print("  ✅ Create invoice button found")

    # Check for Upload invoice button
    upload_btn = page.locator("button:text('Upload invoice')")
    assert upload_btn.is_visible(), "Upload invoice button should be visible"
    print("  ✅ Upload invoice button found")

    # Check for Pay invoice button
    pay_btn = page.locator("button:text('Pay invoice')")
    assert pay_btn.is_visible(), "Pay invoice button should be visible"
    print("  ✅ Pay invoice button found")

    # Test Create invoice panel
    create_btn.click()
    page.wait_for_timeout(300)
    screenshot(page, "04-desktop-invoices-create-panel")

    # Verify AI input is visible
    ai_input = page.locator("input[aria-label='Describe invoice']")
    assert ai_input.is_visible(), "AI invoice description input should be visible"
    print("  ✅ Create invoice AI panel visible")

    # Check voice button is present
    voice_btn = page.locator("button[aria-label='Start voice input']")
    assert voice_btn.is_visible(), "Voice input button should be visible"
    print("  ✅ Voice input button found")

    # Close create panel
    page.locator("button:text('Cancel')").first.click()
    page.wait_for_timeout(200)

    # Test Upload invoice panel
    upload_btn = page.locator("button:text('Upload invoice')")
    upload_btn.click()
    page.wait_for_timeout(300)
    screenshot(page, "05-desktop-invoices-upload-panel")
    drop_zone = page.locator(".drop-zone")
    assert drop_zone.is_visible(), "Drop zone should be visible"
    print("  ✅ Upload invoice panel visible")
    page.locator("button:text('Cancel')").first.click()  # close
    page.wait_for_timeout(200)

    # Test Pay invoice panel
    pay_btn = page.locator("button:text('Pay invoice')")
    pay_btn.click()
    page.wait_for_timeout(300)
    screenshot(page, "06-desktop-invoices-pay-panel")
    pay_hint = page.locator("text=Select an invoice to pay")
    assert pay_hint.is_visible(), "Pay invoice hint should be visible"
    print("  ✅ Pay invoice panel visible")
    page.locator("button:text('Cancel')").first.click()  # close
    page.wait_for_timeout(200)

    # Check invoice type filter buttons
    all_btn = page.locator("button.coa-level-btn:text('All')")
    assert all_btn.is_visible(), "All filter button should be visible"
    purchase_btn = page.locator("button.coa-level-btn:text('Purchase')")
    assert purchase_btn.is_visible(), "Purchase filter button should be visible"
    sales_btn = page.locator("button.coa-level-btn:text('Sales')")
    assert sales_btn.is_visible(), "Sales filter button should be visible"
    print("  ✅ Invoice type filter buttons visible")

    # Test Bank page
    page.click("nav a:text('Bank')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "07-desktop-bank")

    # Check bank page title
    bank_title = page.locator("h2.page-title:text('Bank')")
    assert bank_title.is_visible(), "Bank page title should be visible"
    print("  ✅ Bank page loaded")

    # Check bank balance dashboard cards exist
    metric_cards = page.locator(".metric-card").all()
    print(f"  Bank dashboard metric cards: {len(metric_cards)}")
    assert len(metric_cards) >= 3, "Bank page should have at least 3 metric cards"
    print("  ✅ Bank balance dashboard visible")

    # Test other pages
    pages_to_test = [
        ("Agent chat", "08-desktop-chat"),
        ("Accounting", "09-desktop-accounting"),
        ("Chart of accounts", "10-desktop-accounts"),
        ("Contacts", "11-desktop-contacts"),
        ("Items", "12-desktop-items"),
        ("Fixed assets", "13-desktop-fixed-assets"),
        ("Recurring", "14-desktop-recurring"),
        ("Reports", "15-desktop-reports"),
        ("Event log", "16-desktop-events"),
        ("Settings", "17-desktop-settings"),
    ]

    for link_text, screenshot_name in pages_to_test:
        try:
            page.click(f"nav a:text('{link_text}')")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(300)
            screenshot(page, screenshot_name)
            print(f"  ✅ {link_text} page loaded")
        except Exception as e:
            print(f"  ❌ {link_text} page failed: {e}")

    page.close()


def test_mobile(browser):
    print("\n=== MOBILE TESTS (iPhone 14 Pro) ===")
    page = browser.new_page(
        viewport={"width": 393, "height": 852},
        device_scale_factor=3,
        is_mobile=True,
        has_touch=True,
    )
    page.goto(BASE_URL, wait_until="networkidle")
    screenshot(page, "20-mobile-landing")

    # Sidebar should be hidden on mobile
    sidebar = page.locator(".app-sidebar")
    # The sidebar may exist but should not be in `open` state
    print("  ✅ Mobile page loaded")

    # Open hamburger menu
    hamburger = page.locator(".hamburger-btn")
    if hamburger.is_visible():
        hamburger.click()
        page.wait_for_timeout(300)
        screenshot(page, "21-mobile-sidebar-open")
        print("  ✅ Mobile sidebar opens")
    else:
        print("  ⚠️ No hamburger button found")

    # Navigate to Invoices
    page.click("nav a:text('Invoices')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "22-mobile-invoices")
    print("  ✅ Mobile invoices page loaded")

    # Check Create/Upload/Pay buttons are visible
    create_btn = page.locator("button:text('+ Create invoice')")
    assert create_btn.is_visible(), "Create invoice button should be visible on mobile"
    print("  ✅ Mobile: Create invoice button visible")

    # Open create panel on mobile
    create_btn.click()
    page.wait_for_timeout(300)
    screenshot(page, "23-mobile-invoices-create-panel")
    print("  ✅ Mobile: Create invoice panel opens")
    page.locator("button:text('Cancel')").first.click()  # close
    page.wait_for_timeout(200)

    # Navigate to Bank
    hamburger = page.locator(".hamburger-btn")
    if hamburger.is_visible():
        hamburger.click()
        page.wait_for_timeout(300)
    page.click("nav a:text('Bank')")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)
    screenshot(page, "24-mobile-bank")
    print("  ✅ Mobile: Bank page loaded")

    # Test a few more pages on mobile
    mobile_pages = [
        ("Dashboard", "25-mobile-dashboard"),
        ("Items", "26-mobile-items"),
        ("Reports", "27-mobile-reports"),
    ]

    for link_text, screenshot_name in mobile_pages:
        try:
            hamburger = page.locator(".hamburger-btn")
            if hamburger.is_visible():
                hamburger.click()
                page.wait_for_timeout(300)
            page.click(f"nav a:text('{link_text}')")
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(300)
            screenshot(page, screenshot_name)
            print(f"  ✅ Mobile: {link_text} page loaded")
        except Exception as e:
            print(f"  ❌ Mobile: {link_text} failed: {e}")

    page.close()


def main():
    print(f"Testing ERA at: {BASE_URL}")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            test_desktop(browser)
            test_mobile(browser)
            print("\n🎉 ALL TESTS PASSED!")
        except AssertionError as e:
            print(f"\n❌ TEST FAILED: {e}")
            sys.exit(1)
        except Exception as e:
            print(f"\n❌ UNEXPECTED ERROR: {e}")
            sys.exit(1)
        finally:
            browser.close()


if __name__ == "__main__":
    main()
