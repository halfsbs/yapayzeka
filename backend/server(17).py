"""Yapay Zeka IPTV backend — auth, channels, favorites, admin (sources/channels/users/settings/vip/crypto/ads)."""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ReturnDocument
import os
import re
import logging
import asyncio
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Literal
import uuid
from datetime import datetime, timezone, timedelta
import bcrypt
import jwt
import httpx
from cryptography.fernet import Fernet
import hashlib
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

JWT_SECRET = os.environ.get("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is required")
JWT_ALG = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
_fkey = base64.urlsafe_b64encode(hashlib.sha256(JWT_SECRET.encode()).digest())
fernet = Fernet(_fkey)

app = FastAPI()
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
api_router = APIRouter(prefix="/api")
bearer = HTTPBearer(auto_error=False)

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

Role = Literal["user", "vip", "admin"]


# ---------- Models ----------
class UserPublic(BaseModel):
    id: str
    username: str
    role: Role
    favorites: List[str] = []
    blocked: bool = False
    adult_allowed: bool = False
    vip_until: Optional[datetime] = None
    created_at: datetime


class RegisterReq(BaseModel):
    username: str
    password: str


class LoginReq(BaseModel):
    username: str
    password: str


class TokenRes(BaseModel):
    access_token: str
    refresh_token: str
    user: UserPublic


class RefreshReq(BaseModel):
    refresh_token: str


class Channel(BaseModel):
    id: str
    name: str
    logo: Optional[str] = None
    category: str = "Genel"
    vip: bool = False
    adult: bool = False


class StreamRes(BaseModel):
    stream_url: str
    stream_urls: List[str] = []


class M3USource(BaseModel):
    id: str
    name: str
    url_masked: str
    active: bool = True
    last_synced: Optional[datetime] = None
    channel_count: int = 0


class M3USourceCreate(BaseModel):
    name: str
    url: str


class UserRoleUpdate(BaseModel):
    role: Role


class UserBlockUpdate(BaseModel):
    blocked: bool

class UserAdultUpdate(BaseModel):
    adult_allowed: bool


class ChannelUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    vip: Optional[bool] = None
    adult: Optional[bool] = None
    hidden: Optional[bool] = None
    logo: Optional[str] = None


class AppSettings(BaseModel):
    app_name: str = "Yapay Zeka İptv"
    tagline: str = "Cinematic Live Streaming"
    primary_color: str = "#C8102E"
    vip_intro: str = "Reklamsız izle, VIP kanallara erişim kazan."
    support_msg: str = "Sorun yaşarsanız yöneticiyle iletişime geçin."
    payment_note: str = "Ödeme onaylandıktan sonra VIP rolünüz manuel olarak aktif edilecektir."
    ads_enabled: bool = True


class CryptoWallet(BaseModel):
    id: str
    symbol: str  # BTC, ETH, USDT, BNB, SOL, TON, DOGE, XRP
    name: str    # "Bitcoin"
    network: str  # "Mainnet", "TRC20", "ERC20", "BEP20"
    address: str
    active: bool = True


class CryptoWalletCreate(BaseModel):
    symbol: str
    name: str
    network: str
    address: str
    active: bool = True


class VipPlan(BaseModel):
    id: str
    name: str
    days: int
    price_usd: float = 0
    price_try: float = 0
    description: Optional[str] = None
    active: bool = True


class VipPlanCreate(BaseModel):
    name: str
    days: int
    price_usd: float = 0
    price_try: float = 0
    description: Optional[str] = None
    active: bool = True


class Ad(BaseModel):
    id: str
    title: str
    image_url: str
    link_url: Optional[str] = None
    type: Literal["banner", "interstitial"] = "banner"
    active: bool = True
    weight: int = 1


class AdCreate(BaseModel):
    title: str
    image_url: str
    link_url: Optional[str] = None
    type: Literal["banner", "interstitial"] = "banner"
    active: bool = True
    weight: int = 1


# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False


