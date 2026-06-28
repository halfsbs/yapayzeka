import { useEffect, useState, useRef } from "react";
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
// HANGİ PLAYER PAKETİNİ KULLANMAK İSTİYORSUN?
// true  = expo-video (modern, PIP destekli, QR kodda çalışır)
// false = expo-av    (klasik, Expo Go'da garanti çalışır)
// ============================================================
const USE_EXPO_VIDEO = true;

let expoVideoPkg: any = null;
try {
  expoVideoPkg = require("expo-video");
} catch (e) { /* expo-video kurulu değil */ }

import { Video, ResizeMode } from "expo-av";

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

        const proxyUrl = `${BASE}/api/channels/${id}/proxy`;
        setUrls([proxyUrl]);
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

  const tryNext = () => {
    if (!urls) return;
    if (activeIdx + 1 < urls.length) {
      setActiveIdx((v) => v + 1);
      setError(null);
    } else {
      setError("Tüm yayınlar denendi, kanal açılamıyor.");
    }
  };

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
  // DÜZELTİLDİ: Hata veren expoPkg ifadesi tamamen temizlendi
  if (USE_EXPO_VIDEO && expoVideoPkg) {
    return <ExpoVideoPlayer url={url} onFailed={onFailed} onError={onError} />;
  }
  return <ExpoAvPlayer url={url} onFailed={onFailed} onError={onError} />;
}

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

  const player = useVideoPlayer(url, (playerInstance: any) => {
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
          onError(currentError?.message || "Yayın yüklenemedi veya akış koptu");
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [buffering, setBuffering] = useState(true);
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<Video>(null);

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
        ref={videoRef}
        source={{ uri: url }}
        style={{ flex: 1 }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping={false}
        onPlaybackStatusUpdate={(status) => {
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
                onError("Yayın akışı yüklenemedi");
                timerRef.current = setTimeout(() => {
                  onFailed();
                }, 1000);
              }
            }
          }
        }}
      />
      {(buffering || !ready) && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>Yayın yükleniyor...</Text>
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