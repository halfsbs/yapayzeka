import { useEffect, useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { api, theme, Channel } from "@/src/api";

export default function CategoryDetail() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const router = useRouter();
  const [items, setItems] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.channels(name)
      .then(setItems)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [name]);

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="category-detail-screen">
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} testID="cat-back" hitSlop={10}>
          <Ionicons name="chevron-back" size={28} color={theme.text} />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>{name}</Text>
        <View style={{ width: 28 }} />
      </View>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={i => i.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 12, paddingHorizontal: 16 }}
          contentContainerStyle={{ gap: 12, paddingBottom: 24, paddingTop: 4 }}
          renderItem={({ item }) => (
            <Pressable
              testID={`cd-ch-${item.id}`}
              onPress={() => router.push(`/player?id=${item.id}&name=${encodeURIComponent(item.name)}`)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
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
              <Text style={styles.name} numberOfLines={2}>{item.name}</Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={{ color: theme.textDim }}>Bu kategoride kanal yok</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16,
  },
  title: { color: theme.text, fontSize: 22, fontWeight: "800", flex: 1, textAlign: "center" },
  card: {
    flex: 1, backgroundColor: theme.surface, borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: theme.border, gap: 8,
  },
  logoBox: {
    height: 90, borderRadius: 12, backgroundColor: theme.bg2,
    alignItems: "center", justifyContent: "center", position: "relative",
  },
  logo: { width: "85%", height: "85%" },
  vipBadge: {
    position: "absolute", top: 6, right: 6,
    flexDirection: "row", alignItems: "center", gap: 2,
    backgroundColor: theme.gold, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
  },
  vipText: { fontSize: 9, fontWeight: "800", color: "#000" },
  name: { color: theme.text, fontSize: 14, fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
});
