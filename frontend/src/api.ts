import AsyncStorage from "@react-native-async-storage/async-storage";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";
const ACCESS_TOKEN_KEY = "iptv_access_token";
const REFRESH_TOKEN_KEY = "iptv_refresh_token";

export type Role = "user" | "vip" | "admin";

export interface User {
  id: string;
  username: string;
  role: Role;
  favorites: string[];
  blocked: boolean;
  vip_until: string | null;
  created_at: string;
}

export interface Channel {
  id: string;
  name: string;
  logo?: string | null;
  category: string;
  vip: boolean;
}

export interface AdminChannel extends Channel {
  hidden?: boolean;
  source_id?: string;
}

export interface M3USource {
  id: string;
  name: string;
  url_masked: string;
  active: boolean;
  last_synced: string | null;
  channel_count: number;
}

export interface AppSettings {
  app_name: string;
  tagline: string;
  primary_color: string;
  vip_intro: string;
  support_msg: string;
  payment_note: string;
  ads_enabled: boolean;
}

export interface VipPlan {
  id: string;
  name: string;
  days: number;
  price_usd: number;
  price_try: number;
  description?: string;
  active: boolean;
}

export interface CryptoWallet {
  id: string;
  symbol: string;
  name: string;
  network: string;
  address: string;
  active: boolean;
}

export interface Ad {
  id: string;
  title: string;
  image_url: string;
  link_url?: string;
  type: "banner" | "interstitial";
  active: boolean;
  weight: number;
}

export interface PublicSettings {
  settings: AppSettings;
  vip_plans: VipPlan[];
  crypto_wallets: CryptoWallet[];
  ads: Ad[];
  is_vip: boolean;
}

export interface AuthRes {
  access_token: string;
  refresh_token: string;
  user: User;
}

let _accessToken: string | null = null;
let _refreshToken: string | null = null;

export async function loadAccessToken(): Promise<string | null> {
  if (_accessToken) return _accessToken;
  _accessToken = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
  return _accessToken;
}

export async function loadRefreshToken(): Promise<string | null> {
  if (_refreshToken) return _refreshToken;
  _refreshToken = await AsyncStorage.getItem(REFRESH_TOKEN_KEY);
  return _refreshToken;
}

export async function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, access);
  await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

export async function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  await AsyncStorage.removeItem(ACCESS_TOKEN_KEY);
  await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
}

async function _rawReq<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: any = { "Content-Type": "application/json", ...(opts.headers || {}) };
  const token = await loadAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const r = await fetch(`${BASE}/api${path}`, { ...opts, headers });
  if (!r.ok) {
    let msg = "İstek başarısız";
    try { const j = await r.json(); msg = j.detail || msg; } catch {}
    const err: any = new Error(msg);
    err.status = r.status;
    throw err;
  }
  if (r.status === 204) return undefined as any;
  return (await r.json()) as T;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  try {
    return await _rawReq<T>(path, opts);
  } catch (err: any) {
    if (err.status === 401) {
      const rt = await loadRefreshToken();
      if (rt) {
        try {
          const data = await _rawReq<AuthRes>("/auth/refresh", {
            method: "POST",
            body: JSON.stringify({ refresh_token: rt }),
          });
          await setTokens(data.access_token, data.refresh_token);
          return await _rawReq<T>(path, opts);
        } catch {
          await clearTokens();
        }
      }
    }
    throw err;
  }
}

export async function login(u: string, p: string): Promise<AuthRes> {
  const data = await _rawReq<AuthRes>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username: u, password: p }),
  });
  await setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function register(u: string, p: string): Promise<AuthRes> {
  const data = await _rawReq<AuthRes>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ username: u, password: p }),
  });
  await setTokens(data.access_token, data.refresh_token);
  return data;
}

export async function logout() {
  const rt = await loadRefreshToken();
  if (rt) {
    await _rawReq("/auth/logout", {
      method: "POST",
      body: JSON.stringify({ refresh_token: rt }),
    }).catch(() => {});
  }
  await clearTokens();
}

export async function refresh(): Promise<AuthRes> {
  const rt = await loadRefreshToken();
  if (!rt) throw new Error("Refresh token yok");
  const data = await _rawReq<AuthRes>("/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token: rt }),
  });
  await setTokens(data.access_token, data.refresh_token);
  return data;
}

