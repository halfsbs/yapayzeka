# LUXE TV — IPTV Mobile App (Expo) — PRD

## Overview
Türkçe arayüzlü, sinematik koyu temalı bir IPTV (canlı TV) mobil uygulaması.
Kullanıcılar kanalları kategorilere göre keşfeder, favori ekler, arar ve HLS yayını
oynatır. M3U kaynak URL'leri **son kullanıcıya asla görünmez**; yöneticiler uzaktan
güncelleyebilir ve kullanıcılar fark etmeden senkronize edilir.

## Roles
- `user` — standart kullanıcı, VIP olmayan kanalları izleyebilir.
- `vip` — VIP kanalları da izleyebilir.
- `admin` — Yönetici panel erişimi, M3U kaynak yönetimi, kullanıcı rol ataması.

## Screens (Expo Router)
- `/index` → splash + auto-route
- `/login` — kullanıcı girişi + **gizli admin girişi: logoya 5 kez dokun**
- `/register` — kayıt
- `/(tabs)/home` — kanal listesi, kategori chip'leri (yatay scroll), arama
- `/(tabs)/categories` — gradyan kategori kartları
- `/(tabs)/favorites` — kullanıcının favorileri
- `/(tabs)/profile` — profil, rol rozeti, çıkış, admin panel kısayolu
- `/category-detail?name=` — tek kategoride kanal grid
- `/player?id=&name=` — expo-video HLS oynatıcı, favori toggle
- `/admin` — M3U kaynak CRUD + sync + kullanıcı rol yönetimi

## Backend (FastAPI + MongoDB)
Tüm rotalar `/api` prefix'li.

### Auth
- `POST /api/auth/register` `{username, password}` → `{token, user}`
- `POST /api/auth/login` `{username, password}` → `{token, user}`
- `GET /api/auth/me` (Bearer)

### Channels
- `GET /api/categories` → `[{name, count}]`
- `GET /api/channels?category=&q=` → kanal listesi (stream URL **hariç**)
- `GET /api/channels/{id}/stream` → `{stream_url}` (auth, VIP kontrolü)

### Favorites
- `GET /api/favorites`
- `POST /api/favorites` `{channel_id}`
- `DELETE /api/favorites/{channel_id}`

### Admin (admin role)
- `GET /api/admin/sources` → kaynaklar (URL maskelenmiş)
- `POST /api/admin/sources` `{name, url}` → şifreli sakla, arka planda senkron başlat
- `POST /api/admin/sources/{id}/sync`
- `DELETE /api/admin/sources/{id}`
- `POST /api/admin/sync-all`
- `GET /api/admin/users`
- `PATCH /api/admin/users/{id}/role` `{role}`

## Security
- JWT (HS256, 30 gün). `JWT_SECRET` env. değişkeninden.
- Fernet (AES-CBC + HMAC) ile DB'de hem M3U kaynak URL'si hem her kanalın `stream_url` alanı şifreli saklanır. Key, `JWT_SECRET`'in SHA-256'sından deterministik üretilir.
- API yanıtları M3U kaynak URL'sini veya `stream_url_enc` alanını **hiçbir zaman** dışarı vermez. Sadece açıkça `/stream` endpoint'i çağrıldığında, doğrulanmış kullanıcı için, çözülmüş URL döner.

## Seed
İlk başlatmada: `admin/admin123` (admin rolü) ve 8 demo HLS kanalı (Filmler, Spor, Haberler, Çocuk) otomatik eklenir. Böylece uygulama hiç M3U kaynağı eklenmeden çalışır.

## Design
- Cinematic Dark theme + Deep Ruby (#C8102E) aksan + gold (#D4AF37) VIP rozeti.
- 8pt grid spacing, 44pt+ touch targets.
- 2 sütunlu kanal grid, yatay scroll kategori chip'leri (flexShrink:0, wrap yok), gradyan kategori kartları.

## Tech
- Frontend: Expo SDK 54, expo-router, expo-video, expo-image, expo-linear-gradient, AsyncStorage, react-native-safe-area-context, @expo/vector-icons.
- Backend: FastAPI, Motor, Pydantic v2, bcrypt, pyjwt, cryptography (Fernet), httpx (M3U fetch).
- DB: MongoDB collections `users`, `channels`, `m3u_sources`.

## How M3U URLs stay hidden
1. Admin /admin sayfasından URL girer.
2. Backend URL'yi Fernet ile şifreleyip `m3u_sources` koleksiyonuna yazar.
3. Arka planda fetch eder, kanalları parse eder, her kanalın stream URL'sini de Fernet ile şifreleyip `channels` koleksiyonuna yazar.
4. `/api/channels` yanıtında `stream_url_enc` projection ile ÇIKARILIR.
5. `/api/admin/sources` admin'e bile sadece maskelenmiş URL döner.
6. Son kullanıcı bir kanala tıkladığında, `/api/channels/{id}/stream` çağrılır; sadece o anlık çözülmüş URL döner. URL hiçbir yerde önbelleğe alınmaz.
