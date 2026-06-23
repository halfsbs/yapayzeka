"""Backend tests for Yapay Zeka IPTV — new admin features.

Covers: settings (GET /api/settings + admin PUT), VIP plans CRUD, crypto wallets CRUD,
ads CRUD, channel CRUD (rename / category / vip / hidden / delete), user block + grant/revoke VIP,
admin stats, sensitive leak checks, and re-sync override preservation.

Run:
  pytest /app/backend/tests/test_iptv_admin_features.py -v --tb=short \
    --junitxml=/app/test_reports/pytest/pytest_results.xml
"""
import os
import time
import requests
import pytest
from pymongo import MongoClient

BASE_URL = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://iptv-stream-71.preview.emergentagent.com"
).rstrip("/")

API = f"{BASE_URL}/api"
TEST_M3U = "https://iptv-org.github.io/iptv/countries/tr.m3u"

FORBIDDEN_CHANNEL_KEYS = {"stream_url", "stream_url_enc", "source_id", "url", "url_enc"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session", autouse=True)
def restore_admin():
    """Ensure admin role/blocked=false before tests, in case earlier iterations demoted it."""
    try:
        MongoClient("mongodb://localhost:27017")["test_database"].users.update_one(
            {"username": "admin"}, {"$set": {"role": "admin", "blocked": False}}
        )
    except Exception as e:
        print(f"WARN: could not restore admin via mongo: {e}")
    yield


@pytest.fixture(scope="session")
def s():
    return requests.Session()


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def admin_token(s):
    r = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text}"
    j = r.json()
    assert j["user"]["role"] == "admin"
    return j["token"]


@pytest.fixture(scope="session")
def user_creds():
    return {"username": f"testuser_{int(time.time())}", "password": "pass1234"}


@pytest.fixture(scope="session")
def user_token(s, user_creds):
    r = s.post(f"{API}/auth/register", json=user_creds)
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["user"]["role"] == "user"
    return j["token"]


@pytest.fixture(scope="session")
def user_id(s, admin_token, user_creds, user_token):
    r = s.get(f"{API}/admin/users", headers=H(admin_token))
    assert r.status_code == 200
    u = next((x for x in r.json() if x["username"] == user_creds["username"].lower()), None)
    assert u is not None, "Test user not found in admin list"
    return u["id"]


# ---------- Settings ----------
def test_get_settings_user_shape(s, user_token):
    """GET /api/settings should return settings, vip_plans, crypto_wallets, ads, is_vip for any auth user."""
    r = s.get(f"{API}/settings", headers=H(user_token))
    assert r.status_code == 200
    j = r.json()
    for k in ("settings", "vip_plans", "crypto_wallets", "ads", "is_vip"):
        assert k in j, f"Missing key {k} in /api/settings response"
    assert j["is_vip"] is False
    assert j["settings"]["app_name"]  # non-empty
    assert isinstance(j["vip_plans"], list)
    assert isinstance(j["crypto_wallets"], list)
    assert isinstance(j["ads"], list)


def test_default_vip_plans_seeded(s, user_token):
    """Default 3 VIP plans (30/90/365 days) should be auto-seeded and active."""
    r = s.get(f"{API}/settings", headers=H(user_token))
    plans = r.json()["vip_plans"]
    days = sorted([p["days"] for p in plans])
    assert 30 in days and 90 in days and 365 in days, f"Expected 30/90/365 day plans, got {days}"


def test_get_settings_admin_no_ads(s, admin_token):
    """Admin should never see ads in /api/settings regardless of ads_enabled."""
    r = s.get(f"{API}/settings", headers=H(admin_token))
    assert r.status_code == 200
    j = r.json()
    assert j["is_vip"] is True
    assert j["ads"] == [], f"Admin should not receive ads, got {j['ads']}"


def test_admin_settings_update_reflects(s, admin_token):
    """PUT /api/admin/settings should update fields and reflect in next GET /api/settings."""
    r = s.get(f"{API}/admin/settings", headers=H(admin_token))
    assert r.status_code == 200
    current = r.json()

    new_settings = {**current, "app_name": "Yapay Zeka İptv", "tagline": "TESTED_TAGLINE_X1", "primary_color": "#FF0033"}
    r = s.put(f"{API}/admin/settings", headers=H(admin_token), json=new_settings)
    assert r.status_code == 200, r.text
    assert r.json()["tagline"] == "TESTED_TAGLINE_X1"

    # Verify via /api/settings (user-facing)
    r = s.get(f"{API}/admin/settings", headers=H(admin_token))
    assert r.json()["tagline"] == "TESTED_TAGLINE_X1"
    assert r.json()["primary_color"] == "#FF0033"
    # restore
    s.put(f"{API}/admin/settings", headers=H(admin_token), json=current)