def make_access_token(user_id: str) -> str:
    payload = {
        "uid": user_id,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def make_refresh_token(user_id: str) -> str:
    payload = {
        "uid": user_id,
        "type": "refresh",
        "jti": str(uuid.uuid4()),
        "exp": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


async def get_current_user(creds: HTTPAuthorizationCredentials = Depends(bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "Yetkilendirme gerekli")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Geçersiz oturum")
    if payload.get("type") != "access":
        raise HTTPException(401, "Geçersiz token tipi")
    user = await db.users.find_one({"id": payload["uid"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(401, "Kullanıcı bulunamadı")
    if user.get("blocked"):
        raise HTTPException(403, "Hesabınız engellenmiştir")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Yönetici yetkisi gerekli")
    return user


def public_user(u: dict) -> UserPublic:
    return UserPublic(
        id=u["id"],
        username=u["username"],
        role=u.get("role", "user"),
        favorites=u.get("favorites", []),
        blocked=u.get("blocked", False),
        adult_allowed=u.get("adult_allowed", False),
        vip_until=u.get("vip_until"),
        created_at=u.get("created_at", datetime.now(timezone.utc)),
    )


def mask_url(url: str) -> str:
    if len(url) < 20:
        return "***"
    return url[:12] + "***" + url[-6:]


def is_vip_active(u: dict) -> bool:
    if u.get("role") in ("vip", "admin"):
        return True
    vu = u.get("vip_until")
    if isinstance(vu, datetime) and vu > datetime.now(timezone.utc):
        return True
    return False


# Normalize channel name for matching across sources (pool/fallback).
# Lowercases, strips quality tags, country prefixes, brackets, punctuation.
_NORM_STRIP = re.compile(
    r"\b(fhd|uhd|hd|sd|4k|hevc|h265|h\.265|h264|h\.26[45]|1080p?|720p?|2160p?|backup|yedek|alt|"
    r"tr|en|us|uk|de|fr|ar|test|vip)\b",
    re.IGNORECASE,
)
_NORM_PUNCT = re.compile(r"[\[\](){}|/:_\-\.,!?\"'`*+#]+")
_NORM_WS = re.compile(r"\s+")


def normalize_name(s: str) -> str:
    if not s:
        return ""
    x = s.lower()
    x = _NORM_PUNCT.sub(" ", x)
    x = _NORM_STRIP.sub(" ", x)
    x = _NORM_WS.sub(" ", x).strip()
    return x


# ---------- M3U Parser ----------
M3U_INFO = re.compile(r'#EXTINF:-?\d+(?:\s+([^,]*))?,(.*)', re.IGNORECASE)
ATTR_RE = re.compile(r'([a-zA-Z0-9_-]+)="([^"]*)"')


def parse_m3u(text: str, source_id: str) -> List[dict]:
    """Parse M3U text into channel dicts. Memory-efficient for large files."""
    channels = []
    lines = text.splitlines()
    total = len(lines)

    
    i = 0
    count = 0
    last_log = 0
    while i < total:
        if count - last_log >= 10000:
            logger.info(f"parse_m3u progress: {count} channels, {i}/{total} lines")
            last_log = count
        line = lines[i].strip()
        if line.startswith("#EXTINF"):
            m = M3U_INFO.match(line)
            attrs = {}
            name = "Kanal"
            if m:
                attr_str = m.group(1) or ""
                name = (m.group(2) or "Kanal").strip()
                for k, v in ATTR_RE.findall(attr_str):
                    attrs[k.lower()] = v
            j = i + 1
            url = None
            while j < total:
                nxt = lines[j].strip()
                if nxt and not nxt.startswith("#"):
                    url = nxt
                    break
                j += 1
            if url:
                url_lower = url.lower()
                if (
                    "/movie/" in url_lower or
                    "/series/" in url_lower or
                    url_lower.endswith(".mp4") or
                    url_lower.endswith(".mkv") or
                    url_lower.endswith(".avi")
                ):
                    i = j + 1
                    continue

                vip = "vip" in name.lower() or "vip" in attrs.get("group-title", "").lower()
                clean_name = re.sub(r'\[?vip\]?', '', name, flags=re.IGNORECASE).strip(" -|")

                group_title = (attrs.get("group-title") or "").lower()
                name_lower = name.lower()

                skip_words = [
                    "vod",
                    "series", "serial", "tv series",
                    "dizi", "diziler",
                    "netflix", "blu tv", "blutv",
                    "exxen", "gain"
                ]

                if any(x in group_title for x in skip_words):
                    i = j + 1
                    continue

                if any(x in name_lower for x in skip_words):
                    i = j + 1
                    continue

                raw_group = attrs.get("group-title") or ""
                category = raw_group

                # group-title'dan ülke/tür çıkar
                if category:
                    cat_lower = category.lower()
                    # "UK | Sports", "DE - Entertainment", "US: News" gibi formatları parçala
                    # Önce pipe, dash, colon ile ayır
                    parts = re.split(r'[\|\:\-]', category)
                    first_part = parts[0].strip().upper() if parts else ""

                    # Ülke mapping (group-title ilk parçası)
                    country_map = {
                        "DE": "Almanya", "GERMANY": "Almanya", "DEUTSCHLAND": "Almanya",
                        "TR": "Türkiye", "TUR": "Türkiye", "TURKEY": "Türkiye", "TÜRKİYE": "Türkiye",
                        "US": "ABD", "USA": "ABD", "UNITED STATES": "ABD",
                        "UK": "İngiltere", "UNITED KINGDOM": "İngiltere", "GREAT BRITAIN": "İngiltere",
                        "GB": "İngiltere", "ENGLAND": "İngiltere",
                        "FR": "Fransa", "FRANCE": "Fransa",
                        "IT": "İtalya", "ITALY": "İtalya", "ITALIA": "İtalya",
                        "ES": "İspanya", "SPAIN": "İspanya", "ESPANA": "İspanya", "ESPAÑA": "İspanya",
                        "RU": "Rusya", "RUSSIA": "Rusya", "RUS": "Rusya",
                        "NL": "Hollanda", "NETHERLANDS": "Hollanda", "NEDERLAND": "Hollanda",
                        "PL": "Polonya", "POLAND": "Polonya", "POLSKA": "Polonya",
                        "AZ": "Azerbaycan", "AZERBAIJAN": "Azerbaycan",
                        "AR": "Arap", "ARAB": "Arap", "ARABIC": "Arap", "ARABIA": "Arap",
                        "PT": "Portekiz", "PORTUGAL": "Portekiz",
                        "GR": "Yunanistan", "GREECE": "Yunanistan", "HELLAS": "Yunanistan",
                        "BE": "Belçika", "BELGIUM": "Belçika", "BELGIE": "Belçika",
                        "AT": "Avusturya", "AUSTRIA": "Avusturya", "ÖSTERREICH": "Avusturya",
                        "CH": "İsviçre", "SWITZERLAND": "İsviçre", "SCHWEIZ": "İsviçre",
                        "SE": "İsveç", "SWEDEN": "İsveç", "SVERIGE": "İsveç",
                        "NO": "Norveç", "NORWAY": "Norveç", "NORGE": "Norveç",
                        "DK": "Danimarka", "DENMARK": "Danimarka", "DANMARK": "Danimarka",
                        "FI": "Finlandiya", "FINLAND": "Finlandiya", "SUOMI": "Finlandiya",
                        "CZ": "Çek Cumhuriyeti", "CZECH": "Çek Cumhuriyeti", "CZECHIA": "Çek Cumhuriyeti",
                        "HU": "Macaristan", "HUNGARY": "Macaristan", "MAGYAR": "Macaristan",
                        "RO": "Romanya", "ROMANIA": "Romanya", "ROMÂNIA": "Romanya",
                        "BG": "Bulgaristan", "BULGARIA": "Bulgaristan", "BULGARIE": "Bulgaristan",
                        "HR": "Hırvatistan", "CROATIA": "Hırvatistan", "HRVATSKA": "Hırvatistan",
                        "RS": "Sırbistan", "SERBIA": "Sırbistan", "SRBIJA": "Sırbistan",
                        "SI": "Slovenya", "SLOVENIA": "Slovenya", "SLOVENIJA": "Slovenya",
                        "SK": "Slovakya", "SLOVAKIA": "Slovakya", "SLOVENSKO": "Slovakya",
                        "LT": "Litvanya", "LITHUANIA": "Litvanya", "LIETUVA": "Litvanya",
                        "LV": "Letonya", "LATVIA": "Letonya", "LATVIJA": "Letonya",
                        "EE": "Estonya", "ESTONIA": "Estonya", "EESTI": "Estonya",
                        "UA": "Ukrayna", "UKRAINE": "Ukrayna", "UKRAINA": "Ukrayna",
                        "MD": "Moldova", "MOLDOVA": "Moldova",
                        "BY": "Belarus", "BELARUS": "Belarus", "BELARUSIA": "Belarus",
                        "KZ": "Kazakistan", "KAZAKHSTAN": "Kazakistan", "QAZAQSTAN": "Kazakistan",
                        "GE": "Gürcistan", "GEORGIA": "Gürcistan", "SAKARTVELO": "Gürcistan",
                        "AM": "Ermenistan", "ARMENIA": "Ermenistan", "HAYASTAN": "Ermenistan",
                        "IL": "İsrail", "ISRAEL": "İsrail",
                        "IN": "Hindistan", "INDIA": "Hindistan", "BHARAT": "Hindistan",
                        "PK": "Pakistan", "PAKISTAN": "Pakistan",
                        "BD": "Bangladeş", "BANGLADESH": "Bangladeş",
                        "TH": "Tayland", "THAILAND": "Tayland",
                        "JP": "Japonya", "JAPAN": "Japonya", "NIPPON": "Japonya",
                        "KR": "Güney Kore", "KOREA": "Güney Kore", "SOUTH KOREA": "Güney Kore",
                        "CN": "Çin", "CHINA": "Çin", "ZHONGGUO": "Çin",
                        "TW": "Tayvan", "TAIWAN": "Tayvan",
                        "HK": "Hong Kong", "HONGKONG": "Hong Kong",
                        "SG": "Singapur", "SINGAPORE": "Singapur",
                        "MY": "Malezya", "MALAYSIA": "Malezya",
                        "ID": "Endonezya", "INDONESIA": "Endonezya",
                        "PH": "Filipinler", "PHILIPPINES": "Filipinler",
                        "VN": "Vietnam", "VIETNAM": "Vietnam", "VIỆT NAM": "Vietnam",
                        "BR": "Brezilya", "BRAZIL": "Brezilya", "BRASIL": "Brezilya",
                        "MX": "Meksika", "MEXICO": "Meksika", "MÉXICO": "Meksika",
                        "AR": "Arjantin", "ARGENTINA": "Arjantin",
                        "CL": "Şili", "CHILE": "Şili",
                        "CO": "Kolombiya", "COLOMBIA": "Kolombiya",
                        "PE": "Peru", "PERU": "Peru", "PERÚ": "Peru",
                        "VE": "Venezuela", "VENEZUELA": "Venezuela",
                        "ZA": "Güney Afrika", "SOUTH AFRICA": "Güney Afrika",
                        "EG": "Mısır", "EGYPT": "Mısır", "MASRI": "Mısır",
                        "SA": "Suudi Arabistan", "SAUDI ARABIA": "Suudi Arabistan",
                        "AE": "Birleşik Arap Emirlikleri", "UAE": "Birleşik Arap Emirlikleri",
                        "QA": "Katar", "QATAR": "Katar",
                        "KW": "Kuveyt", "KUWAIT": "Kuveyt",
                        "BH": "Bahreyn", "BAHRAIN": "Bahreyn",
                        "OM": "Umman", "OMAN": "Umman",
                        "IQ": "Irak", "IRAQ": "Irak",
                        "JO": "Ürdün", "JORDAN": "Ürdün",
                        "LB": "Lübnan", "LEBANON": "Lübnan",
                        "SY": "Suriye", "SYRIA": "Suriye",
                        "YE": "Yemen", "YEMEN": "Yemen",
                        "LY": "Libya", "LIBYA": "Libya",
                        "TN": "Tunus", "TUNISIA": "Tunus",
                        "DZ": "Cezayir", "ALGERIA": "Cezayir",
                        "MA": "Fas", "MOROCCO": "Fas", "MAROC": "Fas",
                        "SD": "Sudan", "SUDAN": "Sudan",
                        "ET": "Etiyopya", "ETHIOPIA": "Etiyopya",
                        "KE": "Kenya", "KENYA": "Kenya",
                        "NG": "Nijerya", "NIGERIA": "Nijerya",
                        "GH": "Gana", "GHANA": "Gana",
                        "AU": "Avustralya", "AUSTRALIA": "Avustralya",
                        "NZ": "Yeni Zelanda", "NEW ZEALAND": "Yeni Zelanda",
                        "CA": "Kanada", "CANADA": "Kanada",
                        "IE": "İrlanda", "IRELAND": "İrlanda", "EIRE": "İrlanda",
                        "IS": "İzlanda", "ICELAND": "İzlanda", "ISLAND": "İzlanda",
                        "MT": "Malta", "MALTA": "Malta",
                        "CY": "Kıbrıs", "CYPRUS": "Kıbrıs", "KYPROS": "Kıbrıs",
                        "AL": "Arnavutluk", "ALBANIA": "Arnavutluk", "SHQIPERIA": "Arnavutluk",
                        "MK": "Kuzey Makedonya", "MACEDONIA": "Kuzey Makedonya", "NORTH MACEDONIA": "Kuzey Makedonya",
                        "BA": "Bosna Hersek", "BOSNIA": "Bosna Hersek", "BOSNA": "Bosna Hersek",
                        "ME": "Karadağ", "MONTENEGRO": "Karadağ", "CRNA GORA": "Karadağ",
                        "XK": "Kosova", "KOSOVO": "Kosova", "KOSOVA": "Kosova",
                    }

                    if first_part in country_map:
                        category = country_map[first_part]
                    else:
                        # Spor/Sinema/Belgesel gibi tür kategorileri doğrudan kullan
                        type_keywords = {
                            "SPORTS": "Spor", "SPORT": "Spor", "SPOR": "Spor",
                            "MOVIES": "Sinema", "MOVIE": "Sinema", "FILM": "Sinema", "FILMS": "Sinema", "SINEMA": "Sinema",
                            "DOCUMENTARY": "Belgesel", "DOCUMENTARIES": "Belgesel", "DOC": "Belgesel", "BELGESEL": "Belgesel",
                            "KIDS": "Çocuk", "KID": "Çocuk", "CHILDREN": "Çocuk", "CHILD": "Çocuk", "ÇOCUK": "Çocuk",
                            "NEWS": "Haber", "HABER": "Haber", "HABERLER": "Haber",
                            "MUSIC": "Müzik", "MUSIK": "Müzik", "MÜZIK": "Müzik", "MÜZİK": "Müzik",
                            "RELIGION": "Dini", "RELIGIOUS": "Dini", "DINI": "Dini", "DİNİ": "Dini", "DIN": "Dini",
                            "ENTERTAINMENT": "Eğlence", "ENTERTAIN": "Eğlence", "EGLENCE": "Eğlence", "EĞLENCE": "Eğlence",
                            "LIFESTYLE": "Yaşam", "LIFE": "Yaşam", "YASAM": "Yaşam", "YAŞAM": "Yaşam",
                            "CULTURE": "Kültür", "KULTUR": "Kültür", "KÜLTÜR": "Kültür",
                            "EDUCATION": "Eğitim", "EDUCATIONAL": "Eğitim", "EGITIM": "Eğitim", "EĞİTİM": "Eğitim",
                            "SCIENCE": "Bilim", "SCIENCE & NATURE": "Bilim", "BILIM": "Bilim", "BİLİM": "Bilim",
                            "TRAVEL": "Seyahat", "SEYAHAT": "Seyahat",
                            "FOOD": "Yemek", "YEMEK": "Yemek", "COOKING": "Yemek", "CULINARY": "Yemek",
                            "FASHION": "Moda", "MODA": "Moda",
                            "AUTO": "Otomobil", "AUTOMOTIVE": "Otomobil", "CAR": "Otomobil", "OTOMOBIL": "Otomobil",
                            "SHOPPING": "Alışveriş", "ALISVERIS": "Alışveriş", "ALışVERIş": "Alışveriş",
                            "WEATHER": "Hava Durumu", "HAVA": "Hava Durumu",
                            "GENERAL": "Genel", "GENEL": "Genel", "MIX": "Genel", "MIXED": "Genel",
                            "LOCAL": "Yerel", "YEREL": "Yerel", "REGIONAL": "Yerel",
                            "INTERNATIONAL": "Uluslararası", "ULUSLARARASI": "Uluslararası",
                            "RADIO": "Radyo", "RADYO": "Radyo",
                        }

                        # Tüm parçaları kontrol et (örn: "UK | Sports" -> Sports da kontrol edilir)
                        for part in parts:
                            p = part.strip().upper()
                            if p in type_keywords:
                                category = type_keywords[p]
                                break

                        # Hiçbir eşleşme yoksa orijinal group-title'ı Türkçeleştir
                        if category == raw_group:
                            # "German" -> "Almanya", "Turkish" -> "Türkiye" vb.
                            lang_map = {
                                "GERMAN": "Almanya", "GERMANY": "Almanya", "DEUTSCH": "Almanya", "DEUTSCHLAND": "Almanya",
                                "TURKISH": "Türkiye", "TURKEY": "Türkiye", "TURK": "Türkiye", "TÜRK": "Türkiye", "TURKCE": "Türkiye", "TÜRKÇE": "Türkiye",
                                "ENGLISH": "İngiltere", "BRITISH": "İngiltere", "ENGLAND": "İngiltere",
                                "AMERICAN": "ABD", "USA": "ABD", "UNITED STATES": "ABD",
                                "FRENCH": "Fransa", "FRANCE": "Fransa", "FRANÇAIS": "Fransa",
                                "ITALIAN": "İtalya", "ITALY": "İtalya", "ITALIA": "İtalya",
                                "SPANISH": "İspanya", "SPAIN": "İspanya", "ESPAÑOL": "İspanya",
                                "RUSSIAN": "Rusya", "RUSSIA": "Rusya", "RUS": "Rusya", "RUSÇA": "Rusya",
                                "DUTCH": "Hollanda", "NETHERLANDS": "Hollanda", "NEDERLANDS": "Hollanda",
                                "POLISH": "Polonya", "POLAND": "Polonya", "POLSKA": "Polonya",
                                "AZERBAIJANI": "Azerbaycan", "AZERBAIJAN": "Azerbaycan", "AZERI": "Azerbaycan",
                                "ARABIC": "Arap", "ARAB": "Arap", "ARABIA": "Arap",
                                "PORTUGUESE": "Portekiz", "PORTUGAL": "Portekiz",
                                "GREEK": "Yunanistan", "GREECE": "Yunanistan", "HELLENIC": "Yunanistan",
                                "BELGIAN": "Belçika", "BELGIUM": "Belçika",
                                "AUSTRIAN": "Avusturya", "AUSTRIA": "Avusturya",
                                "SWISS": "İsviçre", "SWITZERLAND": "İsviçre", "SCHWEIZ": "İsviçre",
                                "SWEDISH": "İsveç", "SWEDEN": "İsveç",
                                "NORWEGIAN": "Norveç", "NORWAY": "Norveç",
                                "DANISH": "Danimarka", "DENMARK": "Danimarka",
                                "FINNISH": "Finlandiya", "FINLAND": "Finlandiya",
                                "CZECH": "Çek Cumhuriyeti", "CZECHIA": "Çek Cumhuriyeti",
                                "HUNGARIAN": "Macaristan", "HUNGARY": "Macaristan",
                                "ROMANIAN": "Romanya", "ROMANIA": "Romanya",
                                "BULGARIAN": "Bulgaristan", "BULGARIA": "Bulgaristan",
                                "CROATIAN": "Hırvatistan", "CROATIA": "Hırvatistan",
                                "SERBIAN": "Sırbistan", "SERBIA": "Sırbistan",
                                "SLOVENIAN": "Slovenya", "SLOVENIA": "Slovenya",
                                "SLOVAK": "Slovakya", "SLOVAKIA": "Slovakya",
                                "LITHUANIAN": "Litvanya", "LITHUANIA": "Litvanya",
                                "LATVIAN": "Letonya", "LATVIA": "Letonya",
                                "ESTONIAN": "Estonya", "ESTONIA": "Estonya",
                                "UKRAINIAN": "Ukrayna", "UKRAINE": "Ukrayna",
                                "MOLDOVAN": "Moldova", "MOLDOVA": "Moldova",
                                "BELARUSIAN": "Belarus", "BELARUS": "Belarus",
                                "KAZAKH": "Kazakistan", "KAZAKHSTAN": "Kazakistan",
                                "GEORGIAN": "Gürcistan", "GEORGIA": "Gürcistan",
                                "ARMENIAN": "Ermenistan", "ARMENIA": "Ermenistan",
                                "HEBREW": "İsrail", "ISRAELI": "İsrail", "ISRAEL": "İsrail",
                                "HINDI": "Hindistan", "INDIAN": "Hindistan", "INDIA": "Hindistan", "BHARAT": "Hindistan",
                                "URDU": "Pakistan", "PAKISTANI": "Pakistan", "PAKISTAN": "Pakistan",
                                "BENGALI": "Bangladeş", "BANGLADESH": "Bangladeş",
                                "THAI": "Tayland", "THAILAND": "Tayland",
                                "JAPANESE": "Japonya", "JAPAN": "Japonya", "NIPPON": "Japonya",
                                "KOREAN": "Güney Kore", "KOREA": "Güney Kore", "SOUTH KOREAN": "Güney Kore",
                                "CHINESE": "Çin", "CHINA": "Çin", "MANDARIN": "Çin", "ZHONGWEN": "Çin",
                                "TAIWANESE": "Tayvan", "TAIWAN": "Tayvan",
                                "HONG KONG": "Hong Kong", "HONGKONG": "Hong Kong", "CANTONESE": "Hong Kong",
                                "SINGAPORE": "Singapur", "SINGAPOREAN": "Singapur",
                                "MALAYSIAN": "Malezya", "MALAYSIA": "Malezya", "MALAY": "Malezya",
                                "INDONESIAN": "Endonezya", "INDONESIA": "Endonezya", "INDO": "Endonezya",
                                "FILIPINO": "Filipinler", "PHILIPPINES": "Filipinler", "PHILIPPINE": "Filipinler",
                                "VIETNAMESE": "Vietnam", "VIETNAM": "Vietnam", "VIỆT": "Vietnam",
                                "BRAZILIAN": "Brezilya", "BRAZIL": "Brezilya", "BRASIL": "Brezilya",
                                "MEXICAN": "Meksika", "MEXICO": "Meksika", "MÉXICO": "Meksika",
                                "ARGENTINE": "Arjantin", "ARGENTINA": "Arjantin", "ARGENTINIAN": "Arjantin",
                                "CHILEAN": "Şili", "CHILE": "Şili",
                                "COLOMBIAN": "Kolombiya", "COLOMBIA": "Kolombiya",
                                "PERUVIAN": "Peru", "PERU": "Peru", "PERÚ": "Peru",
                                "VENEZUELAN": "Venezuela", "VENEZUELA": "Venezuela",
                                "SOUTH AFRICAN": "Güney Afrika", "SOUTH AFRICA": "Güney Afrika",
                                "EGYPTIAN": "Mısır", "EGYPT": "Mısır", "MASRI": "Mısır",
                                "SAUDI": "Suudi Arabistan", "SAUDI ARABIA": "Suudi Arabistan", "SAUDI ARABIAN": "Suudi Arabistan",
                                "EMIRATI": "Birleşik Arap Emirlikleri", "UAE": "Birleşik Arap Emirlikleri", "EMIRATES": "Birleşik Arap Emirlikleri",
                                "QATARI": "Katar", "QATAR": "Katar",
                                "KUWAITI": "Kuveyt", "KUWAIT": "Kuveyt",
                                "BAHRAINI": "Bahreyn", "BAHRAIN": "Bahreyn",
                                "OMANI": "Umman", "OMAN": "Umman",
                                "IRAQI": "Irak", "IRAQ": "Irak",
                                "JORDANIAN": "Ürdün", "JORDAN": "Ürdün",
                                "LEBANESE": "Lübnan", "LEBANON": "Lübnan",
                                "SYRIAN": "Suriye", "SYRIA": "Suriye",
                                "YEMENI": "Yemen", "YEMEN": "Yemen",
                                "LIBYAN": "Libya", "LIBYA": "Libya",
                                "TUNISIAN": "Tunus", "TUNISIA": "Tunus",
                                "ALGERIAN": "Cezayir", "ALGERIA": "Cezayir",
                                "MOROCCAN": "Fas", "MOROCCO": "Fas", "MAROC": "Fas",
                                "SUDANESE": "Sudan", "SUDAN": "Sudan",
                                "ETHIOPIAN": "Etiyopya", "ETHIOPIA": "Etiyopya",
                                "KENYAN": "Kenya", "KENYA": "Kenya",
                                "NIGERIAN": "Nijerya", "NIGERIA": "Nijerya",
                                "GHANAIAN": "Gana", "GHANA": "Gana",
                                "AUSTRALIAN": "Avustralya", "AUSTRALIA": "Avustralya",
                                "NEW ZEALAND": "Yeni Zelanda", "NEW ZEALANDER": "Yeni Zelanda", "KIWI": "Yeni Zelanda",
                                "CANADIAN": "Kanada", "CANADA": "Kanada",
                                "IRISH": "İrlanda", "IRELAND": "İrlanda", "EIRE": "İrlanda",
                                "ICELANDIC": "İzlanda", "ICELAND": "İzlanda",
                                "MALTESE": "Malta", "MALTA": "Malta",
                                "CYPRIOT": "Kıbrıs", "CYPRUS": "Kıbrıs",
                                "ALBANIAN": "Arnavutluk", "ALBANIA": "Arnavutluk", "SHQIPERIA": "Arnavutluk",
                                "MACEDONIAN": "Kuzey Makedonya", "MACEDONIA": "Kuzey Makedonya", "NORTH MACEDONIA": "Kuzey Makedonya",
                                "BOSNIAN": "Bosna Hersek", "BOSNIA": "Bosna Hersek", "BOSNA": "Bosna Hersek",
                                "MONTENEGRIN": "Karadağ", "MONTENEGRO": "Karadağ", "CRNA GORA": "Karadağ",
                                "KOSOVAR": "Kosova", "KOSOVO": "Kosova", "KOSOVA": "Kosova",
                            }
                            cat_upper = category.upper()
                            if cat_upper in lang_map:
                                category = lang_map[cat_upper]

                # group-title yoksa, kanal isminden ülke çıkar
                if not category or category == "Genel":
                    upper_name = name.upper()
                    # "DE • Kabel Eins", "DE | Kabel", "DE-RTL", "DE: Pro7" gibi formatlar
                    name_prefix_match = re.match(r'^\s*([A-Z]{2,})\s*[•\|\:\-\.]\s*', name, re.IGNORECASE)
                    if name_prefix_match:
                        prefix = name_prefix_match.group(1).upper()
                        if prefix == "DE":
                            category = "Almanya"
                        elif prefix in ("TR", "TUR"):
                            category = "Türkiye"
                        elif prefix in ("US", "USA"):
                            category = "ABD"
                        elif prefix in ("UK", "GB"):
                            category = "İngiltere"
                        elif prefix == "FR":
                            category = "Fransa"
                        elif prefix == "IT":
                            category = "İtalya"
                        elif prefix == "ES":
                            category = "İspanya"
                        elif prefix == "RU":
                            category = "Rusya"
                        elif prefix == "NL":
                            category = "Hollanda"
                        elif prefix == "PL":
                            category = "Polonya"
                        elif prefix == "AZ":
                            category = "Azerbaycan"
                        elif prefix == "AR":
                            category = "Arap"
                        elif prefix == "GERMANY":
                            category = "Almanya"
                        elif prefix == "TURKEY":
                            category = "Türkiye"
                    else:
                        # İsimde ülke adı geçiyor mu?
                        if "DEUTSCHLAND" in upper_name or "GERMAN" in upper_name:
                            category = "Almanya"
                        elif "TÜRKİYE" in upper_name or "TURKEY" in upper_name or "TURKISH" in upper_name:
                            category = "Türkiye"
                        elif "UNITED STATES" in upper_name or "AMERICA" in upper_name or "AMERICAN" in upper_name:
                            category = "ABD"
                        elif "UNITED KINGDOM" in upper_name or "BRITISH" in upper_name or "ENGLAND" in upper_name:
                            category = "İngiltere"
                        elif "FRANCE" in upper_name or "FRENCH" in upper_name:
                            category = "Fransa"
                        elif "ITALY" in upper_name or "ITALIAN" in upper_name or "ITALIA" in upper_name:
                            category = "İtalya"
                        elif "SPAIN" in upper_name or "SPANISH" in upper_name or "ESPAÑA" in upper_name:
                            category = "İspanya"
                        elif "RUSSIA" in upper_name or "RUSSIAN" in upper_name or "RUSYA" in upper_name:
                            category = "Rusya"
                        elif "NETHERLANDS" in upper_name or "DUTCH" in upper_name or "HOLLAND" in upper_name:
                            category = "Hollanda"
                        elif "POLAND" in upper_name or "POLISH" in upper_name or "POLSKA" in upper_name:
                            category = "Polonya"
                        elif "AZERBAIJAN" in upper_name or "AZERI" in upper_name:
                            category = "Azerbaycan"
                        elif "ARAB" in upper_name or "ARABIC" in upper_name:
                            category = "Arap"

                allowed_categories = {
                    "Türkiye",
                    "Almanya",
                    "ABD",
                    "İngiltere",
                    "Fransa",
                    "İtalya",
                    "İspanya",
                    "Rusya",
                    "Hollanda",
                    "Polonya",
                    "Azerbaycan",
                    "Arap",
                    "Spor",
                    "Sinema",
                    "Belgesel",
                    "Çocuk",
                    "Haber",
                    "Müzik",
                    "Dini",
                    "Eğlence",
                    "Yaşam",
                    "Kültür",
                    "Eğitim",
                    "Bilim",
                    "Seyahat",
                    "Yemek",
                    "Moda",
                    "Otomobil",
                    "Alışveriş",
                    "Hava Durumu",
                    "Genel",
                    "Yerel",
                    "Uluslararası",
                    "Radyo",
                    "Portekiz",
                    "Yunanistan",
                    "Belçika",
                    "Avusturya",
                    "İsviçre",
                    "İsveç",
                    "Norveç",
                    "Danimarka",
                    "Finlandiya",
                    "Çek Cumhuriyeti",
                    "Macaristan",
                    "Romanya",
                    "Bulgaristan",
                    "Hırvatistan",
                    "Sırbistan",
                    "Slovenya",
                    "Slovakya",
                    "Litvanya",
                    "Letonya",
                    "Estonya",
                    "Ukrayna",
                    "Moldova",
                    "Belarus",
                    "Kazakistan",
                    "Gürcistan",
                    "Ermenistan",
                    "İsrail",
                    "Hindistan",
                    "Pakistan",
                    "Bangladeş",
                    "Tayland",
                    "Japonya",
                    "Güney Kore",
                    "Çin",
                    "Tayvan",
                    "Hong Kong",
                    "Singapur",
                    "Malezya",
                    "Endonezya",
                    "Filipinler",
                    "Vietnam",
                    "Brezilya",
                    "Meksika",
                    "Arjantin",
                    "Şili",
                    "Kolombiya",
                    "Peru",
                    "Venezuela",
                    "Güney Afrika",
                    "Mısır",
                    "Suudi Arabistan",
                    "Birleşik Arap Emirlikleri",
                    "Katar",
                    "Kuveyt",
                    "Bahreyn",
                    "Umman",
                    "Irak",
                    "Ürdün",
                    "Lübnan",
                    "Suriye",
                    "Yemen",
                    "Libya",
                    "Tunus",
                    "Cezayir",
                    "Fas",
                    "Sudan",
                    "Etiyopya",
                    "Kenya",
                    "Nijerya",
                    "Gana",
                    "Avustralya",
                    "Yeni Zelanda",
                    "Kanada",
                    "İrlanda",
                    "İzlanda",
                    "Malta",
                    "Kıbrıs",
                    "Arnavutluk",
                    "Kuzey Makedonya",
                    "Bosna Hersek",
                    "Karadağ",
                    "Kosova",
                    "+18"
                }

                if category not in allowed_categories:
                    i = j + 1
                    continue

                is_adult = False
                name_lower = (clean_name or name).lower()
                cat_lower = category.lower() if category else ""
                adult_kw = ['+18', 'adult', 'xxx', 'porn', 'brazzers', 'playboy', 'hustler', 'vivid', 'penthouse', 'onlyfans']
                if any(k in name_lower for k in adult_kw) or any(k in cat_lower for k in adult_kw):
                    is_adult = True

                channels.append({
                    "id": str(uuid.uuid4()),
                    "name": clean_name or name,
                    "original_name": clean_name or name,
                    "norm_name": normalize_name(clean_name or name),
                    "logo": attrs.get("tvg-logo") or None,
                    "category": category,
                    "vip": vip,
                    "adult": is_adult,
                    "hidden": False,
                    "stream_url_enc": fernet.encrypt(url.encode()).decode(),
                    "source_id": source_id,
                    "created_at": datetime.now(timezone.utc),
                })
                count += 1
            i = j + 1
        else:
            i += 1

    logger.info(f"parse_m3u done: {len(channels)} channels from {total} lines")
    return channels


async def _download_m3u(url: str, max_retries: int = 3) -> str:
    """Download M3U with streaming + range resume + temp file for large files."""
    import tempfile
    headers = {
        "User-Agent": "VLC/3.0.20 LibVLC/3.0.20",
        "Accept-Encoding": "identity",
        "Accept": "*/*",
        "Connection": "keep-alive",
    }
    total_received = 0
    temp_path = None

    for attempt in range(max_retries):
        try:
            logger.info(f"M3U DOWNLOAD attempt {attempt + 1}/{max_retries} — received so far: {total_received} bytes")
            req_headers = dict(headers)
            if total_received > 0:
                req_headers["Range"] = f"bytes={total_received}-"
                logger.info(f"Resuming from byte {total_received}")

            async with httpx.AsyncClient(
                timeout=httpx.Timeout(300.0, connect=60.0),
                follow_redirects=True,
            ) as ac:
                async with ac.stream("GET", url, headers=req_headers) as response:
                    if response.status_code not in (200, 206):
                        response.raise_for_status()

                    logger.info(f"M3U RESPONSE STATUS = {response.status_code}")

                    # Temp file'a stream et
                    if temp_path is None:
                        fd, temp_path = tempfile.mkstemp(suffix=".m3u")
                        os.close(fd)
                    with open(temp_path, "a", encoding="utf-8", errors="ignore") as f:
                        async for chunk in response.aiter_text():
                            f.write(chunk)
                            total_received += len(chunk)
                            if total_received % 50000000 < 100000:
                                logger.info(f"M3U DOWNLOADED so far: {total_received} bytes")

            logger.info(f"M3U DOWNLOAD COMPLETE: {total_received} bytes")
            break

        except Exception as e:
            logger.warning(f"M3U download attempt {attempt + 1} failed: {type(e).__name__}: {e}")
            if attempt == max_retries - 1:
                logger.exception(f"All {max_retries} retries failed for M3U")
                if total_received == 0:
                    if temp_path and os.path.exists(temp_path):
                        os.remove(temp_path)
                    return ""
                logger.warning(f"Using partial download: {total_received} bytes")
                break
            await asyncio.sleep(2 ** attempt)

    # Temp file'dan oku
    if temp_path and os.path.exists(temp_path):
        with open(temp_path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()
        os.remove(temp_path)
        return text
    return ""


async def sync_source(source: dict) -> int:
    try:
        url = fernet.decrypt(source["url_enc"].encode()).decode()
    except Exception:
        return 0

    logger.info(f"SYNC START for source={source['id']} url={mask_url(url)}")

    text = await _download_m3u(url)
    if not text:
        logger.error(f"M3U download empty/failed for {source['id']}")
        return 0

    logger.info(f"M3U TEXT SIZE = {len(text)}")
    if len(text) > 0:
        logger.info(text[:1000])

    logger.info("STARTING PARSE")
    try:
        # Event loop bloklanmasın diye parse işlemini arka plan thread'ine at
        new_channels = await asyncio.to_thread(parse_m3u, text, source["id"])
    except Exception:
        logger.exception(f"Parse failed for M3U {source['id']}")
        return 0
    logger.info("PARSE FINISHED")
    logger.info(f"PARSED CHANNELS = {len(new_channels)}")

    try:
        existing = await db.channels.find({"source_id": source["id"]}, {"_id": 0}).to_list(None)
        overrides: dict = {}

        def _has_override(d: dict) -> bool:
            return bool(
                d.get("name_overridden") or d.get("category_overridden")
                or d.get("vip_overridden") or d.get("hidden") or d.get("adult_overridden")
            )

        for c in existing:
            key = c.get("original_name") or c.get("name")
            if not key:
                continue
            prev = overrides.get(key)
            if prev is None or (_has_override(c) and not _has_override(prev)):
                overrides[key] = c

        used: set = set()
        for c in new_channels:
            ov = overrides.get(c["original_name"])
            if ov and ov["id"] not in used:
                used.add(ov["id"])
                c["id"] = ov["id"]
                c["hidden"] = ov.get("hidden", False)
                if ov.get("name_overridden"):
                    c["name"] = ov.get("name", c["name"])
                    c["name_overridden"] = True
                if ov.get("category_overridden"):
                    c["category"] = ov.get("category", c["category"])
                    c["category_overridden"] = True
                if ov.get("vip_overridden"):
                    c["vip"] = ov.get("vip", c["vip"])
                    c["vip_overridden"] = True
                if ov.get("adult_overridden"):
                    c["adult"] = ov.get("adult", c.get("adult", False))
                    c["adult_overridden"] = True

        await db.channels.delete_many({"source_id": source["id"]})

        if new_channels:
            chunk_size = 5000
            for i in range(0, len(new_channels), chunk_size):
                await db.channels.insert_many(new_channels[i:i + chunk_size])

        await db.m3u_sources.update_one(
            {"id": source["id"]},
            {"$set": {"last_synced": datetime.now(timezone.utc), "channel_count": len(new_channels)}},
        )
        logger.info(f"SYNC DONE for {source['id']}: {len(new_channels)} channels")
        return len(new_channels)
    except Exception as e:
        logger.exception(f"DB Error while syncing M3U {source['id']}: {e}")
        return 0


# ---------- Routes: Auth ----------
@api_router.post("/auth/register", response_model=TokenRes)
@limiter.limit("5/minute")
async def register(request: Request, body: RegisterReq):
    uname = body.username.strip().lower()
    if len(uname) < 3:
        raise HTTPException(400, "Kullanıcı adı en az 3 karakter olmalı")
    if len(body.password) < 8:
        raise HTTPException(400, "Şifre en az 8 karakter olmalı")
    if not re.search(r"[A-Z]", body.password):
        raise HTTPException(400, "Şifrede en az bir büyük harf olmalı")
    if not re.search(r"[a-z]", body.password):
        raise HTTPException(400, "Şifrede en az bir küçük harf olmalı")
    if not re.search(r"\d", body.password):
        raise HTTPException(400, "Şifrede en az bir rakam olmalı")
    if await db.users.find_one({"username": uname}):
        raise HTTPException(400, "Bu kullanıcı adı alınmış")
    uid = str(uuid.uuid4())
    user = {
        "id": uid,
        "username": uname,
        "password": hash_password(body.password),
        "role": "user",
        "favorites": [],
        "blocked": False,
        "adult_allowed": False,
        "vip_until": None,
        "created_at": datetime.now(timezone.utc),
    }
    await db.users.insert_one(user)
    access_token = make_access_token(uid)
    refresh_token = make_refresh_token(uid)
    await db.refresh_tokens.insert_one({
        "jti": jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALG])["jti"],
        "user_id": uid,
        "token_hash": hash_token(refresh_token),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    })
    return TokenRes(access_token=access_token, refresh_token=refresh_token, user=public_user(user))


@api_router.post("/auth/login", response_model=TokenRes)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginReq):
    uname = body.username.strip().lower()
    user = await db.users.find_one({"username": uname})
    if not user or not verify_password(body.password, user["password"]):
        raise HTTPException(401, "Hatalı kullanıcı adı veya şifre")
    if user.get("blocked"):
        raise HTTPException(403, "Hesabınız engellenmiştir")
    access_token = make_access_token(user["id"])
    refresh_token = make_refresh_token(user["id"])
    await db.refresh_tokens.insert_one({
        "jti": jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALG])["jti"],
        "user_id": user["id"],
        "token_hash": hash_token(refresh_token),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    })
    return TokenRes(access_token=access_token, refresh_token=refresh_token, user=public_user(user))


@api_router.post("/auth/refresh", response_model=TokenRes)
@limiter.limit("10/minute")
async def refresh_token(request: Request, body: RefreshReq):
    try:
        payload = jwt.decode(body.refresh_token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Geçersiz refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(401, "Geçersiz token tipi")
    jti = payload.get("jti")
    stored = await db.refresh_tokens.find_one({"jti": jti})
    if not stored:
        raise HTTPException(401, "Refresh token bulunamadı veya iptal edildi")
    # Hash kontrolü
    if stored.get("token_hash") and stored["token_hash"] != hash_token(body.refresh_token):
        raise HTTPException(401, "Geçersiz refresh token")
    await db.refresh_tokens.delete_one({"jti": jti})
    user = await db.users.find_one({"id": payload["uid"]}, {"_id": 0, "password": 0})
    if not user:
        raise HTTPException(401, "Kullanıcı bulunamadı")
    if user.get("blocked"):
        raise HTTPException(403, "Hesabınız engellenmiştir")
    access_token = make_access_token(user["id"])
    refresh_token = make_refresh_token(user["id"])
    await db.refresh_tokens.insert_one({
        "jti": jwt.decode(refresh_token, JWT_SECRET, algorithms=[JWT_ALG])["jti"],
        "user_id": user["id"],
        "token_hash": hash_token(refresh_token),
        "created_at": datetime.now(timezone.utc),
        "expires_at": datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    })
    return TokenRes(access_token=access_token, refresh_token=refresh_token, user=public_user(user))


@api_router.post("/auth/logout")
async def logout(request: Request, body: RefreshReq):
    try:
        payload = jwt.decode(body.refresh_token, JWT_SECRET, algorithms=[JWT_ALG])
        jti = payload.get("jti")
        if jti:
            await db.refresh_tokens.delete_one({"jti": jti})
    except Exception:
        pass
    return {"ok": True}


@api_router.get("/auth/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


# ---------- Settings & Public Discovery ----------
@api_router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    doc = await db.settings.find_one({"_id": "app"}, {"_id": 0}) or {}
    s = AppSettings(**{**AppSettings().dict(), **doc})
    plans = await db.vip_plans.find({"active": True}, {"_id": 0}).to_list(50)
    wallets = await db.crypto_wallets.find({"active": True}, {"_id": 0}).to_list(50)
    show_ads = s.ads_enabled and not is_vip_active(user)
    ads: List[dict] = []
    if show_ads:
        ads = await db.ads.find({"active": True}, {"_id": 0}).to_list(50)
    return {
        "settings": s.dict(),
        "vip_plans": plans,
        "crypto_wallets": wallets,
        "ads": ads,
        "is_vip": is_vip_active(user),
    }


# ---------- Channels ----------
@api_router.get("/categories")
async def categories(user: dict = Depends(get_current_user)):
    match: dict = {"hidden": {"$ne": True}}
    if not user.get("adult_allowed"):
        match["adult"] = {"$ne": True}
        
    pipeline = [
        {"$match": match},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
    ]
    cats = await db.channels.aggregate(pipeline).to_list(500)
    return [{"name": c["_id"], "count": c["count"]} for c in cats]


@api_router.get("/channels", response_model=List[Channel])
async def list_channels(
    category: Optional[str] = None,
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 100,
    user: dict = Depends(get_current_user),
):
    page = max(1, page)
    limit = max(1, min(limit, 500))  # Max 500
    query: dict = {"hidden": {"$ne": True}}
    if category and category != "Tümü":
        query["category"] = category
    if q:
        query["name"] = {"$regex": re.escape(q), "$options": "i"}
    if not user.get("adult_allowed"):
        query["adult"] = {"$ne": True}
    skip = (page - 1) * limit
    docs = await db.channels.find(
        query, {"_id": 0, "stream_url_enc": 0, "source_id": 0, "category_overridden": 0, "vip_overridden": 0, "name_overridden": 0}
    ).skip(skip).limit(limit).to_list(limit)
    # Pool/dedupe: collapse multiple sources with the same normalized name into one entry.
    seen: dict = {}
    out: List[Channel] = []
    for d in docs:
        key = d.get("norm_name") or normalize_name(d.get("name", ""))
        if not key:
            key = (d.get("name") or "").strip().lower()
        if key in seen:
            prev_idx, prev = seen[key]
            replace = False
            if prev.get("vip") and not d.get("vip"):
                replace = True
            elif not prev.get("logo") and d.get("logo"):
                replace = True
            if replace:
                out[prev_idx] = Channel(**{k: v for k, v in d.items() if k in Channel.model_fields})
                seen[key] = (prev_idx, d)
            continue
        out.append(Channel(**{k: v for k, v in d.items() if k in Channel.model_fields}))
        seen[key] = (len(out) - 1, d)
    return out


@api_router.get("/channels/{channel_id}/stream", response_model=StreamRes)
async def get_stream(channel_id: str, user: dict = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not ch:
        raise HTTPException(404, "Kanal bulunamadı")
    if ch.get("hidden"):
        raise HTTPException(404, "Kanal kullanılamaz")
    if ch.get("vip") and not is_vip_active(user):
        raise HTTPException(403, "Bu kanal sadece VIP üyelere açıktır")
    if ch.get("adult") and not user.get("adult_allowed"):
        raise HTTPException(403, "Bu kanalı izleme yetkiniz yok (+18)")
    try:
        primary_url = fernet.decrypt(ch["stream_url_enc"].encode()).decode()
    except Exception:
        primary_url = ""

    # Pool fallbacks: gather other sources with same normalized name OR containing it.
    nname = ch.get("norm_name") or normalize_name(ch.get("name", ""))
    fallback_urls: List[str] = []
    seen_urls = {primary_url} if primary_url else set()
    if nname:
        # exact normalized match across all sources
        exact = await db.channels.find(
            {"id": {"$ne": channel_id}, "hidden": {"$ne": True}, "norm_name": nname},
            {"_id": 0, "stream_url_enc": 1},
        ).limit(50).to_list(50)
        # partial (contains) match as second tier
        tokens = [t for t in nname.split() if len(t) >= 3]
        partial_docs: list = []
        if tokens:
            regex = "|".join(re.escape(t) for t in tokens[:4])
            partial_docs = await db.channels.find(
                {"id": {"$ne": channel_id}, "hidden": {"$ne": True},
                 "norm_name": {"$regex": regex, "$ne": nname}},
                {"_id": 0, "stream_url_enc": 1},
            ).limit(50).to_list(50)
        for d in (exact + partial_docs):
            try:
                u = fernet.decrypt(d["stream_url_enc"].encode()).decode()
                if u and u not in seen_urls:
                    seen_urls.add(u)
                    fallback_urls.append(u)
                    if len(fallback_urls) >= 15:
                        break
            except Exception:
                continue

    if not primary_url and not fallback_urls:
        raise HTTPException(500, "Yayın okunamadı")
    all_urls = ([primary_url] if primary_url else []) + fallback_urls
    return StreamRes(stream_url=all_urls[0], stream_urls=all_urls)


# ---------- Favorites ----------
class FavBody(BaseModel):
    channel_id: str


@api_router.post("/favorites")
async def add_fav(body: FavBody, user: dict = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": body.channel_id}, {"norm_name": 1})
    val = ch["norm_name"] if ch and ch.get("norm_name") else body.channel_id
    await db.users.update_one({"id": user["id"]}, {"$addToSet": {"favorites": val}})
    return {"ok": True}


@api_router.delete("/favorites/{channel_id}")
async def remove_fav(channel_id: str, user: dict = Depends(get_current_user)):
    ch = await db.channels.find_one({"id": channel_id}, {"norm_name": 1})
    val = ch["norm_name"] if ch and ch.get("norm_name") else channel_id
    await db.users.update_one({"id": user["id"]}, {"$pull": {"favorites": {"$in": [val, channel_id]}}})
    return {"ok": True}


@api_router.get("/favorites", response_model=List[Channel])
async def list_favs(user: dict = Depends(get_current_user)):
    fresh = await db.users.find_one({"id": user["id"]}, {"_id": 0, "favorites": 1})
    fav_ids = (fresh or {}).get("favorites", [])
    if not fav_ids:
        return []
        
    query = {"$or": [{"id": {"$in": fav_ids}}, {"norm_name": {"$in": fav_ids}}], "hidden": {"$ne": True}}
    if not user.get("adult_allowed"):
        query["adult"] = {"$ne": True}
    docs = await db.channels.find(query,
        {"_id": 0, "stream_url_enc": 0, "source_id": 0, "category_overridden": 0, "vip_overridden": 0, "name_overridden": 0},
    ).to_list(2000)
    # Same pool dedupe
    seen: dict = {}
    out: List[Channel] = []
    for d in docs:
        key = d.get("norm_name") or normalize_name(d.get("name", ""))
        if not key:
            key = (d.get("name") or "").strip().lower()
        if key in seen:
            continue
        seen[key] = True
        out.append(Channel(**{k: v for k, v in d.items() if k in Channel.model_fields}))
    return out


# ---------- Admin: Sources ----------
@api_router.get("/admin/sources", response_model=List[M3USource])
async def admin_list_sources(user: dict = Depends(require_admin)):
    docs = await db.m3u_sources.find({}, {"_id": 0}).to_list(200)
    out = []
    for d in docs:
        try:
            url = fernet.decrypt(d["url_enc"].encode()).decode()
            d["url_masked"] = mask_url(url)
        except Exception:
            d["url_masked"] = "***"
        out.append(M3USource(**d))
    return out


@api_router.post("/admin/sources", response_model=M3USource)
async def admin_add_source(body: M3USourceCreate, user: dict = Depends(require_admin)):
    sid = str(uuid.uuid4())
    doc = {
        "id": sid, "name": body.name,
        "url_enc": fernet.encrypt(body.url.encode()).decode(),
        "active": True, "last_synced": None, "channel_count": 0,
        "created_at": datetime.now(timezone.utc),
    }
    await db.m3u_sources.insert_one(doc)
    asyncio.create_task(sync_source(doc))
    return M3USource(id=sid, name=body.name, url_masked=mask_url(body.url),
                     active=True, last_synced=None, channel_count=0)


@api_router.post("/admin/sources/{source_id}/sync")
async def admin_sync_source(source_id: str, user: dict = Depends(require_admin)):
    s = await db.m3u_sources.find_one({"id": source_id})
    if not s:
        raise HTTPException(404, "Kaynak bulunamadı")
    count = await sync_source(s)
    return {"ok": True, "channel_count": count}


@api_router.delete("/admin/sources/{source_id}")
async def admin_del_source(source_id: str, user: dict = Depends(require_admin)):
    await db.channels.delete_many({"source_id": source_id})
    await db.m3u_sources.delete_one({"id": source_id})
    return {"ok": True}


@api_router.post("/admin/sync-all")
async def admin_sync_all(user: dict = Depends(require_admin)):
    sources = await db.m3u_sources.find({"active": True}).to_list(200)
    total = 0
    for s in sources:
        total += await sync_source(s)
    return {"ok": True, "total_channels": total}


# ---------- Admin: Channels (full management) ----------
@api_router.get("/admin/channels")
async def admin_list_channels(
    category: Optional[str] = None,
    q: Optional[str] = None,
    user: dict = Depends(require_admin),
):
    query: dict = {}
    if category:
        query["category"] = category
    if q:
        query["name"] = {"$regex": re.escape(q), "$options": "i"}
    docs = await db.channels.find(query, {"_id": 0, "stream_url_enc": 0}).limit(50000).to_list(50000)
    return docs


@api_router.patch("/admin/channels/{channel_id}")
async def admin_update_channel(channel_id: str, body: ChannelUpdate, user: dict = Depends(require_admin)):
    cur = await db.channels.find_one({"id": channel_id}, {"_id": 0})
    if not cur:
        raise HTTPException(404, "Kanal bulunamadı")
    update: dict = {}
    if body.name is not None:
        update["name"] = body.name
        update["name_overridden"] = True
        update["norm_name"] = normalize_name(body.name)
        if not cur.get("original_name"):
            update["original_name"] = cur.get("name")
    if body.category is not None:
        update["category"] = body.category
        update["category_overridden"] = True
    if body.vip is not None:
        update["vip"] = body.vip
        update["vip_overridden"] = True
    if body.adult is not None:
        update["adult"] = body.adult
        update["adult_overridden"] = True
    if body.hidden is not None:
        update["hidden"] = body.hidden
    if body.logo is not None:
        update["logo"] = body.logo
    if not update:
        raise HTTPException(400, "Güncellenecek alan yok")
    await db.channels.update_one({"id": channel_id}, {"$set": update})
    return {"ok": True}


@api_router.delete("/admin/channels/{channel_id}")
async def admin_delete_channel(channel_id: str, user: dict = Depends(require_admin)):
    await db.channels.delete_one({"id": channel_id})
    return {"ok": True}


class CategoryRename(BaseModel):
    old: str
    new: str


@api_router.post("/admin/categories/rename")
async def admin_rename_category(body: CategoryRename, user: dict = Depends(require_admin)):
    res = await db.channels.update_many(
        {"category": body.old},
        {"$set": {"category": body.new, "category_overridden": True}},
    )
    return {"ok": True, "updated": res.modified_count}


@api_router.delete("/admin/categories/{name}")
async def admin_delete_category(name: str, user: dict = Depends(require_admin)):
    res = await db.channels.update_many({"category": name}, {"$set": {"hidden": True}})
    return {"ok": True, "hidden": res.modified_count}


# ---------- Admin: Users ----------
@api_router.get("/admin/users", response_model=List[UserPublic])
async def admin_list_users(user: dict = Depends(require_admin)):
    docs = await db.users.find({}, {"_id": 0, "password": 0}).to_list(5000)
    return [public_user(d) for d in docs]


@api_router.patch("/admin/users/{user_id}/role", response_model=UserPublic)
async def admin_set_role(user_id: str, body: UserRoleUpdate, user: dict = Depends(require_admin)):
    upd = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": {"role": body.role}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0, "password": 0},
    )
    if not upd:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return public_user(upd)


@api_router.patch("/admin/users/{user_id}/block", response_model=UserPublic)
async def admin_set_block(user_id: str, body: UserBlockUpdate, user: dict = Depends(require_admin)):
    upd = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": {"blocked": body.blocked}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0, "password": 0},
    )
    if not upd:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return public_user(upd)


@api_router.patch("/admin/users/{user_id}/adult", response_model=UserPublic)
async def admin_set_adult(user_id: str, body: UserAdultUpdate, user: dict = Depends(require_admin)):
    upd = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": {"adult_allowed": body.adult_allowed}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0, "password": 0},
    )
    if not upd:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return public_user(upd)


class GrantVip(BaseModel):
    days: int


@api_router.post("/admin/users/{user_id}/grant-vip", response_model=UserPublic)
async def admin_grant_vip(user_id: str, body: GrantVip, user: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    cur = await db.users.find_one({"id": user_id})
    if not cur:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    base = cur.get("vip_until") if isinstance(cur.get("vip_until"), datetime) and cur["vip_until"] > now else now
    new_until = base + timedelta(days=body.days)
    upd = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": {"vip_until": new_until, "role": "vip"}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0, "password": 0},
    )
    return public_user(upd)


@api_router.post("/admin/users/{user_id}/revoke-vip", response_model=UserPublic)
async def admin_revoke_vip(user_id: str, user: dict = Depends(require_admin)):
    upd = await db.users.find_one_and_update(
        {"id": user_id}, {"$set": {"vip_until": None, "role": "user"}},
        return_document=ReturnDocument.AFTER, projection={"_id": 0, "password": 0},
    )
    if not upd:
        raise HTTPException(404, "Kullanıcı bulunamadı")
    return public_user(upd)


@api_router.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: str, user: dict = Depends(require_admin)):
    if user_id == user["id"]:
        raise HTTPException(400, "Kendinizi silemezsiniz")
    await db.users.delete_one({"id": user_id})
    await db.refresh_tokens.delete_many({"user_id": user_id})
    return {"ok": True}


# ---------- Admin: App settings ----------
@api_router.get("/admin/settings", response_model=AppSettings)
async def admin_get_settings(user: dict = Depends(require_admin)):
    doc = await db.settings.find_one({"_id": "app"}, {"_id": 0}) or {}
    return AppSettings(**{**AppSettings().dict(), **doc})


@api_router.put("/admin/settings", response_model=AppSettings)
async def admin_put_settings(body: AppSettings, user: dict = Depends(require_admin)):
    await db.settings.update_one({"_id": "app"}, {"$set": body.dict()}, upsert=True)
    return body


# ---------- Admin: VIP Plans ----------
@api_router.get("/admin/vip-plans", response_model=List[VipPlan])
async def admin_vip_plans(user: dict = Depends(require_admin)):
    docs = await db.vip_plans.find({}, {"_id": 0}).to_list(100)
    return [VipPlan(**d) for d in docs]


@api_router.post("/admin/vip-plans", response_model=VipPlan)
async def admin_add_vip_plan(body: VipPlanCreate, user: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), **body.dict()}
    await db.vip_plans.insert_one(doc.copy())
    return VipPlan(**doc)


@api_router.patch("/admin/vip-plans/{plan_id}", response_model=VipPlan)
async def admin_update_vip_plan(plan_id: str, body: VipPlanCreate, user: dict = Depends(require_admin)):
    upd = await db.vip_plans.find_one_and_update(
        {"id": plan_id}, {"$set": body.dict()},
        return_document=ReturnDocument.AFTER, projection={"_id": 0},
    )
    if not upd:
        raise HTTPException(404, "Plan bulunamadı")
    return VipPlan(**upd)


@api_router.delete("/admin/vip-plans/{plan_id}")
async def admin_delete_vip_plan(plan_id: str, user: dict = Depends(require_admin)):
    await db.vip_plans.delete_one({"id": plan_id})
    return {"ok": True}


# ---------- Admin: Crypto Wallets ----------
@api_router.get("/admin/crypto", response_model=List[CryptoWallet])
async def admin_list_crypto(user: dict = Depends(require_admin)):
    docs = await db.crypto_wallets.find({}, {"_id": 0}).to_list(100)
    return [CryptoWallet(**d) for d in docs]


@api_router.post("/admin/crypto", response_model=CryptoWallet)
async def admin_add_crypto(body: CryptoWalletCreate, user: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), **body.dict()}
    await db.crypto_wallets.insert_one(doc.copy())
    return CryptoWallet(**doc)


