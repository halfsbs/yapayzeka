import { useCallback, useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, theme, Channel } from "@/src/api";

export default function Favorites() {
  const router = useRouter();
  const [items, setItems] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    api.favorites()
      .then(setItems)
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []));

  const removeFav = async (id: string) => {
    await api.delFav(id);
    setItems(prev => prev.filter(c => c.id !== id));
  };

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="favorites-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Favorilerim</Text>
        <Text style={styles.sub}>{items.length} kanal</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="heart-outline" size={56} color={theme.textMute} />
          <Text style={styles.empty}>Henüz favori kanalın yok</Text>
          <Text style={styles.emptySub}>Kanal sayfasından kalp simgesine dokun</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`fav-${item.id}`}
              onPress={() => router.push(`/player?id=${item.id}&name=${encodeURIComponent(item.name)}`)}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.logoBox}>
                {item.logo ? (
                  <Image source={{ uri: item.logo }} style={styles.logo} contentFit="contain" />
                ) : (
                  <Ionicons name="tv-outline" size={26} color={theme.textDim} />
                )}
                {item.adult && (
                  <View style={[styles.badge, { backgroundColor: theme.accent, top: 4, left: 4 }]}>
                    <Text style={styles.badgeText}>🔞</Text>
                  </View>
                )}
                {item.sport && (
                  <View style={[styles.badge, { backgroundColor: theme.success, top: item.adult ? 22 : 4, left: 4 }]}>
                    <Text style={styles.badgeText}>⚽</Text>
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                  {item.vip ? " ⭐" : ""}
                  {item.adult ? " 🔞" : ""}
                  {item.sport ? " ⚽" : ""}
                </Text>
                <Text style={styles.cat}>{item.category}{item.vip ? " · VIP" : ""}</Text>
              </View>
              <Pressable
                testID={`unfav-${item.id}`}
                onPress={() => removeFav(item.id)}
                hitSlop={10}
                style={styles.heartBtn}
              >
                <Ionicons name="heart" size={22} color={theme.accent} />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  title: { color: theme.text, fontSize: 26, fontWeight: "800" },
  sub: { color: theme.textDim, fontSize: 13, marginTop: 2 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: theme.surface, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: theme.border,
  },
  logoBox: {
    width: 56, height: 56, borderRadius: 10, backgroundColor: theme.bg2,
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  logo: { width: "85%", height: "85%" },
  badge: { position: "absolute", paddingHorizontal: 4, paddingVertical: 1, borderRadius: 5 },
  badgeText: { fontSize: 8, fontWeight: "800" },
  name: { color: theme.text, fontSize: 15, fontWeight: "700" },
  cat: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  heartBtn: { padding: 6 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 40 },
  empty: { color: theme.text, fontSize: 16, fontWeight: "600", marginTop: 6 },
  emptySub: { color: theme.textDim, fontSize: 13 },
});
