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

// TV'ye yansıtma kütüphanesini güvenli şekilde bağlıyoruz kanka
let CastButton: any = null;
let useRemoteMediaClient: any = null;
let useCastSession: any = null;
let CastContext: any = null;
try {
  const castPkg = require("react-native-google-cast");
  CastButton        = castPkg.CastButton;
  useRemoteMediaClient = castPkg.useRemoteMediaClient;
  useCastSession    = castPkg.useCastSession;
  CastContext       = castPkg.CastContext;
} catch (e) {}

let expoVideoPkg: any = null;
try { expoVideoPkg = require("expo-video"); } catch (e) {}

let vlcPlayerPkg: any = null;
try { vlcPlayerPkg = require("react-native-vlc-media-player"); } catch (e) {}

let exoPlayerPkg: any = null;
try { exoPlayerPkg = require("react-native-video"); } catch (e) {}

let ScreenOrientation: any = null;
try { ScreenOrientation = require("expo-screen-orientation"); } catch (e) {}

type PlayerMode = "expo-video" | "exoplayer" | "vlc" | "vlc-ijk";

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
  
  // Varsayılan: Google ExoPlayer > IJK > VLC > Expo Video
  const [selectedMode, setSelectedMode] = useState<PlayerMode>(() => {
    if (exoPlayerPkg) return "exoplayer";
    if (vlcPlayerPkg) return "vlc-ijk";
    return "expo-video";
  });

  const playerInnerRef = useRef<any>(null);

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

  const tryPrev = useCallback(() => {
    if (!urls) return;
    if (activeIdx - 1 >= 0) {
      setActiveIdx((v) => v - 1);
      setError(null);
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
            <ActivityIndicator color="#ff9f43" size="large" />
            <Text style={styles.loading}>Yukleniyor...</Text>
          </View>
        ) : (
          <PlayerInner
            ref={playerInnerRef}
            key={`${id}-${activeIdx}-${selectedMode}`}
            url={urls[activeIdx]}
            mode={selectedMode}
            onTryNext={tryNext}
            isFullscreen={isFullscreen}
            setIsFullscreen={setIsFullscreen}
            title={name || "Canli Yayin"}
          />
        )}
      </View>

      {!isFullscreen && (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>{name}</Text>
          <Text style={styles.infoSub}>Canli Yayin - 4 Farkli Yapay Zeka Motoru Aktif</Text>

          <Text style={styles.sectionTitle}>Oynatici Motoru Sec:</Text>
          <View style={styles.modeSelector}>
            {exoPlayerPkg && (
              <Pressable
                onPress={() => setSelectedMode("exoplayer")}
                style={[styles.modeBtn, selectedMode === "exoplayer" && styles.modeBtnActive]}
              >
                <Ionicons name="logo-youtube" size={16} color={selectedMode === "exoplayer" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "exoplayer" && styles.modeBtnTextActive]}>ExoPlayer (Google)</Text>
              </Pressable>
            )}
            {vlcPlayerPkg && (
              <Pressable
                onPress={() => setSelectedMode("vlc-ijk")}
                style={[styles.modeBtn, selectedMode === "vlc-ijk" && styles.modeBtnActive]}
              >
                <Ionicons name="flash" size={16} color={selectedMode === "vlc-ijk" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "vlc-ijk" && styles.modeBtnTextActive]}>IJK Canavar</Text>
              </Pressable>
            )}
            {vlcPlayerPkg && (
              <Pressable
                onPress={() => setSelectedMode("vlc")}
                style={[styles.modeBtn, selectedMode === "vlc" && styles.modeBtnActive]}
              >
                <Ionicons name="hardware-chip" size={16} color={selectedMode === "vlc" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "vlc" && styles.modeBtnTextActive]}>VLC Standart</Text>
              </Pressable>
            )}
            {expoVideoPkg && (
              <Pressable
                onPress={() => setSelectedMode("expo-video")}
                style={[styles.modeBtn, selectedMode === "expo-video" && styles.modeBtnActive]}
              >
                <Ionicons name="play-circle" size={16} color={selectedMode === "expo-video" ? "#000" : "#fff"} />
                <Text style={[styles.modeBtnText, selectedMode === "expo-video" && styles.modeBtnTextActive]}>Expo Video</Text>
              </Pressable>
            )}
          </View>

          {urls && urls.length > 1 && (
            <View style={styles.backupControlWrapper}>
              <Pressable 
                onPress={tryPrev} 
                disabled={activeIdx === 0} 
                style={[styles.navCircleBtn, activeIdx === 0 && styles.disabledBtn]}
              >
                <Ionicons name="play-back" size={20} color={activeIdx === 0 ? "#555" : "#fff"} />
              </Pressable>

              <Pressable onPress={tryNext} style={styles.altBtnCombined}>
                <Ionicons name="swap-horizontal" size={16} color="#000" />
                <Text style={styles.altText}>Yedek Kanala Gec ({activeIdx + 1}/{urls.length})</Text>
              </Pressable>

              <Pressable 
                onPress={tryNext} 
                disabled={activeIdx + 1 === urls.length} 
                style={[styles.navCircleBtn, activeIdx + 1 === urls.length && styles.disabledBtn]}
              >
                <Ionicons name="play-forward" size={20} color={activeIdx + 1 === urls.length ? "#555" : "#fff"} />
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

import { forwardRef, useImperativeHandle } from "react";

const PlayerInner = forwardRef(({
  url,
  mode,
  onTryNext,
  isFullscreen,
  setIsFullscreen,
  title,
}: {
  url: string;
  mode: PlayerMode;
  onTryNext: () => void;
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  title: string;
}, ref) => {
  useImperativeHandle(ref, () => ({}));

  if (mode === "expo-video" && expoVideoPkg) {
    return <ExpoVideoPlayer url={url} onError={onTryNext} isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen} title={title} />;
  }

  if (mode === "exoplayer" && exoPlayerPkg) {
    return <ExoPlayerEngine url={url} onError={onTryNext} isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen} title={title} />;
  }

  if ((mode === "vlc" || mode === "vlc-ijk") && vlcPlayerPkg) {
    return <VlcPlayerComponent url={url} mode={mode} onError={onTryNext} isFullscreen={isFullscreen} setIsFullscreen={setIsFullscreen} title={title} />;
  }

  return (
    <View style={styles.center}>
      <Ionicons name="warning-outline" size={50} color="orange" />
      <Text style={styles.err}>Oynatici yuklenemedi.</Text>
    </View>
  );
});