@api_router.patch("/admin/crypto/{wallet_id}", response_model=CryptoWallet)
async def admin_update_crypto(wallet_id: str, body: CryptoWalletCreate, user: dict = Depends(require_admin)):
    upd = await db.crypto_wallets.find_one_and_update(
        {"id": wallet_id}, {"$set": body.dict()},
        return_document=ReturnDocument.AFTER, projection={"_id": 0},
    )
    if not upd:
        raise HTTPException(404, "Cüzdan bulunamadı")
    return CryptoWallet(**upd)


@api_router.delete("/admin/crypto/{wallet_id}")
async def admin_delete_crypto(wallet_id: str, user: dict = Depends(require_admin)):
    await db.crypto_wallets.delete_one({"id": wallet_id})
    return {"ok": True}


# ---------- Admin: Ads ----------
@api_router.get("/admin/ads", response_model=List[Ad])
async def admin_list_ads(user: dict = Depends(require_admin)):
    docs = await db.ads.find({}, {"_id": 0}).to_list(200)
    return [Ad(**d) for d in docs]


@api_router.post("/admin/ads", response_model=Ad)
async def admin_add_ad(body: AdCreate, user: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), **body.dict()}
    await db.ads.insert_one(doc.copy())
    return Ad(**doc)


@api_router.patch("/admin/ads/{ad_id}", response_model=Ad)
async def admin_update_ad(ad_id: str, body: AdCreate, user: dict = Depends(require_admin)):
    upd = await db.ads.find_one_and_update(
        {"id": ad_id}, {"$set": body.dict()},
        return_document=ReturnDocument.AFTER, projection={"_id": 0},
    )
    if not upd:
        raise HTTPException(404, "Reklam bulunamadı")
    return Ad(**upd)


