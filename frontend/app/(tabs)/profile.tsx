import { useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api, clearTokens, theme, User } from "@/src/api";

export default function Profile() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    api.me()
      .then(setUser)
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, []));

  const logout = async () => {
    await clearTokens();
    router.replace("/login");
  };

  if (loading) {
    return (
      <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={theme.accent} />
      </View>
    );
  }

  const roleLabel = user?.role === "admin" ? "Yönetici" : user?.role === "vip" ? "VIP Üye" : "Standart Üye";
  const roleColor = user?.role === "admin" ? theme.accent : user?.role === "vip" ? theme.gold : theme.textDim;

  // VIP süresi hesaplama
  const vipText = user?.vip_until
    ? new Date(user.vip_until).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="profile-screen">
      <View style={styles.header}>
        <Text style={styles.title}>Profil</Text>
      </View>

      <View style={styles.cardWrap}>
        <LinearGradient
          colors={[theme.accentSoft, theme.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.profileCard}
        >
          <View style={styles.avatar}>
            <Ionicons name="person" size={32} color={theme.text} />
          </View>
          <Text style={styles.username} testID="profile-username">{user?.username}</Text>
          <View style={[styles.roleBadge, { borderColor: roleColor }]}>
            <Ionicons
              name={user?.role === "admin" ? "shield-checkmark" : user?.role === "vip" ? "star" : "person"}
              size={12}
              color={roleColor}
            />
            <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
          </View>

          {/* VIP Süresi */}
          {vipText && (
            <View style={[styles.infoBadge, { borderColor: theme.gold, marginTop: 6 }]}>
              <Ionicons name="calendar" size={11} color={theme.gold} />
              <Text style={{ color: theme.gold, fontSize: 11, fontWeight: "700" }}>
                VIP bitiş: {vipText}
              </Text>
            </View>
          )}

          {/* Yetki Rozetleri */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 8 }}>
            {user?.adult_allowed && (
              <View style={[styles.permBadge, { backgroundColor: theme.accent + "33", borderColor: theme.accent }]}>
                <Text style={{ color: theme.accent, fontSize: 10, fontWeight: "700" }}>🔞 +18</Text>
              </View>
            )}
            {user?.sports_allowed && (
              <View style={[styles.permBadge, { backgroundColor: theme.success + "33", borderColor: theme.success }]}>
                <Text style={{ color: theme.success, fontSize: 10, fontWeight: "700" }}>⚽ Spor</Text>
              </View>
            )}
            {user?.blocked && (
              <View style={[styles.permBadge, { backgroundColor: theme.danger + "33", borderColor: theme.danger }]}>
                <Text style={{ color: theme.danger, fontSize: 10, fontWeight: "700" }}>🚫 Engelli</Text>
              </View>
            )}
          </View>
        </LinearGradient>
      </View>

      <View style={styles.menu}>
        <MenuItem
          icon="heart"
          label="Favorilerim"
          onPress={() => router.push("/(tabs)/favorites")}
          testID="menu-favorites"
        />
        <MenuItem
          icon="grid"
          label="Kategoriler"
          onPress={() => router.push("/(tabs)/categories")}
          testID="menu-categories"
        />
        <MenuItem
          icon="star"
          label={user?.role === "vip" || user?.role === "admin" ? "VIP Aktif" : "VIP'e Yükselt"}
          onPress={() => router.push("/vip")}
          testID="menu-vip"
        />
        {user?.role === "admin" && (
          <MenuItem
            icon="shield-checkmark"
            label="Yönetici Paneli"
            onPress={() => router.push("/admin")}
            testID="menu-admin"
            accent
          />
        )}
        <MenuItem
          icon="log-out"
          label="Çıkış Yap"
          onPress={logout}
          testID="menu-logout"
          danger
        />
      </View>
    </SafeAreaView>
  );
}

function MenuItem({
  icon, label, onPress, accent, danger, testID,
}: {
  icon: any; label: string; onPress: () => void;
  accent?: boolean; danger?: boolean; testID?: string;
}) {
  const color = danger ? theme.danger : accent ? theme.accent : theme.text;
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [styles.menuItem, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name={icon} size={20} color={color} />
      <Text style={[styles.menuText, { color }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={theme.textMute} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 },
  title: { color: theme.text, fontSize: 26, fontWeight: "800" },
  cardWrap: { paddingHorizontal: 16, marginBottom: 24 },
  profileCard: {
    borderRadius: 20, padding: 24, alignItems: "center", gap: 8,
    borderWidth: 1, borderColor: theme.border,
  },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.1)",
    alignItems: "center", justifyContent: "center", marginBottom: 8,
  },
  username: { color: theme.text, fontSize: 22, fontWeight: "700" },
  roleBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, marginTop: 4,
  },
  roleText: { fontSize: 12, fontWeight: "700" },
  infoBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    borderWidth: 1,
  },
  permBadge: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    borderWidth: 1,
  },
  menu: { paddingHorizontal: 16, gap: 10 },
  menuItem: {
    flexDirection: "row", alignItems: "center", gap: 14,
    backgroundColor: theme.surface, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: theme.border,
  },
  menuText: { flex: 1, fontSize: 15, fontWeight: "600" },
});
