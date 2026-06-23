import { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView,
  Platform, ActivityIndicator, ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter, Link } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api, setToken, theme } from "@/src/api";

export default function Register() {
  const router = useRouter();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!u.trim() || !p) return setErr("Tüm alanlar zorunlu");
    if (p !== p2) return setErr("Şifreler eşleşmiyor");
    if (p.length < 4) return setErr("Şifre en az 4 karakter");
    setErr("");
    setBusy(true);
    try {
      const res = await api.register(u, p);
      await setToken(res.token);
      router.replace("/(tabs)/home");
    } catch (e: any) {
      setErr(e.message || "Kayıt başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="register-screen">
      <LinearGradient colors={["#1A0408", "#0A0A0C"]} style={StyleSheet.absoluteFill} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.head}>
            <Pressable onPress={() => router.back()} testID="back-button" hitSlop={10}>
              <Ionicons name="chevron-back" size={28} color={theme.text} />
            </Pressable>
            <Text style={styles.title}>Hesap Oluştur</Text>
            <View style={{ width: 28 }} />
          </View>

          <View style={styles.card}>
            <View style={styles.inputWrap}>
              <Ionicons name="person-outline" size={18} color={theme.textDim} />
              <TextInput
                testID="register-username-input"
                value={u}
                onChangeText={setU}
                placeholder="Kullanıcı adı"
                placeholderTextColor={theme.textMute}
                style={styles.input}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.textDim} />
              <TextInput
                testID="register-password-input"
                value={p}
                onChangeText={setP}
                placeholder="Şifre (min 4 karakter)"
                placeholderTextColor={theme.textMute}
                style={styles.input}
                secureTextEntry
              />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.textDim} />
              <TextInput
                testID="register-password2-input"
                value={p2}
                onChangeText={setP2}
                placeholder="Şifre tekrar"
                placeholderTextColor={theme.textMute}
                style={styles.input}
                secureTextEntry
              />
            </View>

            {err ? <Text style={styles.err} testID="register-error">{err}</Text> : null}

            <Pressable
              onPress={submit}
              disabled={busy}
              testID="register-submit-button"
              style={styles.btn}
            >
              <LinearGradient
                colors={[theme.accent, theme.accentSoft]}
                style={styles.btnGrad}
              >
                {busy ? <ActivityIndicator color="#fff" /> : (
                  <Text style={styles.btnText}>Kayıt Ol</Text>
                )}
              </LinearGradient>
            </Pressable>

            <Link href="/login" asChild>
              <Pressable testID="goto-login-button" style={{ alignItems: "center", paddingVertical: 8 }}>
                <Text style={{ color: theme.textDim }}>
                  Zaten hesabın var mı? <Text style={{ color: theme.accent, fontWeight: "600" }}>Giriş yap</Text>
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  scroll: { flexGrow: 1, padding: 20, paddingTop: 60 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 32 },
  title: { color: theme.text, fontSize: 20, fontWeight: "700" },
  card: { backgroundColor: theme.surface, padding: 20, borderRadius: 20, borderWidth: 1, borderColor: theme.border, gap: 14 },
  inputWrap: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: theme.bg2, paddingHorizontal: 14, borderRadius: 12,
    borderWidth: 1, borderColor: theme.border, height: 52,
  },
  input: { flex: 1, color: theme.text, fontSize: 15 },
  err: { color: theme.danger, fontSize: 13 },
  btn: { borderRadius: 12, overflow: "hidden", marginTop: 4 },
  btnGrad: { paddingVertical: 16, alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
