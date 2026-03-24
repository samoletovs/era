"""
Try various Google APIs to create OAuth2 web client credential.
"""
import json, urllib.request, urllib.error, sys, ssl

token = sys.argv[1]
project_number = sys.argv[2]
project_id = "era-erp"

# Disable SSL verification for problematic endpoints
ctx = ssl.create_default_context()

def api_call(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as e:
        body_text = e.read().decode()
        try:
            return json.loads(body_text), e.code
        except Exception:
            return {"raw": body_text[:500]}, e.code
    except Exception as e:
        return {"error": str(e)}, 0

# Approach 1: Google Auth Platform API (replacement for IAP OAuth Admin)
endpoints = [
    ("oauthconfig.googleapis.com", f"https://oauthconfig.googleapis.com/v1/projects/{project_number}/oauthClients"),
    ("cloudidentity", f"https://cloudidentity.googleapis.com/v1/projects/{project_id}/oauthClients"),
    ("serviceusage-settings", f"https://serviceusage.googleapis.com/v1/projects/{project_id}/settings"),
    ("apiservices-credentials", f"https://apiservices.googleapis.com/v1/projects/{project_number}/credentials"),
]

for name, url in endpoints:
    print(f"\n=== {name}: GET ===")
    data, status = api_call("GET", url)
    print(f"Status: {status}")
    result = json.dumps(data, indent=2)
    print(result[:300])
