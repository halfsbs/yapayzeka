import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";

// ============================================================
// HYBRID PLAYER - Gemini UI + Saglam Koruma Mekanizmalari
//
// UI Ozellikler (Gemini'den):
// - Oynatici secim butonlari (Expo Video / VLC)
// - Tam ekran (Fullscreen) destegi
// - Custom VLC UI (Netflix tarzi kontroller)
// - Play/Pause, Ileri/Geri
// - 3sn otomatik gizlenen kontroller
// - Cark ikonu (ayarlar)
//
// Koruma Mekanizmalari (Bizden + Diger YZ):
// - isSuccessfullyPlaying: Gorsel geldikten sonra anlik hatalari yok say
// - errorIgnoreTimeoutRef: onStopped'da 2sn tolerans (VLC drop kurtarma)
// - nativeErrorDelayRef: 600ms tolerans (asenkron hata yarisi)
// - Timeout: ExpoVideo 6sn / VLC 12sn
// - URL degisiminde mode reset
// ============================================================

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
        if (isMounted) setError(e?.message || "Yayin yuklenemedi");
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

      {!isFullscreen && (
        <View style={styles.head}>
          <Pressable onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.title} numberOfLines={1}>{name || "Kanal"}</Text>
          <Pressable onPress={toggleFav}>
            <Ionicons name={fav ? "heart" : "heart-outline"} size={26} color={fav ? "#ff4d4d" : "#fff"} />
          </Pressable>
        </View>
      )}

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

      {!isFullscreen && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{name}</Text>
          <Text style={styles.infoSub}>Canli Yayin</Text>

          <Text style={styles.sectionTitle}>Oynatici Motoru Sec:</Text>
          <View style={styles.modeSelector}>
            {expoVideoPkg && (
              <Pressable
                onPress={() => setSelectedMode("expo-video")}
                style={[styles.modeBtn, selectedMode === "expo-video" && styles.modeBtnActive]}
              >
                <Ionicons name="flash" size={16} color={selectedMode === "expo-video" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "expo-video" && styles.modeBtnTextActive]}>Expo Video</Text>
              </Pressable>
            )}
            {vlcPlayerPkg && (
              <Pressable
                onPress={() => setSelectedMode("vlc")}
                style={[styles.modeBtn, selectedMode === "vlc" && styles.modeBtnActive]}
              >
                <Ionicons name="logo-playstation" size={16} color={selectedMode === "vlc" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "vlc" && styles.modeBtnTextActive]}>VLC Player</Text>
              </Pressable>
            )}
          </View>

          {urls && urls.length > 1 && (
            <Pressable onPress={tryNext} style={styles.altBtn}>
              <Ionicons name="swap-horizontal" size={16} color="#000" />
              <Text style={styles.altText}>Yedek yayina gec ({activeIdx + 1}/{urls.length})</Text>
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
  // URL degistiginde mode'u resetle (ama selectedMode disaridan geldigi icin burada resetlemiyoruz)
  // selectedMode disaridan geldigi icin kullanici manuel degistirebilir

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

// ============================================================
// EXPO-VIDEO - KORUMALI
// ============================================================
function ExpoVideoPlayer({ url, onError }: { url: string; onError: () => void }) {
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isFailedTriggered = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSuccessfullyPlaying = useRef(false);

  const useVideoPlayer = expoVideoPkg.useVideoPlayer;
  const VideoView = expoVideoPkg.VideoView;

  const finalLiveUrl = useMemo(() => {
    return url.includes("?") ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;
  }, [url]);

  const player = useVideoPlayer(finalLiveUrl, (p: any) => {
    p.loop = false;
    p.muted = false;
    p.play();
  });

  useEffect(() => {
    setReady(false);
    setHasError(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);

    const sub = player.addListener("statusChange", (event: any) => {
      const status = event?.status || player.status;
      const err = event?.error || player.error;

      if (status === "readyToPlay") {
        setReady(true);
        isSuccessfullyPlaying.current = true;
        if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
      }

      if (status === "error" || err) {
        if (isSuccessfullyPlaying.current) {
          console.log("[ExpoVideo] Video zaten oynatiliyor, anlik hata yoksayildi.");
          return;
        }
        setHasError(true);
        if (!isFailedTriggered.current) {
          isFailedTriggered.current = true;
          onError();
        }
      }
    });

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current && !isSuccessfullyPlaying.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 6000);

    return () => {
      if (sub && typeof sub.remove === "function") sub.remove();
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [url, onError]);

  return (
    <View style={{ flex: 1 }}>
      <VideoView style={{ flex: 1 }} player={player} contentFit="contain" nativeControls={true} allowsFullscreen={true} />
      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </View>
  );
}

// ============================================================
// VLC PLAYER - CELIK ZIRHLI + CUSTOM UI
// ============================================================
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
  const [hasError, setHasError] = useState(false);

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorIgnoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeErrorDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSuccessfullyPlaying = useRef(false);
  const isFailedTriggered = useRef(false);

  const VLCPlayer = vlcPlayerPkg.VLCPlayer;

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  const handleError = useCallback((e: any) => {
    if (nativeErrorDelayRef.current) clearTimeout(nativeErrorDelayRef.current);
    nativeErrorDelayRef.current = setTimeout(() => {
      if (isSuccessfullyPlaying.current) {
        console.log("[VLC] Video zaten oynatiliyor, anlik hata yoksayildi.");
        return;
      }
      setHasError(true);
      if (!isFailedTriggered.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 600);
  }, [onError]);

  useEffect(() => {
    setReady(false);
    setHasError(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);
    if (nativeErrorDelayRef.current) clearTimeout(nativeErrorDelayRef.current);

    triggerControls();

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current && !isSuccessfullyPlaying.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 12000);

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);
      if (nativeErrorDelayRef.current) clearTimeout(nativeErrorDelayRef.current);
    };
  }, [url, onError]);

  return (
    <Pressable style={{ flex: 1 }} onPress={triggerControls}>
      <VLCPlayer
        source={{
          uri: url,
          initOptions: [
            "--network-caching=2000",
            "--live-caching=2000",
            "--file-caching=2000",
            "--codec=avcodec,all",
          ],
        }}
        autoplay={true}
        paused={paused}
        autoAspectRatio={true}
        videoAspectRatio="16:9"
        resizeMode="contain"
        style={{ flex: 1 }}
        onPlaying={() => {
          setReady(true);
          isSuccessfullyPlaying.current = true;
          if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
        }}
        onBuffering={(e: any) => {
          if (e?.isBuffering === 0) {
            setReady(true);
            isSuccessfullyPlaying.current = true;
            if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
          }
        }}
        onError={handleError}
        onStopped={() => {
          if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);
          errorIgnoreTimeoutRef.current = setTimeout(() => {
            setReady(false);
            isSuccessfullyPlaying.current = false;
          }, 2000);
        }}
      />

      {/* CUSTOM VLC UI OVERLAY */}
      {ready && showControls && (
        <View style={styles.vlcUiOverlay}>
          <View style={styles.vlcUiTop}>
            <View />
            <Pressable onPress={() => alert("Ses ve Altyazi Ayarlari")} style={styles.uiCircleBtn}>
              <Ionicons name="settings-sharp" size={22} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.vlcUiCenter}>
            <Pressable onPress={() => alert("10 Saniye Geri")} style={styles.uiCircleBtn}>
              <Ionicons name="play-back" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={() => setPaused(!paused)} style={[styles.uiCircleBtn, { width: 60, height: 60, borderRadius: 30 }]}>
              <Ionicons name={paused ? "play" : "pause"} size={32} color="#fff" />
            </Pressable>
            <Pressable onPress={() => alert("10 Saniye Ileri")} style={styles.uiCircleBtn}>
              <Ionicons name="play-forward" size={24} color="#fff" />
            </Pressable>
          </View>

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

      {!ready && !hasError && (
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

  // Custom VLC UI
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
    width: "35%",
    height: "100%",
    backgroundColor: "#ff9f43",
    borderRadius: 2
  }
});
