import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  StatusBar,
  FlatList,
  useWindowDimensions,
  PanResponder,
  GestureResponderEvent,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/src/api";

let expoVideoPkg: any = null;
try { expoVideoPkg = require("expo-video"); } catch (e) {}

let vlcPlayerPkg: any = null;
try { vlcPlayerPkg = require("react-native-vlc-media-player"); } catch (e) {}

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch (e) {}

type PlayerMode = "expo-video" | "vlc";
type TrackItem = { id: number; name: string; type: "audio" | "subtitle" };

function isM3U8(url: string): boolean {
  return /\.m3u8?/i.test(url) || url.includes("type=m3u") || url.includes("type=m3u_plus");
}

function formatTime(ms: number): string {
  if (!ms || ms < 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

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
      <StatusBar barStyle="light-content" hidden={isFullscreen} />

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
  const [hasError, setHasError] = useState(false);
  const isFailedTriggered = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSuccessfullyPlaying = useRef(false);
  const statusSubRef = useRef<any>(null);

  const useVideoPlayer = expoVideoPkg.useVideoPlayer;
  const VideoView = expoVideoPkg.VideoView;

  const finalUrl = useMemo(() => {
    if (isM3U8(url)) return url;
    return url.includes("?") ? `${url}&_cb=${Date.now()}` : `${url}?_cb=${Date.now()}`;
  }, [url]);

  const player = useVideoPlayer(finalUrl, (p: any) => {
    p.loop = false;
    p.muted = false;
    p.showNowPlayingNotification = false;
    p.staysActiveInBackground = true;
    p.play();
  });

  useEffect(() => {
    setReady(false);
    setHasError(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);

    const checkStatus = (status?: string, err?: any) => {
      const s = status ?? player?.status;
      const e = err ?? player?.error;

      if (s === "readyToPlay" || s === "playing") {
        setReady(true);
        isSuccessfullyPlaying.current = true;
        if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
        if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
      }

      // Stall Detection: Yayın başladıktan sonra donarsa otomatik tetikle kanka
      if (isSuccessfullyPlaying.current && s !== "playing" && s !== "readyToPlay") {
        if (!stallTimerRef.current) {
          stallTimerRef.current = setTimeout(() => {
            console.log("[ExpoVideo] Yayın dondu, canlandırılıyor...");
            player?.play();
          }, 4000);
        }
      } else {
        if (stallTimerRef.current) { clearTimeout(stallTimerRef.current); stallTimerRef.current = null; }
      }

      if ((s === "error" || s === "idle") && e) {
        if (isSuccessfullyPlaying.current) return;
        setHasError(true);
        if (!isFailedTriggered.current) {
          isFailedTriggered.current = true;
          onError();
        }
      }
    };

    statusSubRef.current = player?.addListener?.("statusChange", (ev: any) => {
      checkStatus(ev?.status, ev?.error);
    });

    const pollTimer = setInterval(() => {
      if (!hasError && !isFailedTriggered.current) {
        checkStatus();
      } else {
        clearInterval(pollTimer);
      }
    }, 800);

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current && !isSuccessfullyPlaying.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 12000);

    return () => {
      clearInterval(pollTimer);
      if (statusSubRef.current && typeof statusSubRef.current.remove === "function") {
        statusSubRef.current.remove();
      }
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    };
  }, [url, onError]);

  return (
    <View style={{ flex: 1 }}>
      <VideoView
        style={{ flex: 1 }}
        player={player}
        contentFit="cover"
        nativeControls={true}
        allowsFullscreen={false}
      />
      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>Expo Video Yukleniyor...</Text>
        </View>
      )}
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [ready, setReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"audio" | "subtitle">("audio");
  const [audioTracks, setAudioTracks] = useState<TrackItem[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<TrackItem[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<number>(1);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<number>(-1);

  const vlcRef = useRef<any>(null);
  const progressBarRef = useRef<View>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorIgnoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeErrorDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackFetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isSuccessfullyPlaying = useRef(false);
  const isFailedTriggered = useRef(false);

  const VLCPlayer = vlcPlayerPkg.VLCPlayer;

  const enterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    setShowControls(true);
    if (ScreenOrientation) {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch (e) {}
    }
  }, [setIsFullscreen]);

  const exitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    setShowControls(true);
    if (ScreenOrientation) {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch (e) {}
    }
  }, [setIsFullscreen]);

  const triggerControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      if (!showSettings) setShowControls(false);
    }, 4000);
  }, [showSettings]);

  const handleSeek = useCallback((direction: "forward" | "backward") => {
    if (!vlcRef.current) return;
    const change = direction === "forward" ? 10000 : -10000;
    let targetTime = currentTime + change;
    if (targetTime < 0) targetTime = 0;
    if (totalTime > 0 && targetTime > totalTime) targetTime = totalTime;
    try {
      vlcRef.current.seekTo?.(Math.floor(targetTime));
    } catch (e) {}
    triggerControls();
  }, [currentTime, totalTime, triggerControls]);

  const seekToPosition = useCallback((ratio: number) => {
    if (!vlcRef.current || totalTime <= 0) return;
    const target = Math.floor(ratio * totalTime);
    try {
      vlcRef.current.seekTo?.(target);
    } catch (e) {}
  }, [totalTime]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        if (totalTime <= 0) return;
        progressBarRef.current?.measure((_fx, _fy, pw, _ph, px) => {
          const ratio = Math.max(0, Math.min(1, (evt.nativeEvent.pageX - px) / pw));
          seekToPosition(ratio);
        });
      },
      onPanResponderMove: (evt: GestureResponderEvent) => {
        if (totalTime <= 0) return;
        progressBarRef.current?.measure((_fx, _fy, pw, _ph, px) => {
          const ratio = Math.max(0, Math.min(1, (evt.nativeEvent.pageX - px) / pw));
          seekToPosition(ratio);
        });
      },
    })
  ).current;

  const handleError = useCallback((e: any) => {
    if (nativeErrorDelayRef.current) clearTimeout(nativeErrorDelayRef.current);
    nativeErrorDelayRef.current = setTimeout(() => {
      if (isSuccessfullyPlaying.current) return;
      setHasError(true);
      if (!isFailedTriggered.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 800);
  }, [onError]);

  const fetchTracks = useCallback(() => {
    if (!vlcRef.current) return;
    try {
      const rawAudio = vlcRef.current.getAudioTracks?.() || [];
      if (rawAudio.length > 0) {
        setAudioTracks(rawAudio.map((t: any) => ({
          id: t.id ?? t.index ?? 1,
          name: t.name || t.language || `Ses Parçası ${t.id ?? t.index ?? 1}`,
          type: "audio" as const,
        })));
      } else {
        setAudioTracks([{ id: 1, name: "Ana Ses", type: "audio" }]);
      }
    } catch {
      setAudioTracks([{ id: 1, name: "Ana Ses", type: "audio" }]);
    }

    try {
      const rawSubs = vlcRef.current.getSubtitleTracks?.() || [];
      if (rawSubs.length > 0) {
        setSubtitleTracks([
          { id: -1, name: "Altyazi Kapali", type: "subtitle" },
          ...rawSubs.map((t: any) => ({
            id: t.id ?? t.index ?? 0,
            name: t.name || t.language || `Altyazi ${t.id ?? t.index ?? 0}`,
            type: "subtitle" as const,
          })),
        ]);
      } else {
        setSubtitleTracks([{ id: -1, name: "Altyazi Kapali", type: "subtitle" }]);
      }
    } catch {
      setSubtitleTracks([{ id: -1, name: "Altyazi Kapali", type: "subtitle" }]);
    }
  }, []);

  useEffect(() => {
    setReady(false);
    setHasError(false);
    setIsRecovering(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;
    setCurrentTime(0);
    setTotalTime(0);
    setAudioTracks([]);
    setSubtitleTracks([]);

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);
    if (nativeErrorDelayRef.current) clearTimeout(nativeErrorDelayRef.current);
    if (trackFetchTimerRef.current) clearTimeout(trackFetchTimerRef.current);
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);

    triggerControls();

    trackFetchTimerRef.current = setTimeout(() => {
      if (isSuccessfullyPlaying.current) fetchTracks();
    }, 2000);

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current && !isSuccessfullyPlaying.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 15000);

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (errorIgnoreTimeoutRef.current) clearTimeout(errorIgnoreTimeoutRef.current);
      if (nativeErrorDelayRef.current) clearTimeout(nativeErrorDelayRef.current);
      if (trackFetchTimerRef.current) clearTimeout(trackFetchTimerRef.current);
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    };
  }, [url, onError, fetchTracks]);

  useEffect(() => {
    if (!ScreenOrientation) return;
    if (isFullscreen) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
    } else {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    }
  }, [isFullscreen]);

  const progressPercent = useMemo(() => {
    if (totalTime === 0) return "0%";
    return `${Math.min(100, Math.max(0, (currentTime / totalTime) * 100))}%`;
  }, [currentTime, totalTime]);

  const vlcInitOptions = useMemo(() => {
    return [
      "--network-caching=6000", // CANLI YAYIN İÇİN EN İDEAL SÜRE: 6 saniye havuz kanka!
      "--live-caching=6000",
      "--file-caching=6000",
      "--udp-caching=6000",
      "--input-buffer-size=1048576", // 1MB Girdi Havuzu
      "--http-reconnect",            // Bağlantı koparsa otomatik yeniden yakala müdür
      "--http-keepalive",            // Hattı sürekli canlı tut
      "--codec=all",
      "--no-drop-late-frames",
      "--skip-frames",
      "--rtsp-tcp",
      "--clock-jitter=0",
      "--clock-synchro=0",
    ];
  }, []);

  const videoAspectRatio = useMemo(() => {
    return "16:9"; 
  }, []);

  return (
    <Pressable style={{ flex: 1 }} onPress={triggerControls}>
      <VLCPlayer
        ref={vlcRef}
        source={{ uri: url, initOptions: vlcInitOptions }}
        autoplay={true}
        paused={paused}
        autoAspectRatio={false} 
        videoAspectRatio={videoAspectRatio}
        resizeMode={isFullscreen || isLandscape ? "stretch" : "contain"} 
        style={{ flex: 1, width: "100%", height: "100%" }}
        onPlaying={() => {
          setReady(true);
          setIsRecovering(false);
          isSuccessfullyPlaying.current = true;
          if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
          if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; }
          setTimeout(fetchTracks, 1500);
        }}
        onBuffering={(e: any) => {
          if (e?.isBuffering === 0) {
            setReady(true);
            setIsRecovering(false);
            isSuccessfullyPlaying.current = true;
            if (readyTimerRef.current) { clearTimeout(readyTimerRef.current); readyTimerRef.current = null; }
            if (recoveryTimerRef.current) { clearTimeout(recoveryTimerRef.current); recoveryTimerRef.current = null; }
          } else {
            // Akıllı Kurtarma Mekanizması: Eğer yayın akarken 4 saniyeden uzun donarsa sars kanka!
            if (isSuccessfullyPlaying.current && !recoveryTimerRef.current) {
              recoveryTimerRef.current = setTimeout(() => {
                console.log("[VLC] Buffer tıkandı, akış yenileniyor...");
                setIsRecovering(true);
                try {
                  vlcRef.current?.seekTo?.(currentTime + 1000); // Akışı 1 saniye ileri iterek canlandır müdür
                } catch {}
              }, 4000);
            }
          }
        }}
        onProgress={(e: any) => {
          if (e?.currentTime !== undefined) setCurrentTime(e.currentTime);
          if (e?.duration !== undefined) setTotalTime(e.duration);
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

      {ready && showControls && (
        <View style={styles.vlcUiOverlay} pointerEvents="box-none">
          <View style={styles.vlcUiTop} pointerEvents="box-none">
            <View />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable
                onPress={() => { setSettingsTab("audio"); setShowSettings(!showSettings); triggerControls(); }}
                style={[styles.uiCircleBtn, showSettings && settingsTab === "audio" && { backgroundColor: "#ff9f43" }]}
              >
                <Ionicons name="musical-notes" size={20} color="#fff" />
              </Pressable>
              <Pressable
                onPress={() => { setSettingsTab("subtitle"); setShowSettings(!showSettings); triggerControls(); }}
                style={[styles.uiCircleBtn, showSettings && settingsTab === "subtitle" && { backgroundColor: "#ff9f43" }]}
              >
                <Ionicons name="text" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>

          <View style={styles.vlcUiCenter} pointerEvents="box-none">
            <Pressable onPress={() => handleSeek("backward")} style={styles.uiCircleBtn}>
              <Ionicons name="play-back" size={24} color="#fff" />
            </Pressable>
            <Pressable onPress={() => setPaused(!paused)} style={[styles.uiCircleBtn, { width: 60, height: 60, borderRadius: 30 }]}>
              <Ionicons name={paused ? "play" : "pause"} size={32} color="#fff" />
            </Pressable>
            <Pressable onPress={() => handleSeek("forward")} style={styles.uiCircleBtn}>
              <Ionicons name="play-forward" size={24} color="#fff" />
            </Pressable>
          </View>

          <View style={styles.vlcUiBottom} pointerEvents="box-none">
            <Text style={{ color: "#fff", fontSize: 11, minWidth: 35 }}>{formatTime(currentTime)}</Text>

            <View
              ref={progressBarRef}
              style={styles.progressBarContainer}
              {...panResponder.panHandlers}
              onTouchStart={(e) => {
                if (totalTime <= 0) return;
                progressBarRef.current?.measure((_fx, _fy, pw, _ph, px) => {
                  const ratio = Math.max(0, Math.min(1, (e.nativeEvent.pageX - px) / pw));
                  seekToPosition(ratio);
                });
              }}
            >
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: totalTime > 0 ? progressPercent : "100%" }]} />
              </View>
              {totalTime > 0 && (
                <View style={[styles.progressHandle, { left: progressPercent }]} />
              )}
            </View>

            <Text style={{ color: "#fff", fontSize: 11, minWidth: 35, textAlign: "right" }}>
              {formatTime(totalTime)}
            </Text>

            <Pressable
              onPress={() => {
                if (isFullscreen) exitFullscreen();
                else enterFullscreen();
              }}
              style={styles.uiCircleBtn}
            >
              <Ionicons name={isFullscreen ? "contract" : "expand"} size={22} color="#fff" />
            </Pressable>
          </View>

          {showSettings && (
            <View style={styles.settingsModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {settingsTab === "audio" ? "Ses Secimi" : "Altyazi Secimi"}
                </Text>
                <Pressable onPress={() => setShowSettings(false)}>
                  <Ionicons name="close" size={22} color="#fff" />
                </Pressable>
              </View>
              <FlatList
                data={settingsTab === "audio" ? audioTracks : subtitleTracks}
                keyExtractor={(item) => `${settingsTab}-${item.id}`}
                renderItem={({ item }) => (
                  <Pressable
                    style={[
                      styles.trackItem,
                      ((settingsTab === "audio" && selectedAudioId === item.id) ||
                        (settingsTab === "subtitle" && selectedSubtitleId === item.id)) &&
                        styles.trackItemActive,
                    ]}
                    onPress={() => {
                      try {
                        if (settingsTab === "audio") {
                          vlcRef.current?.setAudioTrack?.(item.id);
                          setSelectedAudioId(item.id);
                        } else {
                          vlcRef.current?.setSubtitleTrack?.(item.id);
                          setSelectedSubtitleId(item.id);
                        }
                      } catch (e) {}
                      setShowSettings(false);
                    }}
                  >
                    <Ionicons
                      name={settingsTab === "audio" ? "volume-high-outline" : "text-outline"}
                      size={18}
                      color={((settingsTab === "audio" && selectedAudioId === item.id) ||
                        (settingsTab === "subtitle" && selectedSubtitleId === item.id)) ? "#000" : "#fff"}
                    />
                    <Text style={[
                      styles.trackText,
                      ((settingsTab === "audio" && selectedAudioId === item.id) ||
                        (settingsTab === "subtitle" && selectedSubtitleId === item.id)) &&
                        styles.trackTextActive,
                    ]}>
                      {item.name}
                    </Text>
                    {((settingsTab === "audio" && selectedAudioId === item.id) ||
                      (settingsTab === "subtitle" && selectedSubtitleId === item.id)) && (
                      <Ionicons name="checkmark" size={16} color="#000" />
                    )}
                  </Pressable>
                )}
              />
            </View>
          )}
        </View>
      )}

      {/* Yayın Donduğunda Çıkan Kurtarma Uyarısı kanka */}
      {isRecovering && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#ff9f43" size="large" />
          <Text style={{ color: "#ff9f43", marginTop: 8, fontWeight: 'bold' }}>Yayin Yenileniyor...</Text>
        </View>
      )}

      {!ready && !hasError && !isRecovering && (
        <View style={styles.loadingOverlay} pointerEvents="none">
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
  videoBoxFullscreen: {
    width: "100%",
    height: "100%",
    aspectRatio: undefined,
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
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

  vlcUiOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "space-between",
    padding: 15,
    zIndex: 10,
  },
  vlcUiTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vlcUiCenter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 30 },
  vlcUiBottom: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10 },
  uiCircleBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center"
  },
  progressBarContainer: { flex: 1, height: 30, justifyContent: "center", marginHorizontal: 5 },
  progressBarTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#ff9f43", borderRadius: 3 },
  progressHandle: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "#ff9f43", top: 8, marginLeft: -7, borderWidth: 2, borderColor: "#fff" },
  settingsModal: { position: "absolute", right: 15, top: 65, width: 240, maxHeight: 250, backgroundColor: "rgba(26, 26, 26, 0.96)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#444", zIndex: 999 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 5 },
  modalTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  trackItem: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 6 },
  trackItemActive: { backgroundColor: "#ff9f43" },
  trackText: { color: "#fff", fontSize: 13, flex: 1 },
  trackTextActive: { color: "#000", fontWeight: "700" },
});