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

let expoVideoPkg: any = null;
try {
  expoVideoPkg = require("expo-video");
} catch (e) {}

let vlcPlayerPkg: any = null;
try {
  vlcPlayerPkg = require("react-native-vlc-media-player");
} catch (e) {}

type PlayerMode = "expo-video" | "vlc";

export default function Player() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();

  const [urls, setUrls] = useState<string[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);
  
  // Oynatıcı seçimini tamamen kullanıcıya bırakan state kanka
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

    return () => {
      isMounted = false;
    };
  }, [id]);

  const toggleFav = async () => {
    try {
      if (fav) {
        await api.delFav(id);
        setFav(false);
      } else {
        await api.addFav(id);
        setFav(true);
      }
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

      {/* Üst Bar */}
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

      {/* Video Alanı */}
      <View style={styles.videoBox}>
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
          />
        )}
      </View>

      {/* Alt Kontrol ve Bilgi Paneli */}
      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>{name}</Text>
        <Text style={styles.infoSub}>Canli Yayin</Text>

        {/* Oynatıcı Seçim Seçenekleri (İstediğin Modu Elinle Seç kanka) */}
        <Text style={styles.sectionTitle}>Oynatici Motoru Seç:</Text>
        <View style={styles.modeSelector}>
          {expoVideoPkg && (
            <Pressable
              onPress={() => setSelectedMode("expo-video")}
              style={[styles.modeBtn, selectedMode === "expo-video" && styles.modeBtnActive]}
            >
              <Ionicons name="flash" size={16} color={selectedMode === "expo-video" ? "#000" : "#fff"} />
              <Text style={[styles.modeBtnText, selectedMode === "expo-video" && styles.modeBtnTextActive]}>
                Expo Video (Modern)
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
                VLC Player (Güçlü Motor)
              </Text>
            </Pressable>
          )}
        </View>

        {urls && urls.length > 1 && (
          <Pressable onPress={tryNext} style={styles.altBtn}>
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.altText}>
              Yedek yayina gec ({activeIdx + 1}/{urls.length})
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PlayerInner({
  url,
  mode,
  onTryNext,
}: {
  url: string;
  mode: PlayerMode;
  onTryNext: () => void;
}) {
  const handleError = useCallback(
    (msg: string, currentMode: PlayerMode) => {
      console.log(`[Player] Hata (${currentMode}): ${msg}`);
      // Artık otomatik mod geçişi yok, hata verirse direkt sonraki yedek URL'yi dener kanka
      onTryNext();
    },
    [onTryNext]
  );

  if (mode === "expo-video" && expoVideoPkg) {
    return (
      <ExpoVideoPlayer
        url={url}
        onError={(msg) => handleError(msg, "expo-video")}
      />
    );
  }

  if (mode === "vlc" && vlcPlayerPkg) {
    return (
      <VlcPlayer
        url={url}
        onError={(msg) => handleError(msg, "vlc")}
      />
    );
  }

  return (
    <View style={styles.center}>
      <Ionicons name="warning-outline" size={50} color="orange" />
      <Text style={styles.err}>Oynatici kullanilabilir degil.</Text>
    </View>
  );
}

function ExpoVideoPlayer({
  url,
  onError,
}: {
  url: string;
  onError: (msg: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isFailedTriggered = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const useVideoPlayer = expoVideoPkg.useVideoPlayer;
  const VideoView = expoVideoPkg.VideoView;

  const finalLiveUrl = useMemo(() => {
    return url.includes("?") ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;
  }, [url]);

  const player = useVideoPlayer(finalLiveUrl, (playerInstance: any) => {
    playerInstance.loop = false;
    playerInstance.muted = false;
    playerInstance.play();
  });

  useEffect(() => {
    setReady(false);
    setHasError(false);
    isFailedTriggered.current = false;

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);

    const subscription = player.addListener("statusChange", (event: any) => {
      const currentStatus = event?.status || player.status;
      const currentError = event?.error || player.error;

      if (currentStatus === "readyToPlay") {
        setReady(true);
        if (readyTimerRef.current) {
          clearTimeout(readyTimerRef.current);
          readyTimerRef.current = null;
        }
      }

      if (currentStatus === "error" || currentError) {
        setHasError(true);
        if (!isFailedTriggered.current) {
          isFailedTriggered.current = true;
          onError(String(currentError?.message || "Expo hatası"));
        }
      }
    });

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current) {
        isFailedTriggered.current = true;
        onError("Expo timeout");
      }
    }, 8000);

    return () => {
      if (subscription && typeof subscription.remove === "function") subscription.remove();
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [url, player, onError]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VideoView 
        style={{ flex: 1 }} 
        player={player} 
        contentFit="contain" 
        nativeControls={true} // Expo butonları aktif kanka
        allowsFullscreen={true}
      />
      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      )}
    </View>
  );
}

function VlcPlayer({
  url,
  onError,
}: {
  url: string;
  onError: (msg: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [paused, setPaused] = useState(false); // VLC Play/Pause kontrolü için
  const isFailedTriggered = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const VLCPlayer = vlcPlayerPkg.VLCPlayer;

  useEffect(() => {
    setReady(false);
    setHasError(false);
    setPaused(false);
    isFailedTriggered.current = false;

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current) {
        isFailedTriggered.current = true;
        onError("VLC timeout");
      }
    }, 15000);

    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [url, onError]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VLCPlayer
        source={{
          uri: url,
          initType: 1,
          initOptions: [
            "--network-caching=5000", // 4K yayınlar durmasın diye cache süresini 5 saniyeye çıkardım kanka!
            "--live-caching=5000",
            "--file-caching=5000",
            "--codec=avcodec,all",
          ],
        }}
        autoplay={true}
        paused={paused}
        autoAspectRatio={true}
        videoAspectRatio="16:9"
        resizeMode="contain"
        style={{ flex: 1 }}
        onError={(e: any) => {
          // Eğer video çoktan oynamaya başladıysa anlık dalgalanmaları ve durmaları yoksay, kanalı kapatma!
          if (ready) return; 
          setHasError(true);
          if (!isFailedTriggered.current) {
            isFailedTriggered.current = true;
            onError(String(e?.error || "VLC hatası"));
          }
        }}
        onBuffering={(e: any) => {
          if (e?.isBuffering === 0) setReady(true);
        }}
        onPlaying={() => setReady(true)}
      />

      {/* VLC İçin Ekrana Özel Kontrol Butonları Eklendi (Play/Pause) */}
      {ready && (
        <View style={styles.vlcControls}>
          <Pressable onPress={() => setPaused(!paused)} style={styles.controlBtn}>
            <Ionicons name={paused ? "play" : "pause"} size={24} color="#fff" />
          </Pressable>
        </View>
      )}

      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>VLC Motoru Yukleniyor...</Text>
        </View>
      )}
    </View>
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
  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000", position: 'relative' },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  err: { color: "red", textAlign: "center", paddingHorizontal: 20 },
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
  vlcControls: {
    position: "absolute",
    bottom: 10,
    left: 10,
    right: 10,
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "center",
  },
  controlBtn: {
    backgroundColor: "rgba(0,0,0,0.6)",
    padding: 8,
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center"
  }
});