/* ============================================================
   EXPO VIDEO PLAYER
   ============================================================ */
function ExpoVideoPlayer({ url, onError, isFullscreen, setIsFullscreen, title }: any) {
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showCastControl, setShowCastControl] = useState(true);

  const isFailedTriggered = useRef(false);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSuccessfullyPlaying = useRef(false);
  const statusSubRef = useRef<any>(null);

  const useVideoPlayer = expoVideoPkg.useVideoPlayer;
  const VideoView = expoVideoPkg.VideoView;

  const player = useVideoPlayer(url, (p: any) => {
    p.loop = false;
    p.muted = false;
    p.showNowPlayingNotification = false;
    p.staysActiveInBackground = true;
    if (p.android) p.android.preferredForwardBufferDuration = 10;
    p.play();
  });

  const triggerCastControl = useCallback(() => {
    setShowCastControl(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowCastControl(false), 4000);
  }, []);

  const castSession = useCastSession ? useCastSession() : null;
  const remoteClient = useRemoteMediaClient ? useRemoteMediaClient() : null;

  const handleCast = useCallback(async () => {
    try { CastContext?.getSharedInstance().showCastDialog(); } catch {}
    if (!castSession || !remoteClient) return;
    try {
      await remoteClient.loadMedia({
        mediaInfo: {
          contentUrl: url,
          contentType: isM3U8(url) ? "application/x-mpegURL" : "video/mp4",
          metadata: { type: "movie", title: title },
          streamType: "LIVE",
        },
      });
    } catch (e) { console.warn("[Cast] loadMedia error:", e); }
  }, [castSession, remoteClient, url, title]);

  const isCasting = !!castSession;

  useEffect(() => {
    setReady(false);
    setHasError(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
    triggerCastControl();

    const checkStatus = (status?: string, err?: any) => {
      const s = status ?? player?.status;
      const e = err ?? player?.error;

      if (s === "readyToPlay" || s === "playing") {
        setReady(true);
        isSuccessfullyPlaying.current = true;
      }

      if (isSuccessfullyPlaying.current && s !== "playing" && s !== "readyToPlay") {
        if (!stallTimerRef.current) {
          stallTimerRef.current = setTimeout(() => { player?.play(); }, 2000);
        }
      }

      if ((s === "error" || s === "idle") && e) {
        if (isSuccessfullyPlaying.current) return;
        setHasError(true);
        if (!isFailedTriggered.current) { isFailedTriggered.current = true; onError(); }
      }
    };

    statusSubRef.current = player?.addListener?.("statusChange", (ev: any) => {
      checkStatus(ev?.status, ev?.error);
    });

    const pollTimer = setInterval(() => {
      if (!hasError && !isFailedTriggered.current) checkStatus();
      else clearInterval(pollTimer);
    }, 800);

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 15000);

    return () => {
      clearInterval(pollTimer);
      if (statusSubRef.current?.remove) statusSubRef.current.remove();
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [url, onError, player, triggerCastControl]);

  return (
    <Pressable style={{ flex: 1 }} onPress={triggerCastControl}>
      <VideoView style={{ flex: 1 }} player={player} contentFit="contain" nativeControls={true} />
      {ready && showCastControl && (
        <View style={styles.expoCastOverlay} pointerEvents="box-none">
          {CastButton ? (
            <CastButton style={{ width: 40, height: 40, tintColor: isCasting ? "#ff9f43" : "#fff", marginTop: 10, marginRight: 10 }} />
          ) : (
            <Pressable onPress={handleCast} style={[styles.uiCircleBtn, { marginTop: 10, marginRight: 10 }, isCasting && { backgroundColor: "#ff9f43" }]}>
              <Ionicons name={isCasting ? "tv" : "tv-outline"} size={20} color={isCasting ? "#000" : "#fff"} />
            </Pressable>
          )}
        </View>
      )}
      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>Expo Video Yukleniyor...</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ============================================================
   EXOPLAYER (react-native-video)
   ============================================================ */
function ExoPlayerEngine({ url, onError, isFullscreen, setIsFullscreen, title }: any) {
  const Video = exoPlayerPkg.default || exoPlayerPkg;
  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [isBuffering, setIsBuffering] = useState(false);

  const videoRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFailedTriggered = useRef(false);
  const isSuccessfullyPlaying = useRef(false);
  const progressBarRef = useRef<View>(null);

  const enterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    setShowControls(true);
    if (ScreenOrientation) {
      try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch (e) {}
    }
  }, [setIsFullscreen]);

  const exitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    setShowControls(true);
    if (ScreenOrientation) {
      try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch (e) {}
    }
  }, [setIsFullscreen]);

  const triggerControls = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
  }, []);

  const handleSeek = useCallback((direction: "forward" | "backward") => {
    if (!videoRef.current) return;
    const change = direction === "forward" ? 10000 : -10000;
    let targetTime = currentTime + change;
    if (targetTime < 0) targetTime = 0;
    if (totalTime > 0 && targetTime > totalTime) targetTime = totalTime;
    videoRef.current.seek(targetTime / 1000);
    triggerControls();
  }, [currentTime, totalTime, triggerControls]);

  const seekToPosition = useCallback((ratio: number) => {
    if (!videoRef.current || totalTime <= 0) return;
    videoRef.current.seek((ratio * totalTime) / 1000);
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

  const castSession = useCastSession ? useCastSession() : null;
  const remoteClient = useRemoteMediaClient ? useRemoteMediaClient() : null;

  const handleCast = useCallback(async () => {
    try { CastContext?.getSharedInstance().showCastDialog(); } catch {}
    if (!castSession || !remoteClient) return;
    try {
      await remoteClient.loadMedia({
        mediaInfo: {
          contentUrl: url,
          contentType: isM3U8(url) ? "application/x-mpegURL" : "video/mp4",
          metadata: { type: "movie", title: title },
          streamType: "LIVE",
        },
      });
    } catch (e) { console.warn("[Cast] loadMedia error:", e); }
  }, [castSession, remoteClient, url, title]);

  const isCasting = !!castSession;

  useEffect(() => {
    if (isCasting) setPaused(true);
    else if (isSuccessfullyPlaying.current) setPaused(false);
  }, [isCasting]);

  useEffect(() => {
    setReady(false);
    setHasError(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;
    setCurrentTime(0);
    setTotalTime(0);
    setIsBuffering(false);

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    triggerControls();

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 15000);

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    };
  }, [url, onError]);

  const progressPercent = useMemo(() => {
    if (totalTime === 0) return "0%";
    return `${Math.min(100, Math.max(0, (currentTime / totalTime) * 100))}%`;
  }, [currentTime, totalTime]);

  return (
    <Pressable style={{ flex: 1 }} onPress={triggerControls}>
      <Video
        ref={videoRef}
        source={{ uri: url }}
        style={{ flex: 1, width: "100%", height: "100%" }}
        resizeMode="contain"
        paused={paused}
        repeat={false}
        muted={false}
        playInBackground={true}
        playWhenInactive={true}
        ignoreSilentSwitch="ignore"
        bufferConfig={{
          minBufferMs: 15000,
          maxBufferMs: 50000,
          bufferForPlaybackMs: 2500,
          bufferForPlaybackAfterRebufferMs: 5000,
        }}
        onReadyForDisplay={() => {
          setReady(true);
          isSuccessfullyPlaying.current = true;
        }}
        onProgress={(data: any) => {
          if (data?.currentTime !== undefined) setCurrentTime(data.currentTime * 1000);
          if (data?.seekableDuration !== undefined) setTotalTime(data.seekableDuration * 1000);
        }}
        onError={() => {
          if (isSuccessfullyPlaying.current) return;
          setHasError(true);
          if (!isFailedTriggered.current) { isFailedTriggered.current = true; onError(); }
        }}
        onBuffer={({ isBuffering }: any) => setIsBuffering(isBuffering)}
      />

      {ready && showControls && (
        <View style={styles.vlcUiOverlay} pointerEvents="box-none">
          <View style={styles.vlcUiTop} pointerEvents="box-none">
            <View />
            <View style={{ flexDirection: "row", gap: 10 }}>
              {CastButton ? (
                <CastButton style={{ width: 40, height: 40, tintColor: isCasting ? "#ff9f43" : "#fff" }} />
              ) : (
                <Pressable onPress={handleCast} style={[styles.uiCircleBtn, isCasting && { backgroundColor: "#ff9f43" }]}>
                  <Ionicons name={isCasting ? "tv" : "tv-outline"} size={18} color={isCasting ? "#000" : "#fff"} />
                </Pressable>
              )}
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
            <Text style={{ color: "#fff", fontSize: 11 }}>{formatTime(currentTime)}</Text>
            <View ref={progressBarRef} style={styles.progressBarContainer} {...panResponder.panHandlers} onTouchStart={(e) => { if (totalTime <= 0) return; progressBarRef.current?.measure((_fx, _fy, pw, _ph, px) => { seekToPosition(Math.max(0, Math.min(1, (e.nativeEvent.pageX - px) / pw))); }); }}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: totalTime > 0 ? progressPercent : "100%" }]} />
              </View>
              {totalTime > 0 && <View style={[styles.progressHandle, { left: progressPercent }]} />}
            </View>
            <Text style={{ color: "#fff", fontSize: 11 }}>{formatTime(totalTime)}</Text>
            <Pressable onPress={() => isFullscreen ? exitFullscreen() : enterFullscreen()} style={styles.uiCircleBtn}>
              <Ionicons name={isFullscreen ? "contract" : "expand"} size={22} color="#fff" />
            </Pressable>
          </View>
        </View>
      )}

      {isBuffering && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#ff9f43" size="large" />
          <Text style={{ color: "#ff9f43", marginTop: 8, fontWeight: "bold" }}>Tamponluyor...</Text>
        </View>
      )}

      {!ready && !hasError && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>Google ExoPlayer Yukleniyor...</Text>
        </View>
      )}
    </Pressable>
  );
}

