import json, urllib.request, urllib.error, sys
import os

token = sys.argv[1]
proj_num = sys.argv[2]

def api_call(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return json.loads(body_text), e.code
        except Exception:
            return {"raw": body_text}, e.code

# Step 1: Create OAuth brand (consent screen)
url = f"https://iap.googleapis.com/v1/projects/{proj_num}/brands"
data, status = api_call("GET", url)
print(f"List brands: {status}")

brand = None
if status == 200 and data.get("brands"):
    brand = data["brands"][0]
    print(f"Brand exists: {brand['name']}")
else:
    brand_data = {
        "applicationTitle": "ERA ERP",
        "supportEmail": os.environ.get("OAUTH_SUPPORT_EMAIL", ""),
    }
    brand, status = api_call("POST", url, brand_data)
    print(f"Create brand: {status}")
    print(json.dumps(brand, indent=2))

# Step 2: Create IAP OAuth client
if brand and brand.get("name"):
    brand_name = brand["name"]
    clients_url = f"https://iap.googleapis.com/v1/{brand_name}/identityAwareProxyClients"

    # List existing
    existing, es = api_call("GET", clients_url)
    print(f"\nExisting clients: {es}")
    if existing.get("identityAwareProxyClients"):
        for c in existing["identityAwareProxyClients"]:
            print(f"  Client: {c.get('displayName','')} -> {c.get('name','')}")

    # Create new client
    client_data = {"displayName": "ERA Web App"}
    result, cs = api_call("POST", clients_url, client_data)
    print(f"\nCreate client: {cs}")
    print(json.dumps(result, indent=2))
