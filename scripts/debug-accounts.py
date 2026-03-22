from playwright.sync_api import sync_playwright
import json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:5174/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(500)

    cid = page.evaluate("() => localStorage.getItem('era_companyId')")
    print(f"CompanyId: {cid}")

    if cid:
        companies = page.evaluate("async () => { const r = await fetch('/api/companies', { headers: { Authorization: 'Bearer dev-bypass' } }); const j = await r.json(); return j.data?.map(c => ({ id: c.id, name: c.name })); }")
        print(f"Companies: {json.dumps(companies, indent=2)}")

        accounts = page.evaluate(f"async () => {{ const r = await fetch('/api/companies/{cid}/accounts', {{ headers: {{ Authorization: 'Bearer dev-bypass' }} }}); const j = await r.json(); return {{ count: j.data?.length, first3: j.data?.slice(0,3).map(a => a.code + ' ' + (a.docType || 'NO-DOCTYPE')), error: j.error }}; }}")
        print(f"Accounts for {cid}: {json.dumps(accounts, indent=2)}")

    browser.close()