# ---------- VIP Plans CRUD ----------
def test_vip_plans_crud(s, admin_token):
    create = {"name": "TEST_2_Aylik", "days": 60, "price_usd": 9.99, "price_try": 350.0, "description": "TEST", "active": True}
    r = s.post(f"{API}/admin/vip-plans", headers=H(admin_token), json=create)
    assert r.status_code == 200, r.text
    plan = r.json()
    assert plan["days"] == 60 and plan["name"] == "TEST_2_Aylik"
    pid = plan["id"]

    # patch
    upd = {**create, "price_try": 400.0, "name": "TEST_2_Aylik_v2"}
    r = s.patch(f"{API}/admin/vip-plans/{pid}", headers=H(admin_token), json=upd)
    assert r.status_code == 200
    assert r.json()["price_try"] == 400.0 and r.json()["name"] == "TEST_2_Aylik_v2"

    # list -> verify
    r = s.get(f"{API}/admin/vip-plans", headers=H(admin_token))
    assert r.status_code == 200
    assert any(p["id"] == pid and p["name"] == "TEST_2_Aylik_v2" for p in r.json())

    # delete
    r = s.delete(f"{API}/admin/vip-plans/{pid}", headers=H(admin_token))
    assert r.status_code == 200
    r = s.get(f"{API}/admin/vip-plans", headers=H(admin_token))
    assert all(p["id"] != pid for p in r.json())