@api_router.delete("/admin/ads/{ad_id}")
async def admin_delete_ad(ad_id: str, user: dict = Depends(require_admin)):
    await db.ads.delete_one({"id": ad_id})
    return {"ok": True}


# ---------- Stats ----------
@api_router.get("/admin/stats")
async def admin_stats(user: dict = Depends(require_admin)):
    users = await db.users.count_documents({})
    vips = await db.users.count_documents({"$or": [{"role": "vip"}, {"role": "admin"}]})
    blocked = await db.users.count_documents({"blocked": True})
    channels = await db.channels.count_documents({"hidden": {"$ne": True}})
    hidden = await db.channels.count_documents({"hidden": True})
    sources = await db.m3u_sources.count_documents({})
    return {
        "users": users, "vips": vips, "blocked": blocked,
        "channels": channels, "hidden_channels": hidden, "sources": sources,
    }


@api_router.get("/")
async def root():
    return {"ok": True, "service": "iptv"}


api_router.get("/health")(lambda: {"ok": True})

app.include_router(api_router)
# Production'da allow_origins=["*"] yerine domain belirt
# Örn: ["https://panel.site.com", "https://app.site.com"]
_cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
if "*" in _cors_origins:
    logger.warning("CORS allow_origins='*' — production'da domain kısıtlaması yapın!")
