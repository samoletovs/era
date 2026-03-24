"""
Create Google OAuth 2.0 credentials using the internal Cloud Console API.
Tries multiple approaches including the Henhouse API.
"""
import json, urllib.request, urllib.error, sys, ssl

token = sys.argv[1]
project_number = sys.argv[2]
project_id = "era-erp"

ctx = ssl.create_default_context()

def api_call(method, url, data=None, extra_headers=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    if extra_headers:
        for k, v in extra_headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            raw = resp.read().decode()
            try:
                return json.loads(raw), resp.status
            except json.JSONDecodeError:
                return {"raw": raw[:500]}, resp.status
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return json.loads(body_text), e.code
        except Exception:
            return {"raw": body_text[:500]}, e.code
    except Exception as e:
        return {"error": str(e)[:200]}, 0

# Try: Google Workspace Admin API or the Cloud Resource Manager for project details
print("=== Project info ===")
data, status = api_call("GET", f"https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}")
if status == 200:
    print(f"Project: {data.get('name')} (#{data.get('projectNumber')})")
    print(f"State: {data.get('lifecycleState')}")

# Try: Henhouse API (Cloud Console internal API)
# This is what cloud.google.com/console uses for creating OAuth clients
print("\n=== Henhouse API (Cloud Console) ===")
henhouse_url = f"https://content-console.cloud.google.com/m/virgil/oauth2/api/listclients?project_number={project_number}"
data2, status2 = api_call("GET", henhouse_url, extra_headers={"X-Goog-Authuser": "0"})
print(f"Status: {status2}")
result = json.dumps(data2, indent=2)
print(result[:500])

# Try: Direct oauthconfig REST endpoint
print("\n=== Google Auth Platform Config ===")
url3 = f"https://oauthconfig.googleapis.com/v1beta/projects/{project_number}/brands"
data3, status3 = api_call("GET", url3)
print(f"Status: {status3}")
print(json.dumps(data3, indent=2)[:300])

# Try: New API endpoint for Google Auth Platform
print("\n=== Google API Keys + OAuth2 ===")
url4 = f"https://apikeys.googleapis.com/v2/projects/{project_id}/keys"
data4, status4 = api_call("GET", url4)
print(f"API Keys: {status4}")
print(json.dumps(data4, indent=2)[:300])
