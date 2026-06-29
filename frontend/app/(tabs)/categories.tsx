import { useEffect, useState } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api, theme, CategoryInfo } from "@/src/api";

const COLORS = [
  ["#7A0A1F", "#C8102E"],
  ["#1E3A8A", "#3B82F6"],
  ["#065F46", "#10B981"],
  ["#78350F", "#D4AF37"],
  ["#4C1D95", "#8B5CF6"],
  ["#831843", "#EC4899"],
];

const ICONS: Record<string, any> = {
  Spor: "football",
  Filmler: "film",
  Sinema: "film",
  Haberler: "newspaper",
  Haber: "newspaper",
  Çocuk: "happy",
  Cocuk: "happy",
  Müzik: "musical-notes",
  Muzik: "musical-notes",
  Belgesel: "earth",
  Dizi: "videocam",
  Genel: "tv",
};

export default function Categories() {
  const router = useRouter();
  const [cats, setCats] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.categories()
      .then((data) => {
        // Backend sıralı gönderiyor ama garanti olması için tekrar sırala
        const sorted = [...data].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
        setCats(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="categories-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Kategoriler</Text>
        <Text style={styles.sub}>{cats.length} kategori</Text>
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={cats}
          keyExtractor={i => i.name}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 24 }}
          renderItem={({ item, index }) => {
            const c = COLORS[index % COLORS.length];
            const ic = ICONS[item.name] || ICONS[item.display_name] || "albums";
            const isSuper = item.is_superfav;
            return (
              <Pressable
                testID={`cat-${item.name}`}
                onPress={() =>
                  router.push(`/category-detail?name=${encodeURIComponent(item.name)}`)
                }
                style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }, isSuper && { borderColor: theme.gold, borderWidth: 2 }]}
              >
                <LinearGradient
                  colors={isSuper ? ["#B45309", "#D4AF37"] : c as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.grad}
                >
                  <Ionicons name={ic} size={40} color="#fff" />
                  <Text style={styles.catName}>{item.display_name || item.name}</Text>
                  {isSuper && (
                    <Text style={{ color: "#FFE4A1", fontSize: 10, fontWeight: "700" }}>⭐ SÜPER FAVORİ</Text>
                  )}
                  <Text style={styles.catCount}>{item.count} kanal</Text>
                </LinearGradient>
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: theme.textDim }}>Henüz kategori yok</Text>
            </View>
          }
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
  card: { flex: 1, borderRadius: 18, overflow: "hidden" },
  grad: { padding: 18, height: 140, justifyContent: "space-between" },
  catName: { color: "#fff", fontSize: 16, fontWeight: "700" },
  catCount: { color: "rgba(255,255,255,0.7)", fontSize: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
});
