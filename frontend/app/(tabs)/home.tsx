import { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
  TextInput, ScrollView, RefreshControl, Linking,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, theme, Channel, PublicSettings } from "@/src/api";

export default function Home() {
  const router = useRouter();
  const [cats, setCats] = useState<{ name: string; count: number }[]>([]);
  const [activeCat, setActiveCat] = useState<string>("Tümü");
  const [channels, setChannels] = useState<Channel[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [settings, setSettings] = useState<PublicSettings | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, ch, s] = await Promise.all([
        api.categories(),
        api.channels(activeCat === "Tümü" ? undefined : activeCat, search || undefined),
        api.settings(),
      ]);
      setCats(c);
      setChannels(ch);
      setSettings(s);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeCat, search]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => {
    const t = setTimeout(() => load(), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, activeCat]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const banner = settings?.ads?.find(a => a.type === "banner" && a.active);

  const renderItem = ({ item }: { item: Channel }) => (
    <Pressable
      testID={`channel-card-${item.id}`}
      onPress={() => router.push(`/player?id=${item.id}&name=${encodeURIComponent(item.name)}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] }]}
    >
      <View style={styles.logoBox}>
        {item.logo ? (
          <Image source={{ uri: item.logo }} style={styles.logo} contentFit="contain" />
        ) : (
          <Ionicons name="tv-outline" size={32} color={theme.textDim} />
        )}
        {item.vip && (
          <View style={styles.vipBadge}>
            <Ionicons name="lock-closed" size={10} color="#000" />
            <Text style={styles.vipText}>VIP</Text>
          </View>
        )}
      </View>
      <Text numberOfLines={2} style={styles.cardName}>{item.name}</Text>
      <Text numberOfLines={1} style={styles.cardCat}>{item.category}</Text>
    </Pressable>
  );

  const headerCats = ["Tümü", ...cats.map(c => c.name)];
  const appName = settings?.settings?.app_name || "Yapay Zeka İptv";
  const accent = settings?.settings?.primary_color || theme.accent;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="home-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greet}>{settings?.settings?.tagline || "İyi seyirler"}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {appName}
          </Text>
        </View>
        {!settings?.is_vip && (
          <Pressable onPress={() => router.push("/vip")} style={[styles.vipCta, { borderColor: theme.gold }]} testID="vip-cta">
            <Ionicons name="star" size={14} color={theme.gold} />
            <Text style={styles.vipCtaText}>VIP</Text>
          </Pressable>
        )}
        <Pressable testID="profile-shortcut" onPress={() => router.push("/(tabs)/profile")} style={styles.avatar}>
          <Ionicons name="person" size={20} color={theme.text} />
        </Pressable>
      </View>

      {banner && (
        <Pressable
          testID="ad-banner"
          onPress={() => banner.link_url && Linking.openURL(banner.link_url).catch(() => {})}
          style={styles.adBanner}
        >
          <Image source={{ uri: banner.image_url }} style={styles.adImg} contentFit="cover" />
          <View style={styles.adOverlay}>
            <Text style={styles.adTitle} numberOfLines={1}>{banner.title}</Text>
            <Text style={styles.adTag}>Reklam · VIP olunca kapanır</Text>
          </View>
        </Pressable>
      )}

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.textDim} />
        <TextInput
          testID="search-input"
          value={search}
          onChangeText={setSearch}
          placeholder="Kanal ara..."
          placeholderTextColor={theme.textMute}
          style={styles.search}
        />
        {search ? (
          <Pressable onPress={() => setSearch("")} testID="clear-search">
            <Ionicons name="close-circle" size={18} color={theme.textDim} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow} style={styles.chipScroll}>
        {headerCats.map(cat => {
          const active = activeCat === cat;
          return (
            <Pressable key={cat} testID={`chip-${cat}`} onPress={() => setActiveCat(cat)}
              style={[styles.chip, active && { backgroundColor: accent + "33", borderColor: accent }]}>
              <Text style={[styles.chipText, active && { color: "#fff" }]}>{cat}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={accent} size="large" /></View>
      ) : channels.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="tv-outline" size={48} color={theme.textMute} />
          <Text style={styles.empty}>Kanal bulunamadı</Text>
        </View>
      ) : (
        <FlatList
          data={channels}
          keyExtractor={i => i.id}
          renderItem={renderItem}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 24, paddingTop: 4 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 10 },
  greet: { color: theme.textDim, fontSize: 13 },
  title: { color: theme.text, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
  vipCta: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  vipCtaText: { color: theme.gold, fontWeight: "700", fontSize: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.border },
  adBanner: { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, overflow: "hidden", height: 90, position: "relative" },
  adImg: { width: "100%", height: "100%" },
  adOverlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: 10, backgroundColor: "rgba(0,0,0,0.55)" },
  adTitle: { color: "#fff", fontSize: 14, fontWeight: "700" },
  adTag: { color: "rgba(255,255,255,0.7)", fontSize: 10, marginTop: 2 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 16, marginBottom: 12, paddingHorizontal: 14, backgroundColor: theme.surface, borderRadius: 12, height: 46, borderWidth: 1, borderColor: theme.border },
  search: { flex: 1, color: theme.text, fontSize: 15 },
  chipScroll: { maxHeight: 56, marginBottom: 8 },
  chipRow: { paddingHorizontal: 16, gap: 8, alignItems: "center", height: 56 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  chipText: { color: theme.textDim, fontSize: 13, fontWeight: "600" },
  card: { flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 12, borderWidth: 1, borderColor: theme.border, gap: 6 },
  logoBox: { height: 90, borderRadius: 12, backgroundColor: theme.bg2, alignItems: "center", justifyContent: "center", position: "relative" },
  logo: { width: "85%", height: "85%" },
  vipBadge: { position: "absolute", top: 6, right: 6, flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: theme.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  vipText: { fontSize: 9, fontWeight: "800", color: "#000" },
  cardName: { color: theme.text, fontSize: 14, fontWeight: "700" },
  cardCat: { color: theme.textDim, fontSize: 11 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  empty: { color: theme.textDim, fontSize: 14 },
});
