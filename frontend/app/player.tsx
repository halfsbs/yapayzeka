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
import { Video, ResizeMode } from "expo-av";

// ============================================================
// 3'LÜ OYNATICI FALLBACK SİSTEMİ
// 1. expo-video (modern) → 2. expo-av (stabil) → 3. VLC (son kurtarıcı)
// ============================================================

let expoVideoPkg: any = null;
try {
  expoVideoPkg = require("expo-video");
} catch (e) { /* expo-video kurulu değil */ }

let vlcPlayerPkg: any = null;
try {
  vlcPlayerPkg = require("react-native-vlc-media-player");
} catch (e) { /* react-native-vlc-media-player kurulu değil */ }

type PlayerMode = "expo-video" | "expo-av" | "vlc";

const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export default function Player() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();

  const [urls, setUrls] = useState<string[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);

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
          setError(e?.message || "Yayın yüklenemedi");
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
      setError("Tüm yayınlar denendi, kanal açılamıyor.");
    }
  }, [urls, activeIdx]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" hidden={true} />

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

      <View style={styles.videoBox}>
        {error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={50} color="red" />
            <Text style={styles.err}>{error}</Text>
          </View>
        ) : !urls ? (
          <View style={styles.center}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={styles.loading}>Yükleniyor...</Text>
          </View>
        ) : (
          <PlayerInner
            key={`${id}-${activeIdx}`}
            url={urls[activeIdx]}
            onFailed={tryNext}
            onError={setError}
          />
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>{name}</Text>
        <Text style={styles.infoSub}>Canlı Yayın</Text>

        {urls && urls.length > 1 && (
          <Pressable onPress={tryNext} style={styles.altBtn}>
            <Ionicons name="swap-horizontal" size={16} color="#fff" />
            <Text style={styles.altText}>
              Yedek yayına geç ({activeIdx + 1}/{urls.length})
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

function PlayerInner({
  url,
  onFailed,
  onError,
}: {
  url: string;
  onFailed: () => void;
  onError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<PlayerMode>(
    expoVideoPkg ? "expo-video" : "expo-av"
  );

  const handleError = useCallback(
    (msg: string, currentMode: PlayerMode) => {
      const lower = msg.toLowerCase();
      const isCodecError =
        lower.includes("extractor") ||
        lower.includes("playback exception") ||
        lower.includes("source error") ||
        lower.includes("could read") ||
        lower.includes("demuxer") ||
        lower.includes("pipeline") ||
        lower.includes("codec") ||
        lower.includes("unsupported") ||
        lower.includes("media") ||
        lower.includes("none of the available");

      if (currentMode === "expo-video" && isCodecError) {
        console.log("[Player] expo-video codec hatası, expo-av'ye geçiliyor...");
        setMode("expo-av");
      } else if (currentMode === "expo-av" && vlcPlayerPkg) {
        console.log("[Player] expo-av hatası, VLC'ye geçiliyor...");
        setMode("vlc");
      } else {
        onError(msg);
      }
    },
    [onError]
  );

  if (mode === "expo-video" && expoVideoPkg) {
    return (
      <ExpoVideoPlayer
        url={url}
        onFailed={onFailed}
        onError={(msg) => handleError(msg, "expo-video")}
      />
    );
  }

  if (mode === "expo-av") {
    return (
      <ExpoAvPlayer
        url={url}
        onFailed={onFailed}
        onError={(msg) => handleError(msg, "expo-av")}
      />
    );
  }

  if (mode === "vlc" && vlcPlayerPkg) {
    return (
      <VlcPlayer
        url={url}
        onFailed={onFailed}
        onError={(msg) => handleError(msg, "vlc")}
      />
    );
  }

  return (
    <View style={styles.center}>
      <Ionicons name="warning-outline" size={50} color="orange" />
      <Text style={styles.err}>
        Hiçbir oynatıcı kullanılabilir değil.{"\n"}
        Lütfen expo-av veya react-native-vlc-media-player kurun.
      </Text>
    </View>
  );
}

// ============================================================
// 1. EXPO-VIDEO (Modern)
// ============================================================
function ExpoVideoPlayer({
  url,
  onFailed,
  onError,
}: {
  url: string;
  onFailed: () => void;
  onError: (msg: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isFailedTriggered = useRef(false);

  const useVideoPlayer = expoVideoPkg.useVideoPlayer;
  const VideoView = expoVideoPkg.VideoView;

  const finalLiveUrl = useMemo(() => {
    return url.includes("?")
      ? `${url}&_cb=${Date.now()}`
      : `${url}?_cb=${Date.now()}`;
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

    const subscription = player.addListener("statusChange", (event: any) => {
      const currentStatus = event?.status || player.status;
      const currentError = event?.error || player.error;

      if (currentStatus === "readyToPlay") {
        setReady(true);
      }

      if (currentStatus === "error" || currentError) {
        setHasError(true);
        if (!isFailedTriggered.current) {
          isFailedTriggered.current = true;
          const errMsg =
            currentError?.message ||
            currentError ||
            "Yayın yüklenemedi veya akış koptu";
          onError(String(errMsg));
          setTimeout(() => {
            onFailed();
          }, 1000);
        }
      }
    });

    return () => {
      if (subscription && typeof subscription.remove === "function") {
        subscription.remove();
      }
    };
  }, [url, player, onFailed, onError]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VideoView
        style={{ flex: 1 }}
        player={player}
        allowsFullscreen
        allowsPictureInPicture
        nativeControls
        contentFit="contain"
      />
      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>Yayın yükleniyor...</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// 2. EXPO-AV (Stabil Fallback)
// ============================================================
function ExpoAvPlayer({
  url,
  onFailed,
  onError,
}: {
  url: string;
  onFailed: () => void;
  onError: (msg: string) => void;
}) {
  const failedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);

  const handleStatusUpdate = useCallback(
    (status: any) => {
      if (status.isLoaded) {
        if (status.isPlaying || status.positionMillis > 0) {
          setReady(true);
        }
        setBuffering(status.isBuffering);
      } else {
        if (status.error) {
          setHasError(true);
          if (!failedRef.current) {
            failedRef.current = true;
            onError("Yayın akışı yüklenemedi (expo-av)");
            timerRef.current = setTimeout(() => {
              onFailed();
            }, 1000);
          }
        }
      }
    },
    [onError, onFailed]
  );

  useEffect(() => {
    failedRef.current = false;
    setBuffering(true);
    setReady(false);
    setHasError(false);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [url]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <Video
        source={{ uri: url }}
        style={{ flex: 1 }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping={false}
        onPlaybackStatusUpdate={handleStatusUpdate}
      />
      {(buffering || !ready) && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>
            Yayın yükleniyor (expo-av)...
          </Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// 3. VLC PLAYER (Son Kurtarıcı)
// ============================================================
function VlcPlayer({
  url,
  onFailed,
  onError,
}: {
  url: string;
  onFailed: () => void;
  onError: (msg: string) => void;
}) {
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isFailedTriggered = useRef(false);

  const VLCPlayer = vlcPlayerPkg.VLCPlayer;

  const handleError = useCallback(
    (e: any) => {
      setHasError(true);
      if (!isFailedTriggered.current) {
        isFailedTriggered.current = true;
        const msg =
          e?.error?.message || e?.error || "VLC oynatıcı hatası";
        onError(String(msg));
        setTimeout(() => onFailed(), 1000);
      }
    },
    [onError, onFailed]
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VLCPlayer
        source={{
          uri: url,
          initType: 1,
          initOptions: [
            "--network-caching=150",
            "--live-caching=150",
            "--file-caching=150",
            "--codec=avcodec,all",
          ],
        }}
        autoplay={true}
        autoAspectRatio={true}
        videoAspectRatio="16:9"
        resizeMode="contain"
        style={{ flex: 1 }}
        onError={handleError}
        onBuffering={(e: any) => {
          if (e?.isBuffering === 0) setReady(true);
        }}
        onPlaying={() => setReady(true)}
        onStopped={() => setReady(false)}
      />
      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>
            VLC ile yükleniyor...
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: 50,
  },
  title: {
    flex: 1,
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
    marginHorizontal: 12,
  },
  videoBox: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#000",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  err: { color: "red", textAlign: "center", paddingHorizontal: 20 },
  loading: { color: "#aaa" },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  infoBox: { padding: 20 },
  infoTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  infoSub: { color: "#aaa", marginTop: 4 },
  altBtn: {
    flexDirection: "row",
    marginTop: 10,
    padding: 10,
    backgroundColor: "#222",
    borderRadius: 8,
    gap: 6,
    alignItems: "center",
    alignSelf: "flex-start",
  },
  altText: { color: "#fff" },
});
