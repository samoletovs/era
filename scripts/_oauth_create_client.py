"""
Create OAuth 2.0 Web Client ID for ERA ERP using the Google OAuth2 Clients API.
This works for personal Google accounts (not in an organization).
"""
import json, urllib.request, urllib.error, sys

token = sys.argv[1]
project_id = "era-erp"
project_number = sys.argv[2]

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

# Approach 1: Try the newer OAuth2 Clients API (v1beta)
print("=== Trying OAuth2 Clients API (v1beta) ===")
url1 = f"https://oauth2.clients.googleapis.com/v1beta/projects/{project_number}/clients"
client_data = {
    "displayName": "ERA Web App",
    "clientType": "WEB_APPLICATION",
    "allowedRedirectUris": [
        "http://localhost:5173",
        "http://localhost:3000",
    ],
    "allowedJavascriptOrigins": [
        "http://localhost:5173",
        "http://localhost:3000",
    ],
}
data, status = api_call("POST", url1, client_data)
print(f"Status: {status}")
print(json.dumps(data, indent=2))

if status in (200, 201):
    print(f"\nSUCCESS! Client ID: {data.get('clientId', data.get('name', 'unknown'))}")
    sys.exit(0)

# Approach 2: Try via the Cloud Console API
print("\n=== Trying Cloud Console Credentials API ===")
url2 = f"https://www.googleapis.com/apikeys/v2/projects/{project_number}/keys"
data2, status2 = api_call("GET", url2)
print(f"API Keys list: {status2}")
if status2 == 200:
    print(json.dumps(data2, indent=2)[:500])

# Approach 3: Try the Google Identity Toolkit
print("\n=== Trying Identity Toolkit ===")
url3 = f"https://identitytoolkit.googleapis.com/v2/projects/{project_id}/config"
data3, status3 = api_call("GET", url3)
print(f"Identity config: {status3}")
if status3 in (200, 403, 404):
    print(json.dumps(data3, indent=2)[:500])

# Approach 4: Try the credentials admin API (used by GCP Console)
print("\n=== Trying credentials API ===")
url4 = f"https://www.googleapis.com/auth/cloud-platform.read-only"
# Actually try listing existing OAuth2 clients
url5 = f"https://oauth2.googleapis.com/v1/projects/{project_number}/clientIds"
data5, status5 = api_call("GET", url5)
print(f"OAuth2 clientIds: {status5}")
print(json.dumps(data5, indent=2)[:500])
