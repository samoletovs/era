from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:5174/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    cid = "d7b9eb5b-ae9b-4d10-b5aa-10e29d899985"

    # Raw query to see what's actually in the ledger for this company
    raw = page.evaluate(f"""async () => {{
        const r = await fetch('/api/companies/{cid}/journal-entries', {{ headers: {{ Authorization: 'Bearer dev-bypass' }} }});
        const j = await r.json();
        return {{ journalCount: j.data?.length }};
    }}""")
    print(f"Journal entries: {json.dumps(raw)}")

    # Try the third company (SIA ERA Demo) which was created earlier
    cid2 = "12ff0dde-adfc-4f2b-aaba-bb7b83e3ab0d"
    accounts2 = page.evaluate(f"""async () => {{
        const r = await fetch('/api/companies/{cid2}/accounts', {{ headers: {{ Authorization: 'Bearer dev-bypass' }} }});
        const j = await r.json();
        return {{ count: j.data?.length, first3: j.data?.slice(0,3).map(a => ({{ code: a.code, hasDocType: !!a.docType, hasNormalSide: !!a.normalSide }})) }};
    }}""")
    print(f"SIA ERA Demo accounts: {json.dumps(accounts2, indent=2)}")

    browser.close()
