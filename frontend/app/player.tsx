import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, StatusBar, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useVideoPlayer, VideoView } from "expo-video";
import { useEvent } from "expo";
import { api, theme } from "@/src/api";

export default function Player() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const router = useRouter();
  const [urls, setUrls] = useState<string[] | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fav, setFav] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.me();
        setFav(me.favorites.includes(id));
        const s = await api.stream(id);
        const list = (s.stream_urls && s.stream_urls.length > 0) ? s.stream_urls : [s.stream_url];
        setUrls(list);
        setActiveIdx(0);
      } catch (e: any) {
        setError(e.message || "Yayın yüklenemedi");
      }
    })();
  }, [id]);

  const toggleFav = async () => {
    try {
      if (fav) { await api.delFav(id); setFav(false); }
      else { await api.addFav(id); setFav(true); }
    } catch {}
  };

  const tryNext = () => {
    if (!urls) return false;
    if (activeIdx + 1 < urls.length) {
      setActiveIdx(activeIdx + 1);
      return true;
    }
    setError("Tüm yedek yayınlar denendi, kanal şu an erişilemiyor.");
    return false;
  };

  const totalSources = urls?.length ?? 0;

  return (
    <View style={styles.root} testID="player-screen">
      <StatusBar barStyle="light-content" />
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} testID="player-back" hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{name || "Kanal"}</Text>
        <Pressable onPress={toggleFav} testID="toggle-fav-button" hitSlop={10}>
          <Ionicons
            name={fav ? "heart" : "heart-outline"}
            size={26}
            color={fav ? theme.accent : theme.text}
          />
        </Pressable>
      </View>

      <View style={styles.videoBox}>
        {error ? (
          <View style={styles.center}>
            <Ionicons name="alert-circle-outline" size={48} color={theme.danger} />
            <Text style={styles.err}>{error}</Text>
            <Pressable onPress={() => router.back()} style={styles.retryBtn}>
              <Text style={styles.retryText}>Geri Dön</Text>
            </Pressable>
          </View>
        ) : !urls ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.accent} size="large" />
            <Text style={styles.loading}>Yayın hazırlanıyor...</Text>
          </View>
        ) : (
          <PlayerInner
            key={`${id}-${activeIdx}`}
            url={urls[activeIdx]}
            onFailed={tryNext}
          />
        )}
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoTitle}>{name}</Text>
        <Text style={styles.infoSub}>
          Canlı Yayın · HLS
          {totalSources > 1 ? `  ·  Kaynak ${activeIdx + 1}/${totalSources}` : ""}
        </Text>
        {totalSources > 1 && !error && (
          <Pressable
            onPress={tryNext}
            style={styles.altBtn}
            testID="try-next-source-button"
          >
            <Ionicons name="swap-horizontal" size={16} color={theme.text} />
            <Text style={styles.altText}>Yedek kaynağa geç</Text>
          </Pressable>
        )}
        <View style={styles.tipBox}>
          <Ionicons name="information-circle-outline" size={14} color={theme.textDim} />
          <Text style={styles.tipText}>
            Kanal açılmazsa otomatik olarak havuzdaki yedek yayınlara geçiş yapılır.
            Sesi duyamıyorsanız: telefonun sesini açın, sessiz modu kapatın.
          </Text>
        </View>
      </View>
    </View>
  );
}

function PlayerInner({ url, onFailed }: { url: string; onFailed: () => boolean | void }) {
  const player = useVideoPlayer({ uri: url }, p => {
    p.loop = false;
    p.muted = false;
    p.volume = 1.0;
    p.audioMixingMode = "auto";
    p.staysActiveInBackground = false;
    p.showNowPlayingNotification = false;
    p.bufferOptions = {
      preferredForwardBufferDuration: Platform.OS === "ios" ? 5 : undefined,
      waitsToMinimizeStalling: false,
      minBufferForPlayback: 2,
      maxBufferBytes: 0,
    } as any;
    p.play();
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  const failedRef = useRef(false);
  const startedAtRef = useRef(Date.now());

  // Auto-fallback when current source errors out
  useEffect(() => {
    if (status === "error" && !failedRef.current) {
      failedRef.current = true;
      onFailed();
    }
  }, [status, onFailed]);

  // Timeout: if it's still "loading" after 12s, treat as failure and move on
  useEffect(() => {
    const t = setTimeout(() => {
      if ((status === "loading" || status === "idle") && !failedRef.current) {
        failedRef.current = true;
        onFailed();
      }
    }, 12000);
    return () => clearTimeout(t);
  }, [status, onFailed]);

  useEffect(() => {
    if (status === "readyToPlay") {
      try {
        player.muted = false;
        player.volume = 1.0;
      } catch {}
    }
  }, [status, player]);

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <VideoView
        style={{ flex: 1 }}
        player={player}
        allowsPictureInPicture
        contentFit="contain"
        nativeControls
      />
      {status === "loading" && (
        <View style={[StyleSheet.absoluteFillObject, styles.center]}>
          <ActivityIndicator color={theme.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  head: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 48, paddingBottom: 12, gap: 12,
  },
  title: { flex: 1, color: theme.text, fontSize: 16, fontWeight: "700" },
  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  err: { color: theme.danger, fontSize: 14, textAlign: "center", paddingHorizontal: 24 },
  loading: { color: theme.textDim, fontSize: 13 },
  retryBtn: {
    marginTop: 8, paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: theme.surface, borderRadius: 10,
  },
  retryText: { color: theme.text, fontWeight: "600" },
  infoBox: { padding: 20, gap: 6 },
  infoTitle: { color: theme.text, fontSize: 22, fontWeight: "800" },
  infoSub: { color: theme.textDim, fontSize: 13 },
  altBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    alignSelf: "flex-start",
    marginTop: 10, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: theme.surface, borderRadius: 8,
    borderWidth: 1, borderColor: theme.border,
  },
  altText: { color: theme.text, fontSize: 13, fontWeight: "600" },
  tipBox: {
    flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 16,
    backgroundColor: theme.surface, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: theme.border,
  },
  tipText: { color: theme.textDim, fontSize: 12, flex: 1, lineHeight: 18 },
});
