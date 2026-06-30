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
// 2'LI OYNATICI FALLBACK SISTEMI (FINAL - TUM KORUMALAR)
// 1. expo-video (modern) -> 2. VLC (son kurtarici)
// Koruma mekanizmalari:
// - hasSwitched: Bir URL icinde sadece 1 kez mod degisimi
// - isSuccessfullyPlaying: Gorsel geldikten sonra anlik hatalari yok say
// - errorIgnoreTimeoutRef: onStopped'da 2sn tolerans (VLC drop kurtarma)
// - Timeout: Asiri uzun yuklenme durumunda hata ver
// ============================================================

let expoVideoPkg: any = null;
try {
  expoVideoPkg = require("expo-video");
} catch (e) { /* expo-video kurulu degil */ }

let vlcPlayerPkg: any = null;
try {
  vlcPlayerPkg = require("react-native-vlc-media-player");
} catch (e) { /* react-native-vlc-media-player kurulu degil */ }

type PlayerMode = "expo-video" | "vlc";

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
            <Text style={styles.loading}>Yukleniyor...</Text>
          </View>
        ) : (
          <PlayerInner
            key={`${id}-${activeIdx}`}
            url={urls[activeIdx]}
            urls={urls}
            activeIdx={activeIdx}
            onTryNext={tryNext}
            onSetError={setError}
          />
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>{name}</Text>
        <Text style={styles.infoSub}>Canli Yayin</Text>

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
  urls,
  activeIdx,
  onTryNext,
  onSetError,
}: {
  url: string;
  urls: string[];
  activeIdx: number;
  onTryNext: () => void;
  onSetError: (msg: string) => void;
}) {
  const [mode, setMode] = useState<PlayerMode>(
    expoVideoPkg ? "expo-video" : "vlc"
  );
  const [hasSwitched, setHasSwitched] = useState(false);

  const handleError = useCallback(
    (msg: string, currentMode: PlayerMode) => {
      console.log(`[Player] Hata (${currentMode}): ${msg}`);

      // Eger zaten mod degistirildiyse ve hala hata varsa, sonraki URL'ye gec
      if (hasSwitched) {
        console.log("[Player] Zaten mod degistirilmis, sonraki URL'ye geciliyor...");
        onTryNext();
        return;
      }

      // Ilk hata: expo-video'dan VLC'ye gec
      if (currentMode === "expo-video" && vlcPlayerPkg) {
        console.log("[Player] expo-video hatasi, VLC'ye geciliyor...");
        setHasSwitched(true);
        setMode("vlc");
      } else {
        // VLC de calismazsa sonraki URL'ye gec
        console.log("[Player] VLC de calismadi, sonraki URL'ye geciliyor...");
        onTryNext();
      }
    },
    [hasSwitched, onTryNext]
  );

  // URL degistiginde modu ve switch durumunu resetle
  useEffect(() => {
    setMode(expoVideoPkg ? "expo-video" : "vlc");
    setHasSwitched(false);
  }, [url]);

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
      <Text style={styles.err}>
        Hicbir oynatici kullanilabilir degil.{"\n"}
        Lutfen expo-video veya react-native-vlc-media-player kurun.
      </Text>
    </View>
  );
}

