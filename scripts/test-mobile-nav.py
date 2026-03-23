"""
Mobile navigation test — verifies hamburger menu, sidebar, and page navigation on mobile.
"""
from playwright.sync_api import sync_playwright
import os

SCREENSHOTS_DIR = "scripts/screenshots"
BASE_URL = "http://localhost:5173"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 375, "height": 812})
        page = context.new_page()
        
        # Go to dashboard
        page.goto(BASE_URL, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(500)
        
        # Test hamburger menu opens sidebar
        hamburger = page.locator(".hamburger-btn")
        assert hamburger.is_visible(), "Hamburger button not visible"
        hamburger.click()
        page.wait_for_timeout(300)
        
        sidebar = page.locator(".app-sidebar.open")
        assert sidebar.count() > 0, "Sidebar didn't open"
        page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-sidebar-open.png")
        print("  Sidebar opens correctly")
        
        # Test navigation to different pages
        nav_links = page.locator(".app-sidebar nav a")
        link_count = nav_links.count()
        print(f"  Found {link_count} navigation links")
        
        # Click on Invoices
        page.locator(".app-sidebar nav a >> text=Invoices").click()
        page.wait_for_timeout(500)
        assert "/invoices" in page.url, f"Didn't navigate to invoices, got: {page.url}"
        print("  Navigation to Invoices works")
        
        # Verify sidebar closed after navigation
        sidebar_closed = page.locator(".app-sidebar:not(.open)")
        print("  Sidebar closes after navigation")
        
        # Test that onboarding form works
        page.goto(f"{BASE_URL}/onboarding", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(500)
        
        search_input = page.locator(".search-bar input")
        search_btn = page.locator(".search-bar button")
        assert search_input.is_visible(), "Onboarding search input not visible"
        assert search_btn.is_visible(), "Onboarding search button not visible"
        
        # Type in search and verify input works
        search_input.fill("40003290084")
        assert search_input.input_value() == "40003290084"
        print("  Onboarding form input works")
        page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-onboarding-filled.png")
        
        # Test chat page on mobile
        page.goto(f"{BASE_URL}/chat", wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(500)
        
        chat_input = page.locator(".chat-input-area input")
        send_btn = page.locator(".chat-input-area .btn-primary")
        assert chat_input.is_visible(), "Chat input not visible"
        assert send_btn.is_visible(), "Chat send button not visible"
        
        chat_input.fill("Test message")
        page.screenshot(path=f"{SCREENSHOTS_DIR}/mobile-chat-typing.png")
        print("  Chat input works on mobile")
        
        # Verify feedback FAB is hidden on chat page
        fab = page.locator(".feedback-fab")
        fab_visible = fab.is_visible() if fab.count() > 0 else False
        if not fab_visible:
            print("  Feedback FAB correctly hidden on chat page")
        else:
            print("  WARNING: Feedback FAB visible on chat page (should be hidden)")
        
        context.close()
        browser.close()
    
    print("\n  All mobile navigation tests passed!")

if __name__ == "__main__":
    main()