/* ============================================================
   VLC PLAYER & IJK SIMULASYONU
   ============================================================ */
function VlcPlayerComponent({ url, mode, onError, isFullscreen, setIsFullscreen, title }: any) {
  const VLCPlayer = vlcPlayerPkg.VLCPlayer;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [ready, setReady] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"audio" | "subtitle">("audio");
  const [audioTracks, setAudioTracks] = useState<any[]>([]);
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<number>(1);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<number>(-1);

  const vlcRef = useRef<any>(null);
  const progressBarRef = useRef<View>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSuccessfullyPlaying = useRef(false);
  const isFailedTriggered = useRef(false);

  const enterFullscreen = useCallback(async () => {
    setIsFullscreen(true);
    setShowControls(true);
    if (ScreenOrientation) {
      try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE); } catch (e) {}
    }
  }, [setIsFullscreen]);

  const exitFullscreen = useCallback(async () => {
    setIsFullscreen(false);
    setShowControls(true);
    if (ScreenOrientation) {
      try { await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); } catch (e) {}
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
    try { vlcRef.current.seekTo?.(Math.floor(targetTime)); } catch (e) {}
    triggerControls();
  }, [currentTime, totalTime, triggerControls]);

  const seekToPosition = useCallback((ratio: number) => {
    if (!vlcRef.current || totalTime <= 0) return;
    const target = Math.floor(ratio * totalTime);
    try { vlcRef.current.seekTo?.(target); } catch (e) {}
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

  const castSession = useCastSession ? useCastSession() : null;
  const remoteClient = useRemoteMediaClient ? useRemoteMediaClient() : null;

  const handleCast = useCallback(async () => {
    try { CastContext?.getSharedInstance().showCastDialog(); } catch {}
    if (!castSession || !remoteClient) return;
    try {
      await remoteClient.loadMedia({
        mediaInfo: {
          contentUrl: url,
          contentType: isM3U8(url) ? "application/x-mpegURL" : "video/mp4",
          metadata: { type: "movie", title: title },
          streamType: "LIVE",
        },
      });
    } catch (e) { console.warn("[Cast] loadMedia error:", e); }
  }, [castSession, remoteClient, url, title]);

  const isCasting = !!castSession;

  useEffect(() => {
    if (isCasting) setPaused(true);
    else if (isSuccessfullyPlaying.current) setPaused(false);
  }, [isCasting]);

  const fetchTracks = useCallback(() => {
    if (!vlcRef.current) return;
    try {
      const rawAudio = vlcRef.current.getAudioTracks?.() || [];
      setAudioTracks(rawAudio.length > 0 ? rawAudio.map((t: any) => ({
        id: t.id ?? t.index ?? 1,
        name: t.name || t.language || `Ses Parcasi ${t.id ?? t.index ?? 1}`,
        type: "audio" as const,
      })) : [{ id: 1, name: "Ana Ses", type: "audio" }]);
    } catch { setAudioTracks([{ id: 1, name: "Ana Ses", type: "audio" }]); }

    try {
      const rawSubs = vlcRef.current.getSubtitleTracks?.() || [];
      setSubtitleTracks(rawSubs.length > 0 ? [
        { id: -1, name: "Altyazi Kapali", type: "subtitle" },
        ...rawSubs.map((t: any) => ({
          id: t.id ?? t.index ?? 0,
          name: t.name || t.language || `Altyazi ${t.id ?? t.index ?? 0}`,
          type: "subtitle" as const,
        }))
      ] : [{ id: -1, name: "Altyazi Kapali", type: "subtitle" }]);
    } catch { setSubtitleTracks([{ id: -1, name: "Altyazi Kapali", type: "subtitle" }]); }
  }, []);

  useEffect(() => {
    setReady(false);
    setHasError(false);
    setIsRecovering(false);
    isFailedTriggered.current = false;
    isSuccessfullyPlaying.current = false;
    setCurrentTime(0);
    setTotalTime(0);

    if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
    if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    triggerControls();

    readyTimerRef.current = setTimeout(() => {
      if (!ready && !hasError && !isFailedTriggered.current) {
        isFailedTriggered.current = true;
        onError();
      }
    }, 15000);

    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      if (readyTimerRef.current) clearTimeout(readyTimerRef.current);
      if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
    };
  }, [url, onError]);

  const progressPercent = useMemo(() => {
    if (totalTime === 0) return "0%";
    return `${Math.min(100, Math.max(0, (currentTime / totalTime) * 100))}%`;
  }, [currentTime, totalTime]);

  const vlcInitOptions = useMemo(() => {
    if (mode === "vlc-ijk") {
      return [
        "--avcodec-hw=any",
        "--network-caching=1000",
        "--live-caching=1000",
        "--input-buffer-size=2097152",
        "--http-reconnect",
        "--skip-frames",
        "--rtsp-tcp"
      ];
    }
    return [
      "--avcodec-hw=any",
      "--network-caching=4000",
      "--live-caching=4000",
      "--http-reconnect",
      "--no-drop-late-frames"
    ];
  }, [mode]);

  return (
    <Pressable style={{ flex: 1 }} onPress={triggerControls}>
      <VLCPlayer
        ref={vlcRef}
        source={{ uri: url, initOptions: vlcInitOptions }}
        autoplay={true}
        paused={paused}
        autoAspectRatio={true}
        videoAspectRatio="16:9"
        resizeMode={isFullscreen || isLandscape ? "stretch" : "contain"}
        style={{ flex: 1, width: "100%", height: "100%" }}
        onPlaying={() => {
          setReady(true);
          setIsRecovering(false);
          isSuccessfullyPlaying.current = true;
          setTimeout(fetchTracks, 1000);
        }}
        onBuffering={(e: any) => {
          if (e?.isBuffering === 0 || e?.isBuffering === false) {
            setReady(true);
            setIsRecovering(false);
          } else if (isSuccessfullyPlaying.current && !recoveryTimerRef.current) {
            recoveryTimerRef.current = setTimeout(() => {
              setIsRecovering(true);
              try { vlcRef.current?.seekTo?.(currentTime + 1000); } catch {}
              setTimeout(() => { recoveryTimerRef.current = null; }, 1000);
            }, 3000);
          }
        }}
        onProgress={(e: any) => {
          if (e?.currentTime !== undefined) setCurrentTime(e.currentTime);
          if (e?.duration !== undefined) setTotalTime(e.duration);
          setIsRecovering(false);
        }}
        onError={() => {
          if (isSuccessfullyPlaying.current) return;
          setHasError(true);
          if (!isFailedTriggered.current) {
            isFailedTriggered.current = true;
            onError();
          }
        }}
      />

      {ready && showControls && (
        <View style={styles.vlcUiOverlay} pointerEvents="box-none">
          <View style={styles.vlcUiTop} pointerEvents="box-none">
            <View />
            <View style={{ flexDirection: "row", gap: 10 }}>
              {CastButton ? (
                <CastButton style={{ width: 40, height: 40, tintColor: isCasting ? "#ff9f43" : "#fff" }} />
              ) : (
                <Pressable onPress={handleCast} style={[styles.uiCircleBtn, isCasting && { backgroundColor: "#ff9f43" }]}>
                  <Ionicons name={isCasting ? "tv" : "tv-outline"} size={18} color={isCasting ? "#000" : "#fff"} />
                </Pressable>
              )}
              <Pressable onPress={() => { setSettingsTab("audio"); setShowSettings(!showSettings); }} style={[styles.uiCircleBtn, showSettings && settingsTab === "audio" && { backgroundColor: "#ff9f43" }]}>
                <Ionicons name="musical-notes" size={20} color="#fff" />
              </Pressable>
              <Pressable onPress={() => { setSettingsTab("subtitle"); setShowSettings(!showSettings); }} style={[styles.uiCircleBtn, showSettings && settingsTab === "subtitle" && { backgroundColor: "#ff9f43" }]}>
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
            <Text style={{ color: "#fff", fontSize: 11 }}>{formatTime(currentTime)}</Text>
            <View ref={progressBarRef} style={styles.progressBarContainer} {...panResponder.panHandlers} onTouchStart={(e) => { if (totalTime <= 0) return; progressBarRef.current?.measure((_fx, _fy, pw, _ph, px) => { seekToPosition(Math.max(0, Math.min(1, (e.nativeEvent.pageX - px) / pw))); }); }}>
              <View style={styles.progressBarTrack}>
                <View style={[styles.progressBarFill, { width: totalTime > 0 ? progressPercent : "100%" }]} />
              </View>
              {totalTime > 0 && <View style={[styles.progressHandle, { left: progressPercent }]} />}
            </View>
            <Text style={{ color: "#fff", fontSize: 11 }}>{formatTime(totalTime)}</Text>
            <Pressable onPress={() => isFullscreen ? exitFullscreen() : enterFullscreen()} style={styles.uiCircleBtn}>
              <Ionicons name={isFullscreen ? "contract" : "expand"} size={22} color="#fff" />
            </Pressable>
          </View>

          {showSettings && (
            <View style={styles.settingsModal}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{settingsTab === "audio" ? "Ses Secimi" : "Altyazi Secimi"}</Text>
                <Pressable onPress={() => setShowSettings(false)}><Ionicons name="close" size={22} color="#fff" /></Pressable>
              </View>
              <FlatList
                data={settingsTab === "audio" ? audioTracks : subtitleTracks}
                keyExtractor={(item) => `${settingsTab}-${item.id}`}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.trackItem, ((settingsTab === "audio" && selectedAudioId === item.id) || (settingsTab === "subtitle" && selectedSubtitleId === item.id)) && styles.trackItemActive]}
                    onPress={() => {
                      if (settingsTab === "audio") { vlcRef.current?.setAudioTrack?.(item.id); setSelectedAudioId(item.id); }
                      else { vlcRef.current?.setSubtitleTrack?.(item.id); setSelectedSubtitleId(item.id); }
                      setShowSettings(false);
                    }}
                  >
                    <Text style={[styles.trackText, ((settingsTab === "audio" && selectedAudioId === item.id) || (settingsTab === "subtitle" && selectedSubtitleId === item.id)) && styles.trackTextActive]}>{item.name}</Text>
                  </Pressable>
                )}
              />
            </View>
          )}
        </View>
      )}

      {isRecovering && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#ff9f43" size="large" />
          <Text style={{ color: "#ff9f43", marginTop: 8, fontWeight: "bold" }}>Yayin Yenileniyor...</Text>
        </View>
      )}

      {!ready && !hasError && !isRecovering && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: "#aaa", marginTop: 8 }}>
            {mode === "vlc-ijk" ? "IJK Canavar Modu Yukleniyor..." : "VLC Standart Yukleniyor..."}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#111" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, paddingTop: 50, backgroundColor: "#1a1a1a" },
  title: { flex: 1, color: "#fff", fontSize: 16, fontWeight: "700", textAlign: "center", marginHorizontal: 12 },
  videoBox: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" },
  videoBoxFullscreen: { width: "100%", height: "100%", position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  err: { color: "red", textAlign: "center" },
  loading: { color: "#aaa" },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.85)", zIndex: 20 },
  infoBox: { padding: 20 },
  infoTitle: { color: "#fff", fontSize: 20, fontWeight: "700" },
  infoSub: { color: "#ff9f43", marginTop: 4, fontSize: 12, fontWeight: "600" },
  sectionTitle: { color: "#fff", fontSize: 14, fontWeight: "600", marginTop: 20, marginBottom: 10 },
  modeSelector: { flexDirection: "row", gap: 6, marginBottom: 15, flexWrap: "wrap" },
  modeBtn: { flexBasis: "48%", flexGrow: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, padding: 12, backgroundColor: "#2a2a2a", borderRadius: 8, borderWidth: 1, borderColor: "#444" },
  modeBtnActive: { backgroundColor: "#ff9f43", borderColor: "#ff9f43" },
  modeBtnText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  modeBtnTextActive: { color: "#000", fontWeight: "700" },

  backupControlWrapper: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 15, width: "100%", gap: 10 },
  navCircleBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: "#2a2a2a", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#444" },
  disabledBtn: { backgroundColor: "#151515", borderColor: "#222" },
  altBtnCombined: { flex: 1, flexDirection: "row", padding: 14, backgroundColor: "#ff9f43", borderRadius: 8, gap: 8, alignItems: "center", justifyContent: "center" },
  altText: { color: "#000", fontWeight: "800", fontSize: 14 },
  vlcUiOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "space-between", padding: 15, zIndex: 10 },
  vlcUiTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  vlcUiCenter: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 30 },
  vlcUiBottom: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 10 },
  uiCircleBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.7)", alignItems: "center", justifyContent: "center" },
  progressBarContainer: { flex: 1, height: 30, justifyContent: "center", marginHorizontal: 5 },
  progressBarTrack: { height: 5, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 3, overflow: "hidden" },
  progressBarFill: { height: "100%", backgroundColor: "#ff9f43", borderRadius: 3 },
  progressHandle: { position: "absolute", width: 14, height: 14, borderRadius: 7, backgroundColor: "#ff9f43", top: 8, marginLeft: -7, borderWidth: 2, borderColor: "#fff" },
  settingsModal: { position: "absolute", right: 15, top: 65, width: 240, maxHeight: 250, backgroundColor: "rgba(26, 26, 26, 0.96)", borderRadius: 10, padding: 10, borderWidth: 1, borderColor: "#444", zIndex: 999 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10, borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 5 },
  modalTitle: { color: "#fff", fontSize: 13, fontWeight: "700" },
  trackItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 6, borderRadius: 6 },
  trackItemActive: { backgroundColor: "#ff9f43" },
  trackText: { color: "#fff", fontSize: 13, flex: 1 },
  trackTextActive: { color: "#000", fontWeight: "700" },
  expoCastOverlay: { position: "absolute", top: 0, right: 0, zIndex: 99 }
});