# ---------- Crypto Wallets CRUD ----------
def test_crypto_wallets_crud(s, admin_token):
    create = {"symbol": "BTC", "name": "Bitcoin", "network": "Mainnet",
              "address": "bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "active": True}
    r = s.post(f"{API}/admin/crypto", headers=H(admin_token), json=create)
    assert r.status_code == 200, r.text
    w = r.json()
    wid = w["id"]
    assert w["symbol"] == "BTC" and w["address"].startswith("bc1q")

    # patch
    upd = {**create, "network": "Lightning", "active": False}
    r = s.patch(f"{API}/admin/crypto/{wid}", headers=H(admin_token), json=upd)
    assert r.status_code == 200
    assert r.json()["network"] == "Lightning" and r.json()["active"] is False

    # list
    r = s.get(f"{API}/admin/crypto", headers=H(admin_token))
    assert any(x["id"] == wid for x in r.json())

    # delete
    r = s.delete(f"{API}/admin/crypto/{wid}", headers=H(admin_token))
    assert r.status_code == 200


# ---------- Ads CRUD ----------
def test_ads_crud_and_visibility(s, admin_token, user_token):
    create = {"title": "TEST_AD_1", "image_url": "https://example.com/ad.png",
              "link_url": "https://example.com", "type": "banner", "active": True, "weight": 5}
    r = s.post(f"{API}/admin/ads", headers=H(admin_token), json=create)
    assert r.status_code == 200, r.text
    ad = r.json()
    aid = ad["id"]
    assert ad["title"] == "TEST_AD_1"

    # Regular user should see the ad
    r = s.get(f"{API}/settings", headers=H(user_token))
    ads = r.json()["ads"]
    assert any(a["id"] == aid for a in ads), "Active ad not delivered to non-VIP user"

    # Admin should NOT receive ads
    r = s.get(f"{API}/settings", headers=H(admin_token))
    assert all(a["id"] != aid for a in r.json()["ads"]), "Admin should not receive ads"

    # patch
    upd = {**create, "title": "TEST_AD_1_v2", "weight": 10}
    r = s.patch(f"{API}/admin/ads/{aid}", headers=H(admin_token), json=upd)
    assert r.status_code == 200
    assert r.json()["title"] == "TEST_AD_1_v2"

    # delete
    r = s.delete(f"{API}/admin/ads/{aid}", headers=H(admin_token))
    assert r.status_code == 200
    r = s.get(f"{API}/admin/ads", headers=H(admin_token))
    assert all(a["id"] != aid for a in r.json())


# ---------- Admin-only 403 for normal user ----------
@pytest.mark.parametrize("method,path", [
    ("GET", "/admin/settings"),
    ("PUT", "/admin/settings"),
    ("GET", "/admin/vip-plans"),
    ("POST", "/admin/vip-plans"),
    ("GET", "/admin/crypto"),
    ("POST", "/admin/crypto"),
    ("GET", "/admin/ads"),
    ("POST", "/admin/ads"),
    ("GET", "/admin/channels"),
    ("GET", "/admin/users"),
    ("GET", "/admin/stats"),
    ("GET", "/admin/sources"),
])
def test_admin_endpoints_forbidden_for_user(s, user_token, method, path):
    r = s.request(method, f"{API}{path}", headers=H(user_token), json={} if method in ("POST", "PUT") else None)
    assert r.status_code == 403, f"{method} {path} expected 403, got {r.status_code}"


# ---------- Channels: admin CRUD + hidden flow ----------
def test_admin_channel_crud_and_hidden(s, admin_token, user_token):
    # Pick a non-VIP demo channel that won't break other tests
    r = s.get(f"{API}/admin/channels", headers=H(admin_token))
    assert r.status_code == 200
    all_chans = r.json()
    target = next((c for c in all_chans if c.get("source_id") == "seed" and not c.get("vip") and not c.get("hidden") and c["name"] != "Big Buck Bunny"), None)
    assert target is not None, "No suitable seed channel found"
    cid = target["id"]
    original_name = target["name"]
    original_category = target["category"]

    # Rename + change category
    r = s.patch(f"{API}/admin/channels/{cid}", headers=H(admin_token),
                json={"name": "TEST_RENAMED_CH", "category": "TEST_CAT"})
    assert r.status_code == 200, r.text

    # Verify via admin list
    r = s.get(f"{API}/admin/channels", headers=H(admin_token))
    upd = next(c for c in r.json() if c["id"] == cid)
    assert upd["name"] == "TEST_RENAMED_CH" and upd["category"] == "TEST_CAT"

    # Toggle hidden=true and verify user can't see it
    r = s.patch(f"{API}/admin/channels/{cid}", headers=H(admin_token), json={"hidden": True})
    assert r.status_code == 200
    r = s.get(f"{API}/channels", headers=H(user_token))
    assert all(c["id"] != cid for c in r.json()), "Hidden channel still visible to user"
    # Stream should 404
    r = s.get(f"{API}/channels/{cid}/stream", headers=H(user_token))
    assert r.status_code == 404
    # categories count should exclude it
    r = s.get(f"{API}/categories", headers=H(user_token))
    cats = {c["name"]: c["count"] for c in r.json()}
    assert "TEST_CAT" not in cats or cats["TEST_CAT"] == 0

    # Restore: unhide + rename back
    r = s.patch(f"{API}/admin/channels/{cid}", headers=H(admin_token),
                json={"hidden": False, "name": original_name, "category": original_category})
    assert r.status_code == 200


# ---------- Admin user management: block + grant VIP days ----------
def test_user_block_login_and_token(s, admin_token, user_id, user_creds):
    # Block
    r = s.patch(f"{API}/admin/users/{user_id}/block", headers=H(admin_token), json={"blocked": True})
    assert r.status_code == 200
    assert r.json()["blocked"] is True

    # login attempt -> 403
    r = s.post(f"{API}/auth/login", json=user_creds)
    assert r.status_code == 403, f"Blocked user should not login, got {r.status_code} {r.text}"

    # Existing token -> /auth/me returns 403
    r2 = s.post(f"{API}/auth/login", json={"username": "admin", "password": "admin123"})  # ensure admin still ok
    assert r2.status_code == 200

    # Unblock
    r = s.patch(f"{API}/admin/users/{user_id}/block", headers=H(admin_token), json={"blocked": False})
    assert r.status_code == 200 and r.json()["blocked"] is False

    # Login works again
    r = s.post(f"{API}/auth/login", json=user_creds)
    assert r.status_code == 200


def test_blocked_token_returns_403_on_me(s, admin_token, user_token, user_id, user_creds):
    # Block again
    r = s.patch(f"{API}/admin/users/{user_id}/block", headers=H(admin_token), json={"blocked": True})
    assert r.status_code == 200
    # existing token -> /auth/me 403
    r = s.get(f"{API}/auth/me", headers=H(user_token))
    assert r.status_code == 403, f"Blocked user token should get 403 on /auth/me, got {r.status_code}"
    # unblock
    s.patch(f"{API}/admin/users/{user_id}/block", headers=H(admin_token), json={"blocked": False})


def test_grant_and_revoke_vip_by_days(s, admin_token, user_id, user_token):
    from datetime import datetime, timezone
    # First, find a VIP channel
    chans = s.get(f"{API}/channels", headers=H(user_token)).json()
    vip_ch = next((c for c in chans if c["vip"]), None)
    assert vip_ch is not None

    # Before grant: stream should 403
    r = s.get(f"{API}/channels/{vip_ch['id']}/stream", headers=H(user_token))
    assert r.status_code == 403

    # Grant 30 days
    r = s.post(f"{API}/admin/users/{user_id}/grant-vip", headers=H(admin_token), json={"days": 30})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["role"] == "vip"
    assert body["vip_until"] is not None
    # parse and check ~30 days (handle naive or aware ISO strings)
    iso = body["vip_until"].replace("Z", "+00:00")
    vu = datetime.fromisoformat(iso)
    if vu.tzinfo is None:
        vu = vu.replace(tzinfo=timezone.utc)
    delta_days = (vu - datetime.now(timezone.utc)).total_seconds() / 86400
    assert 29 <= delta_days <= 31, f"vip_until off: ~{delta_days:.2f}d from now"

    # After grant: stream should work
    r = s.get(f"{API}/channels/{vip_ch['id']}/stream", headers=H(user_token))
    assert r.status_code == 200
    assert r.json()["stream_url"].startswith("http")

    # Revoke
    r = s.post(f"{API}/admin/users/{user_id}/revoke-vip", headers=H(admin_token))
    assert r.status_code == 200
    assert r.json()["role"] == "user"
    assert r.json()["vip_until"] is None

    # Stream blocked again
    r = s.get(f"{API}/channels/{vip_ch['id']}/stream", headers=H(user_token))
    assert r.status_code == 403


# ---------- Admin Stats ----------
def test_admin_stats_shape(s, admin_token):
    r = s.get(f"{API}/admin/stats", headers=H(admin_token))
    assert r.status_code == 200
    j = r.json()
    for k in ("users", "vips", "blocked", "channels", "hidden_channels", "sources"):
        assert k in j, f"Missing stat key {k}"
        assert isinstance(j[k], int)
    assert j["users"] >= 1
    assert j["channels"] >= 0


# ---------- Sensitive leak checks ----------
def test_no_leak_in_channels(s, user_token):
    r = s.get(f"{API}/channels", headers=H(user_token))
    assert r.status_code == 200
    for c in r.json():
        leaked = set(c.keys()) & FORBIDDEN_CHANNEL_KEYS
        assert not leaked, f"Channel leaks {leaked}"


def test_no_leak_in_admin_sources(s, admin_token):
    r = s.get(f"{API}/admin/sources", headers=H(admin_token))
    assert r.status_code == 200
    txt = r.text
    assert "url_enc" not in txt
    for src in r.json():
        assert "url" not in src
        assert "url_enc" not in src
        assert "url_masked" in src


# ---------- Re-sync preserves admin overrides ----------
def test_resync_preserves_name_override(s, admin_token):
    # Add source
    r = s.post(f"{API}/admin/sources", headers=H(admin_token),
               json={"name": "TEST_TR_OVERRIDE", "url": TEST_M3U})
    assert r.status_code == 200, r.text
    sid = r.json()["id"]
    mongo_db = MongoClient("mongodb://localhost:27017")["test_database"]
    try:
        # Force a synchronous sync (the background task may be killed by reloads)
        r = s.post(f"{API}/admin/sources/{sid}/sync", headers=H(admin_token))
        assert r.status_code == 200, r.text
        assert r.json().get("channel_count", 0) > 0, "TR M3U returned 0 channels"

        # Use mongo directly to pick one channel from this source (the /admin/channels endpoint
        # has a 5000-row hard limit without pagination — see report).
        ch = mongo_db.channels.find_one({"source_id": sid})
        assert ch is not None, "No channels persisted from TR source"
        cid = ch["id"]
        new_name = f"TEST_OVERRIDE_{int(time.time())}"

        # Rename via admin
        r = s.patch(f"{API}/admin/channels/{cid}", headers=H(admin_token), json={"name": new_name})
        assert r.status_code == 200

        # Re-sync source
        r = s.post(f"{API}/admin/sources/{sid}/sync", headers=H(admin_token))
        assert r.status_code == 200

        # The renamed channel should still have new_name (override preserved)
        ch2 = mongo_db.channels.find_one({"source_id": sid, "name": new_name})
        assert ch2 is not None, f"Override name '{new_name}' not preserved after re-sync"
        assert ch2.get("name_overridden") is True
    finally:
        s.delete(f"{API}/admin/sources/{sid}", headers=H(admin_token))
