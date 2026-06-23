"""Backend tests for LUXE TV (IPTV) FastAPI server.
Covers: auth, channels, favorites, admin sources/users, security checks.
"""
import os
import time
import requests
import pytest

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://iptv-stream-71.preview.emergentagent.com"
).rstrip("/")

API = f"{BASE_URL}/api"
TEST_M3U = "https://iptv-org.github.io/iptv/countries/tr.m3u"

FORBIDDEN_CHANNEL_KEYS = {"stream_url", "stream_url_enc", "source_id", "url", "url_enc"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "admin"
    return data["token"]


@pytest.fixture(scope="session")
def user_creds():
    uname = f"testuser_{int(time.time())}"
    return {"username": uname, "password": "pass1234"}


@pytest.fixture(scope="session")
def user_token(s, user_creds):
    r = s.post(f"{API}/auth/register", json=user_creds)
    assert r.status_code == 200, f"Register failed: {r.status_code} {r.text}"
    data = r.json()
    assert data["user"]["role"] == "user"
    return data["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Health ----------
def test_health(s):
    r = s.get(f"{API}/health")
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Auth ----------
def test_login_admin(s):
    r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    j = r.json()
    assert j["user"]["role"] == "admin"
    assert "token" in j and len(j["token"]) > 20


def test_auth_me(s, user_token, user_creds):
    r = s.get(f"{API}/auth/me", headers=H(user_token))
    assert r.status_code == 200
    me = r.json()
    assert me["username"] == user_creds["username"].lower()
    assert me["role"] == "user"


def test_auth_me_no_token(s):
    r = s.get(f"{API}/auth/me")
    assert r.status_code == 401


# ---------- Channels ----------
def test_categories(s, user_token):
    r = s.get(f"{API}/categories", headers=H(user_token))
    assert r.status_code == 200
    cats = r.json()
    assert isinstance(cats, list)
    assert len(cats) > 0
    assert all("name" in c and "count" in c for c in cats)


def test_channels_no_sensitive_keys(s, user_token):
    r = s.get(f"{API}/channels", headers=H(user_token))
    assert r.status_code == 200
    chans = r.json()
    assert len(chans) >= 8, f"Expected seeded channels, got {len(chans)}"
    for c in chans:
        leaked = set(c.keys()) & FORBIDDEN_CHANNEL_KEYS
        assert not leaked, f"Sensitive key leaked: {leaked} in {c}"


def test_channels_filter_category(s, user_token):
    r = s.get(f"{API}/channels", headers=H(user_token), params={"category": "Filmler"})
    assert r.status_code == 200
    chans = r.json()
    assert len(chans) > 0
    assert all(c["category"] == "Filmler" for c in chans)


def test_channels_search_q(s, user_token):
    r = s.get(f"{API}/channels", headers=H(user_token), params={"q": "bunny"})
    assert r.status_code == 200
    chans = r.json()
    assert len(chans) > 0
    assert all("bunny" in c["name"].lower() for c in chans)


def test_stream_non_vip_ok(s, user_token):
    r = s.get(f"{API}/channels", headers=H(user_token))
    non_vip = next(c for c in r.json() if not c["vip"])
    r2 = s.get(f"{API}/channels/{non_vip['id']}/stream", headers=H(user_token))
    assert r2.status_code == 200
    assert r2.json()["stream_url"].startswith("http")


def test_stream_vip_blocked_for_user(s, user_token):
    chans = s.get(f"{API}/channels", headers=H(user_token)).json()
    vip = next((c for c in chans if c["vip"]), None)
    assert vip is not None
    r = s.get(f"{API}/channels/{vip['id']}/stream", headers=H(user_token))
    assert r.status_code == 403


def test_stream_vip_ok_for_admin(s, admin_token):
    chans = s.get(f"{API}/channels", headers=H(admin_token)).json()
    vip = next((c for c in chans if c["vip"]), None)
    assert vip is not None
    r = s.get(f"{API}/channels/{vip['id']}/stream", headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["stream_url"].startswith("http")


# ---------- Favorites ----------
def test_favorites_flow(s, user_token):
    chans = s.get(f"{API}/channels", headers=H(user_token)).json()
    ch = next(c for c in chans if not c["vip"])
    # Add
    r = s.post(f"{API}/favorites", headers=H(user_token), json={"channel_id": ch["id"]})
    assert r.status_code == 200
    # List
    r = s.get(f"{API}/favorites", headers=H(user_token))
    assert r.status_code == 200
    favs = r.json()
    assert any(f["id"] == ch["id"] for f in favs)
    # Remove
    r = s.delete(f"{API}/favorites/{ch['id']}", headers=H(user_token))
    assert r.status_code == 200
    favs2 = s.get(f"{API}/favorites", headers=H(user_token)).json()
    assert not any(f["id"] == ch["id"] for f in favs2)


# ---------- Admin Sources ----------
def test_admin_sources_forbidden_for_user(s, user_token):
    r = s.get(f"{API}/admin/sources", headers=H(user_token))
    assert r.status_code == 403


def test_admin_sources_masking_and_sync(s, admin_token):
    # Create
    payload = {"name": "TEST_TR_PUBLIC", "url": TEST_M3U}
    r = s.post(f"{API}/admin/sources", headers=H(admin_token), json=payload)
    assert r.status_code == 200, r.text
    src = r.json()
    sid = src["id"]
    # Original URL must NOT appear anywhere
    raw = r.text
    assert TEST_M3U not in raw, "Raw URL leaked in create response"
    assert "url_masked" in src
    assert "***" in src["url_masked"]

    # List - verify masking and no raw url
    r = s.get(f"{API}/admin/sources", headers=H(admin_token))
    assert r.status_code == 200
    assert TEST_M3U not in r.text
    found = next((x for x in r.json() if x["id"] == sid), None)
    assert found is not None
    assert "***" in found["url_masked"]
    assert "url" not in found
    assert "url_enc" not in found

    # Wait for background sync to populate channel_count
    deadline = time.time() + 45
    count = 0
    while time.time() < deadline:
        r = s.get(f"{API}/admin/sources", headers=H(admin_token))
        found = next((x for x in r.json() if x["id"] == sid), None)
        count = found.get("channel_count", 0)
        if count > 0:
            break
        time.sleep(3)
    assert count > 0, "Background M3U sync did not populate channels in time"

    # Re-sync
    r = s.post(f"{API}/admin/sources/{sid}/sync", headers=H(admin_token))
    assert r.status_code == 200
    j = r.json()
    assert j.get("channel_count", 0) > 0

    # Sync-all
    r = s.post(f"{API}/admin/sync-all", headers=H(admin_token))
    assert r.status_code == 200
    assert r.json().get("total_channels", 0) >= count

    # Delete source - should also delete its channels
    r = s.delete(f"{API}/admin/sources/{sid}", headers=H(admin_token))
    assert r.status_code == 200
    # Verify gone
    r = s.get(f"{API}/admin/sources", headers=H(admin_token))
    assert all(x["id"] != sid for x in r.json())


# ---------- Admin Users ----------
def test_admin_users_list_and_role_update(s, admin_token, user_token, user_creds):
    # list
    r = s.get(f"{API}/admin/users", headers=H(admin_token))
    assert r.status_code == 200
    users = r.json()
    assert all("password" not in u for u in users)
    target = next((u for u in users if u["username"] == user_creds["username"].lower()), None)
    assert target is not None
    uid = target["id"]
    # promote to vip
    r = s.patch(f"{API}/admin/users/{uid}/role", headers=H(admin_token), json={"role": "vip"})
    assert r.status_code == 200
    assert r.json()["role"] == "vip"
    # verify via /auth/me with that user's token (still valid)
    r = s.get(f"{API}/auth/me", headers=H(user_token))
    assert r.json()["role"] == "vip"
    # demote
    r = s.patch(f"{API}/admin/users/{uid}/role", headers=H(admin_token), json={"role": "user"})
    assert r.status_code == 200
    assert r.json()["role"] == "user"


def test_admin_users_forbidden_for_user(s, user_token):
    r = s.get(f"{API}/admin/users", headers=H(user_token))
    assert r.status_code == 403