// ============================================================
// 1. EXPO-VIDEO (Modern) - KORUMALI
// ============================================================
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
  const isSuccessfullyPlaying = useRef(false);

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
    isSuccessfullyPlaying.current = false;

    if (readyTimerRef.current) {
      clearTimeout(readyTimerRef.current);
    }

    const subscription = player.addListener("statusChange", (event: any) => {
      const currentStatus = event?.status || player.status;
      const currentError = event?.error || player.error;

      if (currentStatus === "readyToPlay") {
        setReady(true);
        isSuccessfullyPlaying.current = true;
        if (readyTimerRef.current) {
          clearTimeout(readyTimerRef.current);
          readyTimerRef.current = null;
        }
      }

      if (currentStatus === "error" || currentError) {
        if (isSuccessfullyPlaying.current) {
          console.log("[ExpoVideo] Video zaten oynatiliyor, anlik dalgalanma hatasi yoksayildi.");
          return;
        }

        setHasError(true);
        if (!isFailedTriggered.current) {
          isFailedTriggered.current = true;
          const errMsg =
            currentError?.message ||
            currentError ||
            "Yayin yuklenemedi veya akis koptu";
          onError(String(errMsg));
        }
      }
    });

    // 8 saniye timeout
    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current && !isSuccessfullyPlaying.current) {
        isFailedTriggered.current = true;
        onError("Yayin yuklenemedi (timeout)");
      }
    }, 8000);

    return () => {
      if (subscription && typeof subscription.remove === "function") {
        subscription.remove();
      }
      if (readyTimerRef.current) {
        clearTimeout(readyTimerRef.current);
      }
    };
  }, [url, player, onError]);

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
          <Text style={{ color: "#aaa", marginTop: 8 }}>Yayin yukleniyor...</Text>
        </View>
      )}
    </View>
  );
}

// ============================================================
// 2. VLC PLAYER (Son Kurtarici) - CELIK ZIRHLI VE KORUMALI
// ============================================================
function VlcPlayer({
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
  const errorIgnoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Gorsel geldikten sonra anlik hatalarin yedege gecmesini engelleyen koruma kilidi:
  const isSuccessfullyPlaying = useRef(false);

  const VLCPlayer = vlcPlayerPkg.VLCPlayer;

  const handleError = useCallback(
    (e: any) => {
      // Eger video zaten oynamaya basladiysa kesinlikle yedege gecme, akisi koru!
      if (isSuccessfullyPlaying.current) {
        console.log("[VLC] Video zaten oynatiliyor, anlik dalgalanma hatasi yoksayildi.");
        return;
      }

      setHasError(true);
      if (!isFailedTriggered.current) {
        isFailedTriggered.current = true;
        const msg = e?.error?.message || e?.error || "VLC oynatici hatasi";
        onError(String(msg));
      }
    },
    [onError]
  );

  useEffect(() => {
    setReady(false);
    setHasError(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);

    // 15 saniye timeout VLC icin
    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current && !isSuccessfullyPlaying.current) {
        isFailedTriggered.current = true;
        onError("VLC yuklenemedi (timeout)");
      }
    }, 15000);

    return () => {
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);
    };
  }, [url, onError]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VLCPlayer
        source={{
          uri: url,
          initType: 1,
          initOptions: [
            "--network-caching=2000", // Caching suresini 2 saniyeye cikardik, anlik kopmalari onler
            "--live-caching=2000",
            "--file-caching=2000",
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
          if (e?.isBuffering === 0) {
            setReady(true);
            isSuccessfullyPlaying.current = true; // Gorsel sinyali alindi, kilitle!
            if (readyTimerRef.current) {
              clearTimeout(readyTimerRef.current);
              readyTimerRef.current = null;
            }
          }
        }}
        onPlaying={() => {
          setReady(true);
          isSuccessfullyPlaying.current = true; // Gorsel ekrana oturdu, kilitle!
          if (readyTimerRef.current) {
            clearTimeout(readyTimerRef.current);
            readyTimerRef.current = null;
          }
        }}
        onStopped={() => {
          // ONEMLI: Anlik donmalarda kilidi hemen acmiyoruz!
          // Yayina kendini toparlamasi icin 2 saniye sans veriyoruz.
          if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);

          errorIgnoreTimeoutRef.current = setTimeout(() => {
            if (!ready) {
              setReady(false);
              isSuccessfullyPlaying.current = false; // 2 saniye boyunca sinyal gelmediyse kilidi ac
            }
          }, 2000);
        }}
      />
      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>
            VLC ile yukleniyor...
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
