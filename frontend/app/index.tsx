import { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { api, loadToken, theme } from "@/src/api";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const t = await loadToken();
      if (!t) {
        router.replace("/login");
        return;
      }
      try {
        await api.me();
        router.replace("/(tabs)/home");
      } catch {
        router.replace("/login");
      }
    })();
  }, []);
  return (
    <View style={styles.c} testID="splash-screen">
      <ActivityIndicator color={theme.accent} size="large" />
    </View>
  );
}
const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: theme.bg, alignItems: "center", justifyContent: "center" },
});
