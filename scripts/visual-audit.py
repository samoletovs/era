"""Playwright visual audit — screenshots every ERA page at desktop and mobile viewports."""
from playwright.sync_api import sync_playwright
import os, time

BASE = "http://localhost:5173"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "screenshots")
os.makedirs(OUT, exist_ok=True)

PAGES = [
    ("/", "dashboard"),
    ("/invoices", "invoices"),
    ("/contacts", "contacts"),
    ("/items", "items"),
    ("/accounts", "accounts"),
    ("/reports", "reports"),
    ("/fixed-assets", "fixed-assets"),
    ("/bank", "bank"),
    ("/journal", "journal"),
    ("/events", "events"),
    ("/accounting", "accounting"),
    ("/settings", "settings"),
]

VIEWPORTS = [
    ("desktop", 1440, 900),
    ("mobile", 375, 812),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    for vp_name, w, h in VIEWPORTS:
        ctx = browser.new_context(
            viewport={"width": w, "height": h},
            device_scale_factor=2 if vp_name == "mobile" else 1,
        )
        page = ctx.new_page()

        for path, name in PAGES:
            url = f"{BASE}{path}"
            try:
                page.goto(url, wait_until="networkidle", timeout=15000)
                time.sleep(0.5)  # let animations settle
                fname = f"{name}-{vp_name}.png"
                page.screenshot(path=os.path.join(OUT, fname), full_page=True)
                print(f"  OK  {fname}")
            except Exception as e:
                print(f"  FAIL {name}-{vp_name}: {e}")

        ctx.close()
    browser.close()

print(f"\nDone — screenshots saved to {OUT}")