app.add_middleware(
    CORSMiddleware, allow_credentials=True, allow_origins=_cors_origins,
    allow_methods=["*"], allow_headers=["*"],
)


# ---------- Seed ----------
async def seed():
    if not await db.users.find_one({"username": "admin"}):
        admin_pw = os.environ.get("ADMIN_PASSWORD", "admin123")
        await db.users.insert_one({
            "id": str(uuid.uuid4()),
            "username": "admin",
            "password": hash_password(admin_pw),
            "role": "admin",
            "favorites": [],
            "blocked": False,
            "adult_allowed": True,
            "vip_until": None,
            "created_at": datetime.now(timezone.utc),
        })
        logger.info("Seeded admin user")

    if await db.vip_plans.count_documents({}) == 0:
        await db.vip_plans.insert_many([
            {"id": str(uuid.uuid4()), "name": "1 Aylık VIP", "days": 30, "price_usd": 5, "price_try": 175, "description": "1 ay reklamsız + VIP kanallar", "active": True},
            {"id": str(uuid.uuid4()), "name": "3 Aylık VIP", "days": 90, "price_usd": 12, "price_try": 420, "description": "3 ay, %20 indirim", "active": True},
            {"id": str(uuid.uuid4()), "name": "1 Yıllık VIP", "days": 365, "price_usd": 40, "price_try": 1400, "description": "1 yıl, en uygun fiyat", "active": True},
        ])
    if await db.settings.count_documents({"_id": "app"}) == 0:
        await db.settings.insert_one({"_id": "app", **AppSettings().dict()})

    if await db.channels.count_documents({}) == 0:
        demo = [
            {"name": "Big Buck Bunny", "category": "Filmler", "vip": False,
             "logo": None, "url": "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"},
            {"name": "Apple Bipbop", "category": "Filmler", "vip": False,
             "logo": None, "url": "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8"},
            {"name": "Sintel 4K", "category": "Filmler", "vip": True,
             "logo": None, "url": "https://bitdash-a.akamaihd.net/content/sintel/hls/playlist.m3u8"},
            {"name": "Tears of Steel", "category": "Filmler", "vip": False,
             "logo": None, "url": "https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8"},
            {"name": "Akamai Live", "category": "Haberler", "vip": False,
             "logo": None, "url": "https://moctobpltc-i.akamaihd.net/hls/live/571329/eight/playlist.m3u8"},
            {"name": "Mux Test", "category": "Spor", "vip": False,
             "logo": None, "url": "https://test-streams.mux.dev/test_001/stream.m3u8"},
        ]
        docs = []
        for d in demo:
            docs.append({
                "id": str(uuid.uuid4()),
                "name": d["name"],
                "original_name": d["name"],
                "norm_name": normalize_name(d["name"]),
                "logo": d["logo"],
                "category": d["category"],
                "vip": d["vip"],
                "hidden": False,
                "stream_url_enc": fernet.encrypt(d["url"].encode()).decode(),
                "source_id": "seed",
                "created_at": datetime.now(timezone.utc),
            })
        await db.channels.insert_many(docs)
        logger.info(f"Seeded {len(docs)} demo channels")


