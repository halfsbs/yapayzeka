import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
  Dimensions,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";

let expoVideoPkg: any = null;
try { expoVideoPkg = require("expo-video"); } catch (e) {}

let vlcPlayerPkg: any = null;
try { vlcPlayerPkg = require("react-native-vlc-media-player"); } catch (e) {}

type PlayerMode = "expo-video" | "vlc";

export default function Player() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();

  const [urls, setUrls] = useState<string[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Alt kısımda elinle seçeceğin oynatıcı modu
  const [selectedMode, setSelectedMode] = useState<PlayerMode>(
    expoVideoPkg ? "expo-video" : "vlc"
  );

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const me = await api.me();
        if (!isMounted) return;
        setFav(me.favorites.includes(id));

        const streamRes = await api.stream(id);
        const allUrls = [streamRes.stream_url, ...(streamRes.stream_urls || [])].filter(Boolean);
        setUrls(allUrls);
        setActiveIdx(0);
        setError(null);
      } catch (e: any) {
        if (isMounted) {
          setError(e?.message || "Yayin yuklenemedi");
        }
      }
    })();
    return () => { isMounted = false; };
  }, [id]);

  const toggleFav = async () => {
    try {
      if (fav) { await api.delFav(id); setFav(false); }
      else { await api.addFav(id); setFav(true); }
    } catch {}
  };

  const tryNext = useCallback(() => {
    if (!urls) return;
    if (activeIdx + 1 < urls.length) {
      setActiveIdx((v) => v + 1);
      setError(null);
    } else {
      setError("Tum yayinlar denendi, kanal acilamiyor.");
    }
  }, [urls, activeIdx]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" hidden={true} />

      {/* Tam ekrandayken üst barı gizle kanka */}
      {!isFullscreen && (
        <View style={styles.head}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>
            {name || "Kanal"}
          </Text>
          <Pressable onPress={toggleFav}>
            <Ionicons
              name={fav ? "heart" : "heart-outline"}
              size={26}
              color={fav ? "#ff4d4d" : "#fff"}
            />
          </Pressable>
        </View>
      )}

      {/* Video Alanı (Tam ekransa tüm ekranı kaplar) */}
      <View style={[styles.videoBox, isFullscreen && styles.videoBoxFullscreen]}>
        {error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={50} color="red" />
            <Text style={styles.err}>{error}</Text>
          </View>
        ) : !urls ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loading}>Yukleniyor...</Text>
          </View>
        ) : (
          <PlayerInner
            key={`${id}-${activeIdx}-${selectedMode}`}
            url={urls[activeIdx]}
            mode={selectedMode}
            onTryNext={tryNext}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
          />
        )}
      </View>

      {/* Alt Kontrol ve Seçenek Paneli (Tam ekrandayken gizlenir) */}
      {!isFullscreen && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{name}</Text>
          <Text style={styles.infoSub}>Canli Yayin</Text>

          {/* İstediğin o alt seçenek butonları müdür */}
          <Text style={styles.sectionTitle}>Oynatici Motoru Seç:</Text>
          <View style={styles.modeSelector}>
            {expoVideoPkg && (
              <Pressable
                onPress={() => setSelectedMode("expo-video")}
                style={[styles.modeBtn, selectedMode === "expo-video" && styles.modeBtnActive]}
              >
                <Ionicons name="flash" size={16} color={selectedMode === "expo-video" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "expo-video" && styles.modeBtnTextActive]}>
                  Expo Video
                </Text>
              </Pressable>
            )}
            {vlcPlayerPkg && (
              <Pressable
                onPress={() => setSelectedMode("vlc")}
                style={[styles.modeBtn, selectedMode === "vlc" && styles.modeBtnActive]}
              >
                <Ionicons name="logo-playstation" size={16} color={selectedMode === "vlc" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "vlc" && styles.modeBtnTextActive]}>
                  VLC Player
                </Text>
              </Pressable>
            )}
          </View>

          {urls && urls.length > 1 && (
            <Pressable onPress={tryNext} style={styles.altBtn}>
              <Ionicons name="swap-horizontal" size={16} color="#000" />
              <Text style={styles.altText}>
                Yedek yayina gec ({activeIdx + 1}/{urls.length})
              </Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function PlayerInner({
  url,
  mode,
  onTryNext,
  isFullscreen,
  setIsFullscreen,
}: {
  url: string;
  mode: PlayerMode;
  onTryNext: () => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
}) {
  if (mode === "expo-video" && expoVideoPkg) {
    return <ExpoVideoPlayer url={url} onError={onTryNext} />;
  }

  if (mode === "vlc" && vlcPlayerPkg) {
    return (
      <VlcPlayer
        url={url}
        onError={onTryNext}
        isFullscreen={isFullscreen}
        setIsFullscreen={setIsFullscreen}
      />
    );
  }

  return (
    <View style={styles.center}>
      <Ionicons name="warning-outline" size={50} color="orange" />
      <Text style={styles.err}>Oynatici yuklenemedi.</Text>
    </View>
  );
}

function ExpoVideoPlayer({ url, onError }: { url: string; onError: () => void }) {
  const [ready, setReady] = useState(false);
  const useVideoPlayer = expoVideoPkg.useVideoPlayer;
  const VideoView = expoVideoPkg.VideoView;

  const finalLiveUrl = useMemo(() => {
    return url.includes("?") ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;
  }, [url]);

  const player = useVideoPlayer(finalLiveUrl, (p: any) => {
    p.play();
  });

  useEffect(() => {
    const sub = player.addListener("statusChange", (event: any) => {
      if ((event?.status || player.status) === "readyToPlay") setReady(true);
      if ((event?.status || player.status) === "error") onError();
    });
    return () => { if (sub) sub.remove(); };
  }, [player, onError]);

  return (
    <View style={{ flex: 1 }}>
      <VideoView style={{ flex: 1 }} player={player} contentFit="contain" nativeControls={true} allowsFullscreen={true} />
      {!ready && <View style={styles.loadingOverlay}><ActivityIndicator color="#fff" size="large" /></View>}
    </View>
  );
}

function VlcPlayer({
  url,
  onError,
  isFullscreen,
  setIsFullscreen,
}: {
  url: string;
  onError: () => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
}) {
  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const VLCPlayer = vlcPlayerPkg.VLCPlayer;

  // Ekrana dokununca kontrolleri açıp 3 saniye sonra kapatan Netflix mantığı müdür
  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  useEffect(() => {
    triggerControls();
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, []);

  return (
    <Pressable style={{ flex: 1 }} onPress={triggerControls}>
      <VLCPlayer
        source={{
          uri: url,
          initOptions: ["--network-caching=5000", "--live-caching=5000", "--codec=avcodec,all"],
        }}
        autoplay={true}
        paused={paused}
        autoAspectRatio={true}
        videoAspectRatio="16:9"
        resizeMode="contain"
        style={{ flex: 1 }}
        onPlaying={() => setReady(true)}
        onBuffering={(e: any) => { if (e?.isBuffering === 0) setReady(true); }}
        onError={onError}
      />

      {/* ============================================================
          MÜDÜRÜN İSTEDİĞİ O PREMIUM TAM EKRAN KONTROL KATMANI (CUSTOM UI)
         ============================================================ */}
      {ready && showControls && (
        <View style={styles.vlcUiOverlay}>
          
          {/* Üst Kısım: Çark İkonu (Ayarlar) */}
          <View style={styles.vlcUiTop}>
            <View />
            <Pressable onPress={() => alert("Ses ve Altyazi Ayarlari")} style={styles.uiCircleBtn}>
              <Ionicons name="settings-sharp" size={22} color="#fff" />
            </Pressable>
          </View>

          {/* Orta Kısım: İleri - Geri ve Play/Pause Tuşları */}
          <View style={styles.vlcUiCenter}>
            <Pressable onPress={() => alert("10 Saniye Geri")} style={styles.uiCircleBtn}>
              <Ionicons name="play-back" size={24} color="#fff" />
            </Pressable>
            
            <Pressable onPress={() => setPaused(!paused)} style={[styles.uiCircleBtn, { width: 60, height: 60, borderRadius: 30 }]}>
              <Ionicons name={paused ? "play" : "pause"} size={32} color="#fff" />
            </Pressable>

            <Pressable onPress={() => alert("10 Saniye İleri")} style={styles.uiCircleBtn}>
              <Ionicons name="play-forward" size={24} color="#fff" />
            </Pressable>
          </View>

          {/* Alt Kısım: Sarma Çubuğu (Taklit) ve Tam Ekran Butonu */}
          <View style={styles.vlcUiBottom}>
            <View style={styles.fakeProgressBar}>
              <View style={styles.fakeProgressFill} />
            </View>
            
            <Pressable onPress={() => setIsFullscreen(!isFullscreen)} style={styles.uiCircleBtn}>
              <Ionicons name={isFullscreen ? "contract" : "expand"} size={22} color="#fff" />
            </Pressable>
          </View>

        </View>
      )}

      {!ready && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>VLC Yukleniyor...</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 50,
    backgroundColor: "#1a1a1a"
  },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginHorizontal: 12,
  },
  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  videoBoxFullscreen: { width: "100%", height: "100%", aspectRatio: undefined },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  err: { color: "red", textAlign: "center" },
  loading: { color: "#aaa" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  infoBox: { padding: 20 },
  infoTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  infoSub: { color: "#aaa", marginTop: 4 },
  sectionTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 20, marginBottom: 10 },
  modeSelector: { flexDirection: "row", gap: 10, marginBottom: 15 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    padding: 12,
    backgroundColor: "#2a2a2a",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#444"
  },
  modeBtnActive: { backgroundColor: "#fff", borderColor: "#fff" },
  modeBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  modeBtnTextActive: { color: "#000" },
  altBtn: {
    flexDirection: "row",
    marginTop: 10,
    padding: 12,
    backgroundColor: "#ff9f43",
    borderRadius: 8,
    gap: 6,
    alignItems: "center",
    justifyContent: "center"
  },
  altText: { color: "#000", fontWeight: "700" },
  
  // Custom VLC UI Katmanları
  vlcUiOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "space-between",
    padding: 15,
  },
  vlcUiTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vlcUiCenter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 30 },
  vlcUiBottom: { flexDirection: "row", alignItems: "center", gap: 15 },
  uiCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center"
  },
  fakeProgressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.3)",
    borderRadius: 2,
    justifyContent: "center"
  },
  fakeProgressFill: {
    width: "35%", // Canlı yayın için temsil çubuğu
    height: "100%",
    backgroundColor: "#ff9f43",
    borderRadius: 2
  }
});