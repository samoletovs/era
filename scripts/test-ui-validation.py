"""
UI validation script — tests all pages on desktop and mobile viewports.
Takes screenshots and checks for broken elements, console errors, etc.
"""
from playwright.sync_api import sync_playwright
import os, json, time

SCREENSHOTS_DIR = "scripts/screenshots"
os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

BASE_URL = "http://localhost:5173"

PAGES = [
    ("/", "dashboard"),
    ("/chat", "chat"),
    ("/invoices", "invoices"),
    ("/bank", "bank"),
    ("/journal", "journal"),
    ("/accounting", "accounting"),
    ("/accounts", "accounts"),
    ("/contacts", "contacts"),
    ("/items", "items"),
    ("/fixed-assets", "fixed-assets"),
    ("/reports", "reports"),
    ("/events", "events"),
    ("/settings", "settings"),
    ("/onboarding", "onboarding"),
]

VIEWPORTS = {
    "desktop": {"width": 1440, "height": 900},
    "mobile": {"width": 375, "height": 812},
}

def main():
    console_errors = []
    
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        
        for vp_name, vp_size in VIEWPORTS.items():
            context = browser.new_context(viewport=vp_size)
            page = context.new_page()
            
            # Collect console errors
            page.on("console", lambda msg: console_errors.append(f"[{vp_name}] {msg.type}: {msg.text}") if msg.type == "error" else None)
            
            for path, name in PAGES:
                url = f"{BASE_URL}{path}"
                print(f"  Testing {vp_name}: {path}")
                try:
                    page.goto(url, wait_until="networkidle", timeout=15000)
                    page.wait_for_timeout(500)
                    
                    # Take screenshot
                    screenshot_path = f"{SCREENSHOTS_DIR}/{name}-{vp_name}.png"
                    page.screenshot(path=screenshot_path, full_page=True)
                    
                    # Check for visible error messages
                    error_elements = page.locator("text=error").all()
                    
                    # Check that key elements render
                    if vp_name == "desktop":
                        sidebar = page.locator(".app-sidebar")
                        if sidebar.count() > 0:
                            assert sidebar.is_visible(), f"Sidebar not visible on {path}"
                    else:
                        # Mobile: check hamburger menu
                        hamburger = page.locator(".hamburger-btn")
                        if hamburger.count() > 0:
                            assert hamburger.is_visible(), f"Hamburger not visible on {path}"
                    
                    # Check for overflow issues (elements wider than viewport)
                    body_width = page.evaluate("document.body.scrollWidth")
                    if body_width > vp_size["width"] + 5:
                        print(f"    WARNING: Horizontal overflow on {path} ({vp_name}): body={body_width}px > viewport={vp_size['width']}px")
                    
                except Exception as e:
                    print(f"    ERROR on {path}: {e}")
            
            context.close()
        
        browser.close()
    
    # Report console errors
    if console_errors:
        print(f"\n  Console errors found ({len(console_errors)}):")
        for err in console_errors[:20]:
            print(f"    {err}")
    else:
        print("\n  No console errors found")
    
    print(f"\n  Screenshots saved to {SCREENSHOTS_DIR}/")

if __name__ == "__main__":
    main()
