import { useState, useRef } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken, theme } from "@/src/api";

export default function Login() {
  const router = useRouter();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tapCount = useRef(0);
  const tapTimer = useRef<any>(null);
  const [adminMode, setAdminMode] = useState(false);

  const onLogoTap = () => {
    tapCount.current += 1;
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => (tapCount.current = 0), 1500);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      setAdminMode(true);
    }
  };

  const submit = async () => {
    if (!u.trim() || !p) {
      setErr("Kullanıcı adı ve şifre gerekli");
      return;
    }
    setErr("");
    setBusy(true);
    try {
      const res = await api.login(u, p);
      await setToken(res.token);
      if (adminMode && res.user.role !== "admin") {
        setErr("Admin yetkisi yok");
        await setToken(null);
        setBusy(false);
        return;
      }
      router.replace(adminMode && res.user.role === "admin" ? "/admin" : "/(tabs)/home");
    } catch (e: any) {
      setErr(e.message || "Giriş başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <LinearGradient
        colors={["#1A0408", "#0A0A0C", "#0A0A0C"]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Pressable onPress={onLogoTap} testID="logo-tap-area">
            <View style={styles.logoWrap}>
              <LinearGradient
                colors={[theme.accent, theme.accentSoft]}
                style={styles.logoCircle}
              >
                <Ionicons name="tv" size={42} color="#fff" />
              </LinearGradient>
              <Text style={styles.brand}>YAPAY ZEKA{"\n"}İPTV</Text>
              <Text style={styles.tag}>
                {adminMode ? "Yönetici Girişi" : "Cinematic Live Streaming"}
              </Text>
            </View>
          </Pressable>

          <View style={styles.card}>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={theme.textDim} />
              <TextInput
                testID="login-username-input"
                value={u}
                onChangeText={setU}
                placeholder="Kullanıcı adı"
                placeholderTextColor={theme.textMute}
                style={styles.input}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.textDim} />
              <TextInput
                testID="login-password-input"
                value={p}
                onChangeText={setP}
                placeholder="Şifre"
                placeholderTextColor={theme.textMute}
                style={styles.input}
                secureTextEntry
              />
            </View>

            {err ? <Text style={styles.err} testID="login-error">{err}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={busy}
              testID="login-submit-button"
              style={({ pressed }) => [styles.btn, pressed && { opacity: 0.85 }]}
            >
              <LinearGradient
                colors={[theme.accent, theme.accentSoft]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.btnGrad}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnText}>
                    {adminMode ? "Yönetici Olarak Giriş" : "Giriş Yap"}
                  </Text>
                )}
              </LinearGradient>
            </Pressable>

            {!adminMode && (
              <Link href="/register" asChild>
                <Pressable testID="goto-register-button" style={styles.linkBtn}>
                  <Text style={styles.linkText}>
                    Hesabın yok mu? <Text style={styles.linkAccent}>Kayıt ol</Text>
                  </Text>
                </Pressable>
              </Link>
            )}

            {adminMode && (
              <Pressable
                onPress={() => setAdminMode(false)}
                testID="exit-admin-mode"
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>
                  <Text style={styles.linkAccent}>Normal girişe dön</Text>
                </Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoWrap: { alignItems: "center", marginBottom: 40 },
  logoCircle: {
    width: 84, height: 84, borderRadius: 42,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
    shadowColor: theme.accent, shadowOpacity: 0.6, shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 }, elevation: 12,
  },
  brand: {
    fontSize: 26, fontWeight: "800", color: theme.text,
    letterSpacing: 3, textAlign: "center", lineHeight: 32,
  },
  tag: { color: theme.textDim, marginTop: 6, fontSize: 13, letterSpacing: 1 },
  card: {
    backgroundColor: theme.surface, padding: 20, borderRadius: 20,
    borderWidth: 1, borderColor: theme.border, gap: 14,
  },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.bg2, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border, height: 52,
  },
  input: { flex: 1, color: theme.text, fontSize: 15 },
  err: { color: theme.danger, fontSize: 13 },
  btn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  btnGrad: {
    paddingVertical: 16, alignItems: "center", justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16, letterSpacing: 0.5 },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: theme.textDim, fontSize: 14 },
  linkAccent: { color: theme.accent, fontWeight: "600" },
});
