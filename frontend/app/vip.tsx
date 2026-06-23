import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Linking, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { api, theme, PublicSettings } from "@/src/api";

export default function Vip() {
  const router = useRouter();
  const [data, setData] = useState<PublicSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api.settings()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const copy = async (addr: string, id: string) => {
    try {
      await Clipboard.setStringAsync(addr);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  if (loading) {
    return <View style={[styles.root, styles.center]}><ActivityIndicator color={theme.accent} /></View>;
  }
  if (!data) return null;

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="vip-screen">
      <View style={styles.head}>
        <Pressable onPress={() => router.back()} hitSlop={10} testID="vip-back">
          <Ionicons name="chevron-back" size={26} color={theme.text} />
        </Pressable>
        <Text style={styles.title}>VIP Üyelik</Text>
        <View style={{ width: 26 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <LinearGradient
          colors={[theme.gold, "#8B6F1A"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.banner}
        >
          <Ionicons name="star" size={42} color="#000" />
          <Text style={styles.bannerTitle}>VIP üyelik</Text>
          <Text style={styles.bannerSub}>{data.settings.vip_intro}</Text>
          {data.is_vip && (
            <View style={styles.activeChip}>
              <Ionicons name="checkmark-circle" size={14} color={theme.success} />
              <Text style={styles.activeText}>VIP aktif</Text>
            </View>
          )}
        </LinearGradient>

        <Text style={styles.sectionTitle}>Planlar</Text>
        {data.vip_plans.length === 0 ? (
          <Text style={styles.empty}>Henüz tanımlı plan yok.</Text>
        ) : data.vip_plans.map(p => (
          <View key={p.id} style={styles.planCard} testID={`plan-${p.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={styles.planName}>{p.name}</Text>
              {p.description ? <Text style={styles.planDesc}>{p.description}</Text> : null}
              <Text style={styles.planMeta}>{p.days} gün</Text>
            </View>
            <View style={styles.priceBox}>
              {p.price_try > 0 && <Text style={styles.priceTry}>{p.price_try.toFixed(0)} ₺</Text>}
              {p.price_usd > 0 && <Text style={styles.priceUsd}>${p.price_usd.toFixed(2)}</Text>}
            </View>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Kripto ile Ödeme</Text>
        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={14} color={theme.gold} />
          <Text style={styles.noteText}>{data.settings.payment_note}</Text>
        </View>

        {data.crypto_wallets.length === 0 ? (
          <Text style={styles.empty}>Henüz tanımlı cüzdan yok.</Text>
        ) : data.crypto_wallets.map(w => (
          <View key={w.id} style={styles.walletCard} testID={`wallet-${w.symbol}`}>
            <View style={styles.walletHead}>
              <View style={styles.walletIcon}>
                <Text style={styles.walletSym}>{w.symbol}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.walletName}>{w.name}</Text>
                <Text style={styles.walletNet}>{w.network}</Text>
              </View>
            </View>
            <Text style={styles.walletAddr} numberOfLines={2} selectable>{w.address}</Text>
            <View style={styles.walletBtns}>
              <Pressable
                testID={`copy-${w.symbol}`}
                onPress={() => copy(w.address, w.id)}
                style={styles.copyBtn}
              >
                <Ionicons name={copied === w.id ? "checkmark" : "copy-outline"} size={16} color={theme.text} />
                <Text style={styles.copyText}>{copied === w.id ? "Kopyalandı" : "Adresi Kopyala"}</Text>
              </Pressable>
            </View>
          </View>
        ))}

        <View style={styles.supportBox}>
          <Ionicons name="chatbubbles-outline" size={16} color={theme.textDim} />
          <Text style={styles.supportText}>{data.settings.support_msg}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  center: { alignItems: "center", justifyContent: "center" },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  title: { color: theme.text, fontSize: 18, fontWeight: "800" },
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  banner: { borderRadius: 20, padding: 24, alignItems: "center", gap: 6 },
  bannerTitle: { color: "#000", fontSize: 24, fontWeight: "800" },
  bannerSub: { color: "#1a1a1a", fontSize: 13, textAlign: "center", lineHeight: 19 },
  activeChip: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#000", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  activeText: { color: theme.success, fontSize: 12, fontWeight: "700" },
  sectionTitle: { color: theme.text, fontSize: 16, fontWeight: "800", marginTop: 12, marginBottom: 4 },
  planCard: { flexDirection: "row", alignItems: "center", backgroundColor: theme.surface, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: theme.border, gap: 12 },
  planName: { color: theme.text, fontSize: 16, fontWeight: "700" },
  planDesc: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  planMeta: { color: theme.textMute, fontSize: 11, marginTop: 4 },
  priceBox: { alignItems: "flex-end" },
  priceTry: { color: theme.gold, fontSize: 18, fontWeight: "800" },
  priceUsd: { color: theme.textDim, fontSize: 12, marginTop: 2 },
  empty: { color: theme.textDim, fontSize: 13, textAlign: "center", paddingVertical: 16 },
  noteBox: { flexDirection: "row", gap: 6, backgroundColor: "#2A1F08", borderColor: theme.gold, borderWidth: 1, padding: 12, borderRadius: 10, alignItems: "flex-start" },
  noteText: { color: theme.gold, fontSize: 12, flex: 1, lineHeight: 17 },
  walletCard: { backgroundColor: theme.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.border, gap: 10 },
  walletHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  walletIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.bg2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: theme.gold },
  walletSym: { color: theme.gold, fontWeight: "800", fontSize: 13 },
  walletName: { color: theme.text, fontSize: 15, fontWeight: "700" },
  walletNet: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  walletAddr: { color: theme.textDim, fontSize: 12, fontFamily: "monospace", backgroundColor: theme.bg2, padding: 10, borderRadius: 8 },
  walletBtns: { flexDirection: "row", gap: 8 },
  copyBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.surface2, padding: 10, borderRadius: 8 },
  copyText: { color: theme.text, fontSize: 12, fontWeight: "600" },
  supportBox: { flexDirection: "row", gap: 8, marginTop: 16, padding: 12, alignItems: "flex-start" },
  supportText: { color: theme.textDim, fontSize: 12, flex: 1, lineHeight: 17 },
});