export const api = {
  login,
  register,
  logout,
  refresh,
  me: () => req<User>("/auth/me"),
  settings: () => req<PublicSettings>("/settings"),
  categories: () => req<{ name: string; count: number }[]>("/categories"),
  channels: (category?: string, q?: string) => {
    const p = new URLSearchParams();
    if (category) p.append("category", category);
    if (q) p.append("q", q);
    const qs = p.toString();
    return req<Channel[]>(`/channels${qs ? `?${qs}` : ""}`);
  },
  stream: (id: string) => req<{ stream_url: string; stream_urls?: string[] }>(`/channels/${id}/stream`),
  addFav: (channel_id: string) => req("/favorites", { method: "POST", body: JSON.stringify({ channel_id }) }),
  delFav: (id: string) => req(`/favorites/${id}`, { method: "DELETE" }),
  favorites: () => req<Channel[]>("/favorites"),

  // Admin
  adminStats: () => req<{ users: number; vips: number; blocked: number; channels: number; hidden_channels: number; sources: number }>("/admin/stats"),
  adminSources: () => req<M3USource[]>("/admin/sources"),
  adminAddSource: (name: string, url: string) => req<M3USource>("/admin/sources", { method: "POST", body: JSON.stringify({ name, url }) }),
  adminSyncSource: (id: string) => req<{ ok: boolean; channel_count: number }>(`/admin/sources/${id}/sync`, { method: "POST" }),
  adminDelSource: (id: string) => req(`/admin/sources/${id}`, { method: "DELETE" }),
  adminSyncAll: () => req<{ ok: boolean; total_channels: number }>("/admin/sync-all", { method: "POST" }),

  adminChannels: (q?: string, category?: string) => {
    const p = new URLSearchParams();
    if (q) p.append("q", q);
    if (category) p.append("category", category);
    const qs = p.toString();
    return req<AdminChannel[]>(`/admin/channels${qs ? `?${qs}` : ""}`);
  },
  adminUpdateChannel: (id: string, body: Partial<AdminChannel>) => req(`/admin/channels/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  adminDelChannel: (id: string) => req(`/admin/channels/${id}`, { method: "DELETE" }),
  adminRenameCategory: (oldN: string, newN: string) => req("/admin/categories/rename", { method: "POST", body: JSON.stringify({ old: oldN, new: newN }) }),
  adminHideCategory: (name: string) => req(`/admin/categories/${encodeURIComponent(name)}`, { method: "DELETE" }),

  adminUsers: () => req<User[]>("/admin/users"),
  adminSetRole: (id: string, role: Role) => req<User>(`/admin/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) }),
  adminSetBlock: (id: string, blocked: boolean) => req<User>(`/admin/users/${id}/block`, { method: "PATCH", body: JSON.stringify({ blocked }) }),
  adminGrantVip: (id: string, days: number) => req<User>(`/admin/users/${id}/grant-vip`, { method: "POST", body: JSON.stringify({ days }) }),
  adminRevokeVip: (id: string) => req<User>(`/admin/users/${id}/revoke-vip`, { method: "POST" }),
  adminDelUser: (id: string) => req(`/admin/users/${id}`, { method: "DELETE" }),

  adminGetSettings: () => req<AppSettings>("/admin/settings"),
  adminPutSettings: (s: AppSettings) => req<AppSettings>("/admin/settings", { method: "PUT", body: JSON.stringify(s) }),

  adminVipPlans: () => req<VipPlan[]>("/admin/vip-plans"),
  adminAddVipPlan: (p: Omit<VipPlan, "id">) => req<VipPlan>("/admin/vip-plans", { method: "POST", body: JSON.stringify(p) }),
  adminUpdateVipPlan: (id: string, p: Omit<VipPlan, "id">) => req<VipPlan>(`/admin/vip-plans/${id}`, { method: "PATCH", body: JSON.stringify(p) }),
  adminDelVipPlan: (id: string) => req(`/admin/vip-plans/${id}`, { method: "DELETE" }),

  adminCrypto: () => req<CryptoWallet[]>("/admin/crypto"),
  adminAddCrypto: (w: Omit<CryptoWallet, "id">) => req<CryptoWallet>("/admin/crypto", { method: "POST", body: JSON.stringify(w) }),
  adminUpdateCrypto: (id: string, w: Omit<CryptoWallet, "id">) => req<CryptoWallet>(`/admin/crypto/${id}`, { method: "PATCH", body: JSON.stringify(w) }),
  adminDelCrypto: (id: string) => req(`/admin/crypto/${id}`, { method: "DELETE" }),

  adminAds: () => req<Ad[]>("/admin/ads"),
  adminAddAd: (a: Omit<Ad, "id">) => req<Ad>("/admin/ads", { method: "POST", body: JSON.stringify(a) }),
  adminUpdateAd: (id: string, a: Omit<Ad, "id">) => req<Ad>(`/admin/ads/${id}`, { method: "PATCH", body: JSON.stringify(a) }),
  adminDelAd: (id: string) => req(`/admin/ads/${id}`, { method: "DELETE" }),
};

export const theme = {
  bg: "#0A0A0C",
  bg2: "#121217",
  surface: "#1A1A22",
  surface2: "#23232E",
  border: "#2A2A36",
  text: "#F5F5F7",
  textDim: "#9A9AA8",
  textMute: "#6B6B78",
  accent: "#C8102E",
  accentSoft: "#7A0A1F",
  gold: "#D4AF37",
  success: "#22C55E",
  danger: "#EF4444",
};
