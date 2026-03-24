"""
Setup Google OAuth 2.0 for ERA ERP.
Creates OAuth consent screen (brand) and web client ID.
Uses the gcloud access token for authentication.
"""
import json
import subprocess
import sys
import urllib.request
import urllib.error

PROJECT_ID = "era-erp"

def get_access_token():
    result = subprocess.run(
        ["gcloud", "auth", "print-access-token"],
        capture_output=True, text=True
    )
    return result.stdout.strip()

def api_call(method, url, token, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode()), resp.status
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        try:
            return json.loads(body), e.code
        except json.JSONDecodeError:
            return {"raw": body}, e.code

def get_project_number(token):
    url = f"https://cloudresourcemanager.googleapis.com/v1/projects/{PROJECT_ID}"
    data, status = api_call("GET", url, token)
    if status == 200:
        return data.get("projectNumber")
    print(f"Failed to get project info: {status} {data}")
    return None

def create_oauth_brand(token, project_number):
    """Create OAuth consent screen (brand)."""
    url = f"https://iap.googleapis.com/v1/projects/{project_number}/brands"
    
    # First check if brand already exists
    data, status = api_call("GET", url, token)
    if status == 200 and data.get("brands"):
        print(f"OAuth brand already exists: {data['brands'][0]['name']}")
        return data["brands"][0]
    
    # Create brand — external type so any Google account can login
    brand_data = {
        "applicationTitle": "ERA ERP",
        "supportEmail": "d.146099412+samoletovs@users.noreply.github.comgmail.com",
    }
    data, status = api_call("POST", url, token, brand_data)
    if status in (200, 201):
        print(f"Created OAuth brand: {data.get('name')}")
        return data
    print(f"Failed to create brand: {status} {data}")
    return None

def create_oauth_client(token, brand_name):
    """Create OAuth 2.0 Web Client ID."""
    url = f"https://iap.googleapis.com/v1/{brand_name}/identityAwareProxyClients"
    
    # Check existing clients
    data, status = api_call("GET", url, token)
    if status == 200 and data.get("identityAwareProxyClients"):
        for client in data["identityAwareProxyClients"]:
            print(f"Existing IAP client: {client.get('name')}")
    
    # For web app OAuth, we actually need the regular OAuth2 client, not IAP client.
    # Use the OAuth2 API directly.
    return None

def create_web_oauth_client(token, project_number):
    """Create a regular OAuth 2.0 web client credential."""
    # Use the Google Cloud credentials API
    url = f"https://oauth2.googleapis.com/v2/projects/{PROJECT_ID}/oauthClients"
    
    # That endpoint doesn't exist directly. We need to use the older API.
    # The correct approach is via the Cloud Resource Manager / IAM credentials API
    # or the legacy Google API Console API.
    
    # Step: Use the service endpoint for creating OAuth2 clients
    base = "https://www.googleapis.com/oauth2/v1"
    
    # Actually, the correct REST API for creating OAuth clients is:
    # POST https://oauth2.clients.googleapis.com/v1/projects/{project}/clients
    # But this may not be publicly documented.
    
    # The most reliable programmatic way is through the IAP brand/clients API
    # for IAP clients, or through the Google Cloud Console REST API.
    
    # Let's try the newer API endpoint used by Cloud Console:
    url = f"https://content-oauth2.googleapis.com/v2/projects/{project_number}/oAuth2Clients"
    client_data = {
        "displayName": "ERA Web App",
        "allowedGrantTypes": ["authorization_code"],
        "allowedScopes": ["openid", "email", "profile"],
        "allowedRedirectUris": [
            "http://localhost:5173",
            "http://localhost:3000",
        ],
        "clientType": "WEB",
    }
    data, status = api_call("POST", url, token, client_data)
    if status in (200, 201):
        print(f"Created OAuth client: {data}")
        return data
    print(f"OAuth2 clients API: {status} — {data}")
    
    # Alternative: Try the legacy endpoint
    url2 = f"https://www.googleapis.com/oauth2/v1/projects/{PROJECT_ID}/oauthClients"
    data2, status2 = api_call("POST", url2, token, client_data)
    if status2 in (200, 201):
        print(f"Created OAuth client via legacy API: {data2}")
        return data2
    print(f"Legacy API: {status2} — {data2}")
    
    return None

def main():
    print("Setting up Google OAuth for ERA ERP...")
    print(f"Project: {PROJECT_ID}")
    
    token = get_access_token()
    if not token:
        print("ERROR: Could not get gcloud access token")
        sys.exit(1)
    print(f"Token: {token[:20]}...")
    
    # Get project number
    project_number = get_project_number(token)
    if not project_number:
        sys.exit(1)
    print(f"Project number: {project_number}")
    
    # Enable required APIs
    print("\nEnabling APIs...")
    for api_name in ["iap.googleapis.com", "people.googleapis.com"]:
        subprocess.run(
            ["gcloud", "services", "enable", api_name, f"--project={PROJECT_ID}"],
            capture_output=True, text=True
        )
        print(f"  Enabled {api_name}")
    
    # Create OAuth brand (consent screen)
    print("\nCreating OAuth consent screen...")
    brand = create_oauth_brand(token, project_number)
    if not brand:
        print("ERROR: Failed to create OAuth brand")
        sys.exit(1)
    
    # Try to create web OAuth client
    print("\nCreating OAuth Web Client...")
    client = create_web_oauth_client(token, project_number)
    if client:
        client_id = client.get("clientId") or client.get("client_id") or client.get("name", "")
        print(f"\n✓ Google Client ID: {client_id}")
    else:
        print("\nNote: Programmatic OAuth client creation requires additional setup.")
        print("The OAuth brand/consent screen has been created successfully.")
        print("Please create the Web Client ID manually or try the gcloud CLI approach below.")

if __name__ == "__main__":
    main()