@app.on_event("startup")
async def on_start():
    await seed()

    # Expired refresh token temizliği
    try:
        del_result = await db.refresh_tokens.delete_many({
            "expires_at": {"$lt": datetime.now(timezone.utc)}
        })
        if del_result.deleted_count > 0:
            logger.info(f"Cleaned {del_result.deleted_count} expired refresh tokens")
    except Exception as e:
        logger.warning(f"Token cleanup skipped: {e}")

    # MongoDB index'leri
    try:
        await db.users.create_index("username", unique=True)
        await db.users.create_index("id", unique=True)
        await db.channels.create_index("id", unique=True)
        await db.channels.create_index("norm_name")
        await db.channels.create_index("category")
        await db.channels.create_index("source_id")
        await db.refresh_tokens.create_index("jti", unique=True)
        await db.refresh_tokens.create_index("user_id")
        # TTL index: expires_at zamanı gelince otomatik sil
        await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.m3u_sources.create_index("id", unique=True)
        logger.info("MongoDB indexes created")
    except Exception as e:
        logger.warning(f"Index creation skipped: {e}")

    # Backfill norm_name on existing channels (bulk write ile).
    try:
        from pymongo import UpdateOne
        cursor = db.channels.find({"norm_name": {"$exists": False}}, {"_id": 0, "id": 1, "name": 1})
        bulk_ops = []
        count = 0
        async for d in cursor:
            bulk_ops.append(UpdateOne(
                {"id": d["id"]},
                {"$set": {"norm_name": normalize_name(d.get("name", ""))}}
            ))
            if len(bulk_ops) >= 500:
                await db.channels.bulk_write(bulk_ops)
                count += len(bulk_ops)
                bulk_ops = []
        if bulk_ops:
            await db.channels.bulk_write(bulk_ops)
            count += len(bulk_ops)
        if count > 0:
            logger.info(f"Backfilled norm_name for {count} channels")
    except Exception as e:
        logger.warning(f"norm_name backfill skipped: {e}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
