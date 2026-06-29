import { useEffect, useState, useCallback } from "react";
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView,
  TextInput, Modal, KeyboardAvoidingView, Platform, Switch,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  api, theme, clearTokens, M3USource, User, Role, AdminChannel,
  AppSettings, VipPlan, CryptoWallet, Ad, CategoryConfig, VipPackage, UserGrant,
} from "@/src/api";

type Tab = "dash" | "sources" | "channels" | "categories" | "packages" | "users" | "settings" | "vip" | "ads";

export default function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dash");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const guard = async () => {
    try {
      const me = await api.me();
      if (me.role !== "admin") { router.replace("/(tabs)/home"); return false; }
      return true;
    } catch {
      router.replace("/login");
      return false;
    }
  };

  useEffect(() => { (async () => { await guard(); setLoading(false); })(); }, []);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(""), 2500); };
  const logout = async () => { await clearTokens(); router.replace("/login"); };

  if (loading) {
    return <View style={[styles.root, styles.centerAll]}><ActivityIndicator color={theme.accent} size="large" /></View>;
  }

  const tabs: { key: Tab; label: string; icon: any }[] = [
    { key: "dash", label: "Özet", icon: "speedometer" },
    { key: "sources", label: "Kaynaklar", icon: "cloud" },
    { key: "channels", label: "Kanallar", icon: "tv" },
    { key: "categories", label: "Kategoriler", icon: "layers" },
    { key: "packages", label: "Paketler", icon: "gift" },
    { key: "users", label: "Kullanıcılar", icon: "people" },
    { key: "vip", label: "VIP/Kripto", icon: "star" },
    { key: "ads", label: "Reklamlar", icon: "megaphone" },
    { key: "settings", label: "Ayarlar", icon: "settings" },
  ];

  return (
    <SafeAreaView style={styles.root} edges={["top"]} testID="admin-screen">
      <LinearGradient colors={["#1A0408", theme.bg]} style={styles.headerGrad}>
        <View style={styles.head}>
          <Pressable onPress={() => router.replace("/(tabs)/home")} testID="admin-exit" hitSlop={10}>
            <Ionicons name="chevron-back" size={26} color={theme.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Yönetici Paneli</Text>
            <Text style={styles.sub}>M3U URL`leri kullanıcılara gizli. Şifrelenerek saklanır.</Text>
          </View>
          <Pressable onPress={logout} testID="admin-logout" hitSlop={10}>
            <Ionicons name="log-out-outline" size={24} color={theme.text} />
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {tabs.map(t => (
            <Pressable
              key={t.key}
              testID={`tab-${t.key}`}
              onPress={() => setTab(t.key)}
              style={[styles.tab, tab === t.key && styles.tabActive]}
            >
              <Ionicons name={t.icon as any} size={14} color={tab === t.key ? "#fff" : theme.textDim} />
              <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </LinearGradient>

      {tab === "dash" && <DashTab />}
      {tab === "sources" && <SourcesTab onToast={showToast} />}
      {tab === "channels" && <ChannelsTab onToast={showToast} />}
      {tab === "categories" && <CategoriesTab onToast={showToast} />}
      {tab === "packages" && <PackagesTab onToast={showToast} />}
      {tab === "users" && <UsersTab onToast={showToast} />}
      {tab === "vip" && <VipCryptoTab onToast={showToast} />}
      {tab === "ads" && <AdsTab onToast={showToast} />}
      {tab === "settings" && <SettingsTab onToast={showToast} />}

      {toast ? (
        <View style={styles.toast} pointerEvents="none" testID="admin-toast">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ---------- DASHBOARD ----------
function DashTab() {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { api.adminStats().then(setStats).catch(() => {}); }, []);
  const cards = [
    { label: "Kullanıcı", val: stats?.users ?? "-", icon: "people", c: theme.accent },
    { label: "VIP", val: stats?.vips ?? "-", icon: "star", c: theme.gold },
    { label: "Engelli", val: stats?.blocked ?? "-", icon: "ban", c: theme.danger },
    { label: "Kanal", val: stats?.channels ?? "-", icon: "tv", c: theme.success },
    { label: "Gizli Kanal", val: stats?.hidden_channels ?? "-", icon: "eye-off", c: theme.textDim },
    { label: "Kaynak", val: stats?.sources ?? "-", icon: "cloud", c: "#3B82F6" },
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>İstatistikler</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {cards.map(c => (
          <View key={c.label} style={[styles.statCard]} testID={`stat-${c.label}`}>
            <View style={[styles.statIcon, { backgroundColor: c.c + "22" }]}>
              <Ionicons name={c.icon as any} size={20} color={c.c} />
            </View>
            <Text style={styles.statVal}>{c.val}</Text>
            <Text style={styles.statLbl}>{c.label}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ---------- CATEGORIES ----------
const ACCESS_LABELS: Record<string, { label: string; color: string }> = {
  open:   { label: "Herkese Açık", color: theme.success },
  vip:    { label: "Sadece VIP",   color: theme.gold },
  closed: { label: "Kapalı",       color: theme.danger },
};

function CategoriesTab({ onToast }: { onToast: (m: string) => void }) {
  const [cats, setCats] = useState<CategoryConfig[]>([]);
  const [editing, setEditing] = useState<CategoryConfig | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelected, setMergeSelected] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState("");
  const [defUrl, setDefUrl] = useState("");
  const [defName, setDefName] = useState("Ücretsiz Kanallar");
  const [defBusy, setDefBusy] = useState(false);

  const load = async () => {
    try {
      const data = await api.adminCategoryConfigs();
      setCats(data);
    } catch {}
  };

  const loadDefSource = async () => {
    try {
      const d = await api.adminGetDefaultSource();
      if (d.url) setDefUrl(d.url);
      if (d.name) setDefName(d.name);
    } catch {}
  };

  useEffect(() => { load(); loadDefSource(); }, []);

  const saveAccess = async (name: string, access: string) => {
    try {
      await api.adminUpdateCategoryConfig(name, { access: access as any });
      onToast("Erişim güncellendi");
      load();
    } catch (e: any) { onToast(e.message); }
  };

  const saveEdit = async () => {
    if (!editing) return;
    try {
      await api.adminUpdateCategoryConfig(editing.name, {
        display_name: editing.display_name,
        access: editing.access,
        order: editing.order,
      });
      onToast("Kaydedildi");
      setEditing(null);
      load();
    } catch (e: any) { onToast(e.message); }
  };

  const doMerge = async () => {
    if (mergeSelected.length < 2 || !mergeName.trim()) { onToast("En az 2 kategori ve hedef isim girin"); return; }
    try {
      await api.adminMergeCategories(mergeSelected, mergeName.trim());
      onToast("Birleştirildi"); setMergeMode(false); setMergeSelected([]); setMergeName(""); load();
    } catch (e: any) { onToast(e.message); }
  };

  const saveDefaultSource = async () => {
    if (!defUrl.trim()) { onToast("URL giriniz"); return; }
    setDefBusy(true);
    try {
      await api.adminSetDefaultSource(defUrl.trim(), defName.trim());
      onToast("Varsayılan kaynak ayarlandı ve senkronize ediliyor...");
    } catch (e: any) { onToast(e.message); }
    finally { setDefBusy(false); }
  };

  const toggleMergeSelect = (name: string) => {
    setMergeSelected(prev =>
      prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {/* Normal Kullanıcı Kaynağı */}
      <Text style={styles.sectionTitle}>Normal Kullanıcı Kaynağı (GitHub vb.)</Text>
      <Text style={{ color: theme.textDim, fontSize: 12, marginBottom: 8 }}>
        Kayıtlı ama VIP olmayan kullanıcılara gösterilecek M3U. Buradaki kategoriler otomatik "Herkese Açık" işaretlenir.
      </Text>
      <View style={styles.inputWrap}>
        <Ionicons name="link-outline" size={16} color={theme.textDim} />
        <TextInput value={defUrl} onChangeText={setDefUrl} placeholder="https://raw.githubusercontent.com/..." placeholderTextColor={theme.textMute} style={styles.input} autoCapitalize="none" />
      </View>
      <View style={[styles.inputWrap, { marginTop: 6 }]}>
        <Ionicons name="bookmark-outline" size={16} color={theme.textDim} />
        <TextInput value={defName} onChangeText={setDefName} placeholder="Kaynak adı" placeholderTextColor={theme.textMute} style={styles.input} />
      </View>
      <Pressable onPress={saveDefaultSource} disabled={defBusy} style={[styles.primaryBtn, { marginTop: 8 }]}>
        {defBusy ? <ActivityIndicator color="#fff" size="small" /> : <><Ionicons name="save" size={16} color="#fff" /><Text style={styles.primaryText}>Kaydet & Senkronize Et</Text></>}
      </Pressable>

      {/* Kategori Birleştirme */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16 }}>
        <Text style={styles.sectionTitle}>Kategoriler ({cats.length})</Text>
        <Pressable onPress={() => { setMergeMode(!mergeMode); setMergeSelected([]); }} style={[styles.miniBtn, mergeMode && styles.miniBtnActive]}>
          <Ionicons name="git-merge" size={13} color={mergeMode ? "#fff" : theme.text} />
          <Text style={[styles.miniBtnText, mergeMode && { color: "#fff" }]}>Birleştir</Text>
        </Pressable>
      </View>

      {mergeMode && (
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: theme.gold, gap: 8, marginBottom: 8 }}>
          <Text style={{ color: theme.gold, fontWeight: "700", fontSize: 13 }}>
            Birleştirilecekleri seç ({mergeSelected.length} seçili), ardından hedef ismi gir:
          </Text>
          <View style={styles.inputWrap}>
            <TextInput value={mergeName} onChangeText={setMergeName} placeholder="Yeni kategori adı" placeholderTextColor={theme.textMute} style={styles.input} />
          </View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => { setMergeMode(false); setMergeSelected([]); }} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
            <Pressable onPress={doMerge} style={[styles.primaryBtn, { flex: 1, backgroundColor: theme.gold }]}><Text style={styles.primaryText}>Birleştir</Text></Pressable>
          </View>
        </View>
      )}

      {cats.map(c => {
        const acc = ACCESS_LABELS[c.access] || ACCESS_LABELS.open;
        const isSel = mergeSelected.includes(c.name);
        return (
          <Pressable
            key={c.name}
            onPress={() => mergeMode ? toggleMergeSelect(c.name) : setEditing({ ...c })}
            style={[styles.chRow, isSel && { borderColor: theme.gold }]}
          >
            {mergeMode && (
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2,
                borderColor: isSel ? theme.gold : theme.border,
                backgroundColor: isSel ? theme.gold : "transparent",
                alignItems: "center", justifyContent: "center" }}>
                {isSel && <Ionicons name="checkmark" size={12} color="#000" />}
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.chName}>{c.display_name !== c.name ? `${c.display_name}` : c.name}</Text>
              {c.display_name !== c.name && <Text style={{ color: theme.textMute, fontSize: 10 }}>({c.name})</Text>}
              <Text style={styles.chCat}>{c.channel_count} kanal · sıra: {c.order}</Text>
            </View>
            {/* Hızlı erişim değiştirme */}
            {!mergeMode && (
              <View style={{ flexDirection: "row", gap: 4 }}>
                {(["open", "vip", "closed"] as const).map(a => (
                  <Pressable key={a} onPress={(e) => { saveAccess(c.name, a); }}
                    style={[styles.miniBtn, c.access === a && { backgroundColor: ACCESS_LABELS[a].color + "33", borderColor: ACCESS_LABELS[a].color }]}>
                    <Text style={[styles.miniBtnText, c.access === a && { color: ACCESS_LABELS[a].color }]}>
                      {a === "open" ? "A" : a === "vip" ? "V" : "K"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Pressable>
        );
      })}

      {/* Düzenleme Modalı */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setEditing(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kategori Ayarı</Text>
            <Text style={styles.modalSub}>{editing?.name}</Text>
            <View style={styles.inputWrap}>
              <TextInput value={editing?.display_name || ""} onChangeText={v => setEditing(e => e ? { ...e, display_name: v } : e)}
                placeholder="Görünen ad (boş = orijinal)" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.inputWrap}>
              <TextInput value={String(editing?.order ?? 999)} onChangeText={v => setEditing(e => e ? { ...e, order: parseInt(v) || 0 } : e)}
                placeholder="Sıralama (0=en üst)" keyboardType="numeric" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <Text style={{ color: theme.textDim, fontSize: 12, marginTop: 4 }}>Erişim:</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {(["open", "vip", "closed"] as const).map(a => (
                <Pressable key={a} onPress={() => setEditing(e => e ? { ...e, access: a } : e)}
                  style={[styles.miniBtn, { flex: 1, paddingVertical: 10 },
                    editing?.access === a && { backgroundColor: ACCESS_LABELS[a].color + "33", borderColor: ACCESS_LABELS[a].color }]}>
                  <Text style={[styles.miniBtnText, editing?.access === a && { color: ACCESS_LABELS[a].color }]}>
                    {ACCESS_LABELS[a].label}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              <Pressable onPress={() => setEditing(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={saveEdit} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ---------- PACKAGES (VIP Paketleri) ----------
function PackagesTab({ onToast }: { onToast: (m: string) => void }) {
  const [packages, setPackages] = useState<VipPackage[]>([]);
  const [cats, setCats] = useState<CategoryConfig[]>([]);
  const [editing, setEditing] = useState<VipPackage | null>(null);
  const [form, setForm] = useState<Omit<VipPackage, "id" | "created_at">>({
    name: "", description: "", categories: [], channel_ids: [], active: true,
  });

  const load = async () => {
    try {
      const [pkgs, catList] = await Promise.all([api.adminVipPackages(), api.adminCategoryConfigs()]);
      setPackages(pkgs);
      setCats(catList);
    } catch {}
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditing({ id: "", name: "", categories: [], channel_ids: [], active: true, created_at: "" });
    setForm({ name: "", description: "", categories: [], channel_ids: [], active: true });
  };

  const openEdit = (p: VipPackage) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description || "", categories: [...p.categories], channel_ids: [...p.channel_ids], active: p.active });
  };

  const save = async () => {
    try {
      if (editing?.id) await api.adminUpdateVipPackage(editing.id, form);
      else await api.adminCreateVipPackage(form);
      onToast("Kaydedildi"); setEditing(null); load();
    } catch (e: any) { onToast(e.message); }
  };

  const toggleCat = (name: string) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(name) ? f.categories.filter(c => c !== name) : [...f.categories, name],
    }));
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.sectionTitle}>VIP Paketleri</Text>
        <Pressable onPress={openNew} style={styles.smallBtn}><Ionicons name="add" size={16} color="#fff" /></Pressable>
      </View>
      <Text style={{ color: theme.textDim, fontSize: 12, marginBottom: 8 }}>
        Her paket, kategorilerin bir koleksiyonudur. VIP kullanıcılara veya tek tek kişilere atanabilir.
      </Text>

      {packages.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="gift-outline" size={48} color={theme.textMute} />
          <Text style={styles.emptyText}>Henüz paket yok</Text>
        </View>
      ) : packages.map(p => (
        <Pressable key={p.id} onPress={() => openEdit(p)} style={styles.itemRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{p.name}{p.active ? "" : " · pasif"}</Text>
            <Text style={styles.itemMeta}>{p.categories.length} kategori · {p.channel_ids.length} özel kanal</Text>
            {p.description ? <Text style={styles.itemMeta}>{p.description}</Text> : null}
          </View>
          <Pressable onPress={() => api.adminDeleteVipPackage(p.id).then(() => { onToast("Silindi"); load(); }).catch(e => onToast(e.message))} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </Pressable>
        </Pressable>
      ))}

      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setEditing(null)} />
          <ScrollView style={[styles.modalCard, { maxHeight: "90%" }]} contentContainerStyle={{ gap: 10, paddingBottom: 20 }}>
            <Text style={styles.modalTitle}>{editing?.id ? "Paketi Düzenle" : "Yeni Paket"}</Text>
            <View style={styles.inputWrap}>
              <TextInput value={form.name} onChangeText={v => setForm({ ...form, name: v })} placeholder="Paket adı" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.inputWrap}>
              <TextInput value={form.description || ""} onChangeText={v => setForm({ ...form, description: v })} placeholder="Açıklama (opsiyonel)" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Aktif</Text>
              <Switch value={form.active} onValueChange={v => setForm({ ...form, active: v })} thumbColor={form.active ? theme.accent : "#888"} />
            </View>
            <Text style={{ color: theme.textDim, fontSize: 13, fontWeight: "700" }}>Kategoriler (seç/kaldır):</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {cats.filter(c => c.access !== "closed").map(c => {
                const sel = form.categories.includes(c.name);
                return (
                  <Pressable key={c.name} onPress={() => toggleCat(c.name)}
                    style={[styles.tinyChip, sel && { backgroundColor: theme.accent + "33", borderColor: theme.accent }]}>
                    <Text style={[styles.tinyChipText, sel && { color: theme.accent }]}>{c.display_name}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setEditing(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={save} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Kaydet</Text></Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ---------- SOURCES ----------
function SourcesTab({ onToast }: { onToast: (m: string) => void }) {
  const [sources, setSources] = useState<M3USource[]>([]);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => api.adminSources().then(setSources).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async () => {
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      await api.adminAddSource(name.trim(), url.trim());
      setName(""); setUrl(""); setAdding(false);
      onToast("Kaynak eklendi");
      setTimeout(load, 1500);
    } catch (e: any) { onToast(e.message); } finally { setBusy(false); }
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.btnRow}>
        <Pressable testID="add-source-btn" onPress={() => setAdding(true)} style={styles.primaryBtn}>
          <Ionicons name="add-circle" size={18} color="#fff" /><Text style={styles.primaryText}>Yeni Kaynak</Text>
        </Pressable>
        <Pressable testID="sync-all-btn" onPress={async () => { onToast("Senkronize ediliyor..."); try { const r = await api.adminSyncAll(); onToast(`${r.total_channels} kanal`); load(); } catch (e: any) { onToast(e.message); } }} style={styles.secondaryBtn}>
          <Ionicons name="refresh" size={18} color={theme.text} /><Text style={styles.secondaryText}>Tümünü Yenile</Text>
        </Pressable>
      </View>
      {sources.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="cloud-offline-outline" size={48} color={theme.textMute} />
          <Text style={styles.emptyText}>Henüz kaynak yok</Text>
        </View>
      ) : sources.map(s => (
        <View key={s.id} style={styles.sourceCard} testID={`source-${s.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.sourceName}>{s.name}</Text>
            <Text style={styles.sourceUrl}>{s.url_masked}</Text>
            <Text style={styles.sourceMeta}>{s.channel_count} kanal · {s.last_synced ? "Senkron OK" : "Beklemede"}</Text>
          </View>
          <Pressable onPress={async () => { onToast("Senkronize..."); try { const r = await api.adminSyncSource(s.id); onToast(`${r.channel_count} kanal`); load(); } catch (e: any) { onToast(e.message); } }} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="refresh" size={20} color={theme.accent} />
          </Pressable>
          <Pressable onPress={async () => { try { await api.adminDelSource(s.id); onToast("Silindi"); load(); } catch (e: any) { onToast(e.message); } }} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </Pressable>
        </View>
      ))}

      <Modal visible={adding} transparent animationType="slide" onRequestClose={() => setAdding(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setAdding(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Yeni M3U Kaynağı</Text>
            <Text style={styles.modalSub}>URL kullanıcılara hiçbir zaman gösterilmez.</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="bookmark-outline" size={18} color={theme.textDim} />
              <TextInput testID="source-name-input" value={name} onChangeText={setName} placeholder="Kaynak adı" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="link-outline" size={18} color={theme.textDim} />
              <TextInput testID="source-url-input" value={url} onChangeText={setUrl} placeholder="https://... .m3u" placeholderTextColor={theme.textMute} style={styles.input} autoCapitalize="none" autoCorrect={false} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setAdding(false)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable testID="confirm-add-source" onPress={add} disabled={busy} style={[styles.primaryBtn, { flex: 1 }]}>
                {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryText}>Ekle</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ---------- CHANNELS ----------
function ChannelsTab({ onToast }: { onToast: (m: string) => void }) {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AdminChannel | null>(null);
  const [eName, setEName] = useState("");
  const [eCat, setECat] = useState("");
  const [eVip, setEVip] = useState(false);
  const [eAdult, setEAdult] = useState(false); // ENTEGRE EDİLDİ
  const [eSport, setESport] = useState(false); // ENTEGRE EDİLDİ
  const [eHidden, setEHidden] = useState(false);
  const load = () => api.adminChannels(search || undefined).then(setChannels).catch(() => {});
  useEffect(() => { const t = setTimeout(load, search ? 350 : 0); return () => clearTimeout(t); }, [search]);
  const openEdit = (c: AdminChannel) => { setEditing(c); setEName(c.name); setECat(c.category); setEVip(c.vip); setEAdult(!!c.adult); setESport(!!c.sport); setEHidden(!!c.hidden); };
  const save = async () => {
    if (!editing) return;
    try {
      await api.adminUpdateChannel(editing.id, { name: eName, category: eCat, vip: eVip, adult: eAdult, sport: eSport, hidden: eHidden });
      onToast("Güncellendi"); setEditing(null); load();
    } catch (e: any) { onToast(e.message); }
  };
  const del = async (id: string) => {
    try { await api.adminDelChannel(id); onToast("Silindi"); load(); } catch (e: any) { onToast(e.message); }
  };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.textDim} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Kanal ara..." placeholderTextColor={theme.textMute} style={styles.searchInput} />
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={{ color: theme.textDim, fontSize: 12, marginBottom: 8 }}>{channels.length} kanal</Text>
        {channels.slice(0, 200).map(c => (
          <View key={c.id} style={styles.chRow} testID={`ch-${c.id}`}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.chName, c.hidden && { color: theme.textMute }]} numberOfLines={1}>
                {c.name}{c.vip ? " ⭐" : ""}{c.adult ? " 🔞" : ""}{c.sport ? " ⚽" : ""}{c.hidden ? " · gizli" : ""}
              </Text>
              <Text style={styles.chCat}>{c.category}</Text>
            </View>
            <Pressable onPress={() => openEdit(c)} style={styles.iconBtn} hitSlop={6}>
              <Ionicons name="create-outline" size={20} color={theme.accent} />
            </Pressable>
            <Pressable onPress={() => api.adminUpdateChannel(c.id, { hidden: !c.hidden }).then(() => { onToast(c.hidden ? "Görünür" : "Gizlendi"); load(); }).catch(e => onToast(e.message))} style={styles.iconBtn} hitSlop={6}>
              <Ionicons name={c.hidden ? "eye" : "eye-off"} size={20} color={theme.gold} />
            </Pressable>
            <Pressable onPress={() => del(c.id)} style={styles.iconBtn} hitSlop={6}>
              <Ionicons name="trash-outline" size={20} color={theme.danger} />
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setEditing(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Kanal Düzenle</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="text-outline" size={18} color={theme.textDim} />
              <TextInput value={eName} onChangeText={setEName} placeholder="Kanal adı" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.inputWrap}>
              <Ionicons name="folder-outline" size={18} color={theme.textDim} />
              <TextInput value={eCat} onChangeText={setECat} placeholder="Kategori" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>VIP</Text>
              <Switch value={eVip} onValueChange={setEVip} thumbColor={eVip ? theme.gold : "#888"} trackColor={{ false: theme.bg2, true: "#5C4513" }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>+18 (Kilitli Kategori)</Text>
              <Switch value={eAdult} onValueChange={setEAdult} thumbColor={eAdult ? theme.accent : "#888"} trackColor={{ false: theme.bg2, true: theme.accentSoft }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Spor Kanalı Kısıtlaması</Text>
              <Switch value={eSport} onValueChange={setESport} thumbColor={eSport ? theme.success : "#888"} trackColor={{ false: theme.bg2, true: "#144a24" }} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Gizle / Engelle</Text>
              <Switch value={eHidden} onValueChange={setEHidden} thumbColor={eHidden ? theme.accent : "#888"} trackColor={{ false: theme.bg2, true: theme.accentSoft }} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setEditing(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={save} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ---------- USERS ----------
function UsersTab({ onToast }: { onToast: (m: string) => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [vipModal, setVipModal] = useState<User | null>(null);
  const [days, setDays] = useState("30");
  const [grantModal, setGrantModal] = useState<User | null>(null);
  const [grant, setGrant] = useState<UserGrant | null>(null);
  const [packages, setPackages] = useState<VipPackage[]>([]);
  const [cats, setCats] = useState<CategoryConfig[]>([]);
  const [superfavName, setSuperfavName] = useState("");

  const load = () => api.adminUsers().then(setUsers).catch(() => {});
  useEffect(() => { load(); }, []);

  const openGrant = async (u: User) => {
    setGrantModal(u);
    try {
      const [g, pkgs, catList] = await Promise.all([
        api.adminGetUserGrant(u.id),
        api.adminVipPackages(),
        api.adminCategoryConfigs(),
      ]);
      setGrant(g);
      setPackages(pkgs.filter(p => p.active));
      setCats(catList.filter(c => c.access !== "closed"));
      setSuperfavName(g.superfav_name || "");
    } catch {}
  };

  const saveGrant = async () => {
    if (!grantModal || !grant) return;
    try {
      await api.adminSetUserGrant(grantModal.id, {
        ...grant,
        superfav_name: superfavName.trim() || undefined,
      });
      onToast("Erişim hakları kaydedildi");
      setGrantModal(null);
    } catch (e: any) { onToast(e.message); }
  };

  const toggleGrantPackage = (id: string) => {
    setGrant(g => g ? {
      ...g,
      package_ids: g.package_ids.includes(id) ? g.package_ids.filter(p => p !== id) : [...g.package_ids, id],
    } : g);
  };

  const toggleGrantCat = (name: string) => {
    setGrant(g => g ? {
      ...g,
      extra_categories: g.extra_categories.includes(name)
        ? g.extra_categories.filter(c => c !== name)
        : [...g.extra_categories, name],
    } : g);
  };

  const setResultUser = async (u: User, field: "adult_allowed" | "sports_allowed", val: boolean) => {
    try {
      if (field === "adult_allowed") await api.adminSetAdult(u.id, val);
      else await api.adminSetSports(u.id, val);
      onToast("Yetki güncellendi"); load();
    } catch (e: any) { onToast(e.message); }
  };
  const setRole = async (u: User, r: Role) => { try { await api.adminSetRole(u.id, r); onToast("Rol güncellendi"); load(); } catch (e: any) { onToast(e.message); } };
  const toggleBlock = async (u: User) => { try { await api.adminSetBlock(u.id, !u.blocked); onToast(u.blocked ? "Engel kaldırıldı" : "Engellendi"); load(); } catch (e: any) { onToast(e.message); } };
  const grantVip = async () => {
    if (!vipModal) return;
    const n = parseInt(days) || 30;
    try { await api.adminGrantVip(vipModal.id, n); onToast(`+${n} gün VIP`); setVipModal(null); load(); } catch (e: any) { onToast(e.message); }
  };
  const del = async (u: User) => { try { await api.adminDelUser(u.id); onToast("Silindi"); load(); } catch (e: any) { onToast(e.message); } };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      {users.map(u => (
        <View key={u.id} style={[styles.userCard, u.blocked && { borderColor: theme.danger }]} testID={`user-${u.username}`}>
          <View style={styles.userAvatar}>
            <Ionicons name={u.role === "admin" ? "shield-checkmark" : u.role === "vip" ? "star" : "person"} size={20} color={u.role === "admin" ? theme.accent : u.role === "vip" ? theme.gold : theme.textDim} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.userName}>{u.username}{u.blocked ? " · ENGELLİ" : ""}</Text>
            <Text style={styles.userRole}>{u.role.toUpperCase()}{u.vip_until ? ` · ${new Date(u.vip_until).toLocaleDateString("tr-TR")}` : ""}</Text>
            
            {/* Canlı İzin Kontrol Switch Bölümü */}
            <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 11, color: theme.textDim }}>🔞 +18 İzni:</Text>
                <Switch value={u.adult_allowed} onValueChange={(v) => setResultUser(u, "adult_allowed", v)} style={{ transform: [{ scaleX: 0.65 }, { scaleY: 0.65 }] }} thumbColor={u.adult_allowed ? theme.accent : "#555"} />
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={{ fontSize: 11, color: theme.textDim }}>⚽ Spor İzni:</Text>
                <Switch value={u.sports_allowed} onValueChange={(v) => setResultUser(u, "sports_allowed", v)} style={{ transform: [{ scaleX: 0.65 }, { scaleY: 0.65 }] }} thumbColor={u.sports_allowed ? theme.success : "#555"} />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {(["user", "vip", "admin"] as Role[]).map(r => (
                <Pressable key={r} testID={`role-${u.username}-${r}`} onPress={() => setRole(u, r)} style={[styles.miniBtn, u.role === r && styles.miniBtnActive]}>
                  <Text style={[styles.miniBtnText, u.role === r && { color: "#fff" }]}>{r === "user" ? "U" : r === "vip" ? "V" : "A"}</Text>
                </Pressable>
              ))}
              <Pressable onPress={() => setVipModal(u)} style={[styles.miniBtn, { backgroundColor: theme.gold + "33", borderColor: theme.gold }]}>
                <Ionicons name="add" size={11} color={theme.gold} />
                <Text style={[styles.miniBtnText, { color: theme.gold }]}>VIP+</Text>
              </Pressable>
              <Pressable onPress={() => api.adminRevokeVip(u.id).then(() => { onToast("VIP kaldırıldı"); load(); }).catch(e => onToast(e.message))} style={styles.miniBtn}>
                <Ionicons name="close" size={11} color={theme.text} />
              </Pressable>
              {/* Kategori/Paket Ata */}
              <Pressable onPress={() => openGrant(u)} style={[styles.miniBtn, { backgroundColor: "#3B82F622", borderColor: "#3B82F6" }]}>
                <Ionicons name="layers" size={11} color="#3B82F6" />
                <Text style={[styles.miniBtnText, { color: "#3B82F6" }]}>Paket</Text>
              </Pressable>
              <Pressable onPress={() => toggleBlock(u)} style={[styles.miniBtn, u.blocked && { backgroundColor: theme.danger + "33", borderColor: theme.danger }]}>
                <Ionicons name="ban" size={11} color={u.blocked ? theme.danger : theme.text} />
              </Pressable>
              <Pressable onPress={() => del(u)} style={styles.miniBtn}>
                <Ionicons name="trash" size={11} color={theme.danger} />
              </Pressable>
            </View>
          </View>
        </View>
      ))}

      {/* VIP Gün Modalı */}
      <Modal visible={!!vipModal} transparent animationType="slide" onRequestClose={() => setVipModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setVipModal(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>VIP Süresi Ver</Text>
            <Text style={styles.modalSub}>{vipModal?.username} kullanıcısına gün bazlı VIP süresi ekle.</Text>
            <View style={styles.inputWrap}>
              <Ionicons name="calendar-outline" size={18} color={theme.textDim} />
              <TextInput value={days} onChangeText={setDays} keyboardType="numeric" placeholder="Gün" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setVipModal(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={grantVip} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Onayla</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Kategori/Paket Atama Modalı */}
      <Modal visible={!!grantModal} transparent animationType="slide" onRequestClose={() => setGrantModal(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setGrantModal(null)} />
          <ScrollView style={[styles.modalCard, { maxHeight: "92%" }]} contentContainerStyle={{ gap: 10, paddingBottom: 24 }}>
            <Text style={styles.modalTitle}>📦 Paket & Kategori Ata</Text>
            <Text style={styles.modalSub}>{grantModal?.username} — özel erişim hakları</Text>

            <Text style={{ color: theme.textDim, fontSize: 13, fontWeight: "700" }}>VIP Paketleri:</Text>
            {packages.length === 0
              ? <Text style={{ color: theme.textMute, fontSize: 12 }}>Önce Paketler sekmesinden paket oluşturun.</Text>
              : packages.map(p => {
                const sel = grant?.package_ids.includes(p.id);
                return (
                  <Pressable key={p.id} onPress={() => toggleGrantPackage(p.id)}
                    style={[styles.chRow, sel && { borderColor: theme.gold }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.chName, sel && { color: theme.gold }]}>{p.name}</Text>
                      <Text style={styles.chCat}>{p.categories.join(", ") || "Kategori yok"}</Text>
                    </View>
                    {sel && <Ionicons name="checkmark-circle" size={20} color={theme.gold} />}
                  </Pressable>
                );
              })
            }

            <Text style={{ color: theme.textDim, fontSize: 13, fontWeight: "700", marginTop: 4 }}>Tek Tek Ekstra Kategoriler:</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
              {cats.map(c => {
                const sel = grant?.extra_categories.includes(c.name);
                return (
                  <Pressable key={c.name} onPress={() => toggleGrantCat(c.name)}
                    style={[styles.tinyChip, sel && { backgroundColor: "#3B82F622", borderColor: "#3B82F6" }]}>
                    <Text style={[styles.tinyChipText, sel && { color: "#3B82F6" }]}>{c.display_name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ color: theme.textDim, fontSize: 13, fontWeight: "700", marginTop: 4 }}>Süper Favori Koleksiyonu:</Text>
            <Text style={{ color: theme.textMute, fontSize: 11 }}>
              Bu kullanıcıya özel kategori oluşturur. Kanal ID'lerini virgülle girin.
            </Text>
            <View style={styles.inputWrap}>
              <TextInput value={superfavName} onChangeText={setSuperfavName} placeholder="Koleksiyon adı (örn: Özel Paket)" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={[styles.inputWrap, { minHeight: 70 }]}>
              <TextInput
                value={grant?.superfav_channel_ids.join("\n") || ""}
                onChangeText={v => setGrant(g => g ? { ...g, superfav_channel_ids: v.split(/[\n,]+/).map(s => s.trim()).filter(Boolean) } : g)}
                placeholder={"Kanal ID'leri (her satıra bir tane)"}
                placeholderTextColor={theme.textMute}
                style={[styles.input, { paddingTop: 8 }]}
                multiline
              />
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setGrantModal(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={saveGrant} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Kaydet</Text></Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ---------- VIP & CRYPTO ----------
function VipCryptoTab({ onToast }: { onToast: (m: string) => void }) {
  const [plans, setPlans] = useState<VipPlan[]>([]);
  const [wallets, setWallets] = useState<CryptoWallet[]>([]);
  const [planEdit, setPlanEdit] = useState<VipPlan | null>(null);
  const [planForm, setPlanForm] = useState<Omit<VipPlan, "id">>({ name: "", days: 30, price_usd: 0, price_try: 0, description: "", active: true });
  const [walEdit, setWalEdit] = useState<CryptoWallet | null>(null);
  const [walForm, setWalForm] = useState<Omit<CryptoWallet, "id">>({ symbol: "BTC", name: "Bitcoin", network: "Mainnet", address: "", active: true });
  const load = () => Promise.all([api.adminVipPlans(), api.adminCrypto()]).then(([p, w]) => { setPlans(p); setWallets(w); }).catch(() => {});
  useEffect(() => { load(); }, []);
  const openPlan = (p: VipPlan | null) => {
    setPlanEdit(p || ({ id: "", name: "", days: 30, price_usd: 0, price_try: 0, description: "", active: true }));
    setPlanForm(p ? { name: p.name, days: p.days, price_usd: p.price_usd, price_try: p.price_try, description: p.description || "", active: p.active } : { name: "", days: 30, price_usd: 0, price_try: 0, description: "", active: true });
  };
  const savePlan = async () => {
    try {
      if (planEdit?.id) await api.adminUpdateVipPlan(planEdit.id, planForm);
      else await api.adminAddVipPlan(planForm);
      onToast("Kaydedildi"); setPlanEdit(null); load();
    } catch (e: any) { onToast(e.message); }
  };
  const openWal = (w: CryptoWallet | null) => {
    setWalEdit(w || ({ id: "", symbol: "BTC", name: "Bitcoin", network: "Mainnet", address: "", active: true }));
    setWalForm(w ? { symbol: w.symbol, name: w.name, network: w.network, address: w.address, active: w.active } : { symbol: "BTC", name: "Bitcoin", network: "Mainnet", address: "", active: true });
  };
  const saveWal = async () => {
    try {
      if (walEdit?.id) await api.adminUpdateCrypto(walEdit.id, walForm);
      else await api.adminAddCrypto(walForm);
      onToast("Kaydedildi"); setWalEdit(null); load();
    } catch (e: any) { onToast(e.message); }
  };
  const CRYPTOS = [
    { sym: "BTC", n: "Bitcoin", net: "Mainnet" },
    { sym: "ETH", n: "Ethereum", net: "ERC20" },
    { sym: "USDT", n: "Tether", net: "TRC20" },
    { sym: "USDT", n: "Tether", net: "ERC20" },
    { sym: "USDT", n: "Tether", net: "BEP20" },
    { sym: "BNB", n: "Binance Coin", net: "BEP20" },
    { sym: "SOL", n: "Solana", net: "Mainnet" },
    { sym: "TON", n: "Toncoin", net: "Mainnet" },
    { sym: "DOGE", n: "Dogecoin", net: "Mainnet" },
    { sym: "XRP", n: "XRP", net: "Mainnet" },
    { sym: "TRX", n: "Tron", net: "Mainnet" },
  ];
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.sectionTitle}>VIP Planları</Text>
        <Pressable onPress={() => openPlan(null)} style={styles.smallBtn} testID="add-plan-btn"><Ionicons name="add" size={16} color="#fff" /></Pressable>
      </View>
      {plans.map(p => (
        <Pressable key={p.id} onPress={() => openPlan(p)} style={styles.itemRow} testID={`plan-${p.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{p.name}{p.active ? "" : " · pasif"}</Text>
            <Text style={styles.itemMeta}>{p.days} gün · {p.price_try} ₺ / ${p.price_usd}</Text>
          </View>
          <Pressable onPress={() => api.adminDelVipPlan(p.id).then(() => { onToast("Silindi"); load(); }).catch(e => onToast(e.message))} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </Pressable>
        </Pressable>
      ))}

      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
        <Text style={styles.sectionTitle}>Kripto Cüzdanlar</Text>
        <Pressable onPress={() => openWal(null)} style={styles.smallBtn} testID="add-wallet-btn"><Ionicons name="add" size={16} color="#fff" /></Pressable>
      </View>
      {wallets.map(w => (
        <Pressable key={w.id} onPress={() => openWal(w)} style={styles.itemRow} testID={`wallet-${w.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{w.name} ({w.symbol}){w.active ? "" : " · pasif"}</Text>
            <Text style={styles.itemMeta}>{w.network}</Text>
            <Text style={styles.itemAddr} numberOfLines={1}>{w.address}</Text>
          </View>
          <Pressable onPress={() => api.adminDelCrypto(w.id).then(() => { onToast("Silindi"); load(); }).catch(e => onToast(e.message))} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </Pressable>
        </Pressable>
      ))}

      {/* Plan Modal */}
      <Modal visible={!!planEdit} transparent animationType="slide" onRequestClose={() => setPlanEdit(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setPlanEdit(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{planEdit?.id ? "Planı Düzenle" : "Yeni Plan"}</Text>
            <View style={styles.inputWrap}>
              <TextInput value={planForm.name} onChangeText={v => setPlanForm({ ...planForm, name: v })} placeholder="Plan adı" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.inputWrap}>
              <TextInput value={String(planForm.days)} onChangeText={v => setPlanForm({ ...planForm, days: parseInt(v) || 0 })} placeholder="Gün" keyboardType="numeric" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={[styles.inputWrap, { flex: 1 }]}>
                <TextInput value={String(planForm.price_try)} onChangeText={v => setPlanForm({ ...planForm, price_try: parseFloat(v) || 0 })} placeholder="₺" keyboardType="numeric" placeholderTextColor={theme.textMute} style={styles.input} />
              </View>
              <View style={[styles.inputWrap, { flex: 1 }]}>
                <TextInput value={String(planForm.price_usd)} onChangeText={v => setPlanForm({ ...planForm, price_usd: parseFloat(v) || 0 })} placeholder="$" keyboardType="numeric" placeholderTextColor={theme.textMute} style={styles.input} />
              </View>
            </View>
            <View style={styles.inputWrap}>
              <TextInput value={planForm.description || ""} onChangeText={v => setPlanForm({ ...planForm, description: v })} placeholder="Açıklama" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Aktif</Text>
              <Switch value={planForm.active} onValueChange={v => setPlanForm({ ...planForm, active: v })} thumbColor={planForm.active ? theme.accent : "#888"} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setPlanEdit(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={savePlan} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Wallet Modal */}
      <Modal visible={!!walEdit} transparent animationType="slide" onRequestClose={() => setWalEdit(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setWalEdit(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{walEdit?.id ? "Cüzdanı Düzenle" : "Yeni Kripto Cüzdan"}</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
              {CRYPTOS.map(c => (
                <Pressable key={`${c.sym}-${c.net}`} onPress={() => setWalForm({ ...walForm, symbol: c.sym, name: c.n, network: c.net })} style={[styles.tinyChip, walForm.symbol === c.sym && walForm.network === c.net && { backgroundColor: theme.gold + "33", borderColor: theme.gold }]}>
                  <Text style={[styles.tinyChipText, walForm.symbol === c.sym && walForm.network === c.net && { color: theme.gold }]}>{c.sym} {c.net !== "Mainnet" ? `(${c.net})` : ""}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.inputWrap}>
              <TextInput value={walForm.symbol} onChangeText={v => setWalForm({ ...walForm, symbol: v.toUpperCase() })} placeholder="Sembol" placeholderTextColor={theme.textMute} style={styles.input} autoCapitalize="characters" />
            </View>
            <View style={styles.inputWrap}>
              <TextInput value={walForm.name} onChangeText={v => setWalForm({ ...walForm, name: v })} placeholder="Ad" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.inputWrap}>
              <TextInput value={walForm.network} onChangeText={v => setWalForm({ ...walForm, network: v })} placeholder="Ağ" placeholderTextColor={theme.textMute} style={styles.input} />
            </View>
            <View style={styles.inputWrap}>
              <TextInput value={walForm.address} onChangeText={v => setWalForm({ ...walForm, address: v })} placeholder="Cüzdan adresi" placeholderTextColor={theme.textMute} style={styles.input} autoCapitalize="none" />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Aktif</Text>
              <Switch value={walForm.active} onValueChange={v => setWalForm({ ...walForm, active: v })} thumbColor={walForm.active ? theme.gold : "#888"} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setWalEdit(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={saveWal} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ---------- ADS ----------
function AdsTab({ onToast }: { onToast: (m: string) => void }) {
  const [ads, setAds] = useState<Ad[]>([]);
  const [editing, setEditing] = useState<Ad | null>(null);
  const [form, setForm] = useState<Omit<Ad, "id">>({ title: "", image_url: "", link_url: "", type: "banner", active: true, weight: 1 });
  const load = () => api.adminAds().then(setAds).catch(() => {});
  useEffect(() => { load(); }, []);
  const open = (a: Ad | null) => {
    setEditing(a || ({ id: "", title: "", image_url: "", link_url: "", type: "banner", active: true, weight: 1 }));
    setForm(a ? { title: a.title, image_url: a.image_url, link_url: a.link_url || "", type: a.type, active: a.active, weight: a.weight } : { title: "", image_url: "", link_url: "", type: "banner", active: true, weight: 1 });
  };
  const save = async () => {
    try {
      if (editing?.id) await api.adminUpdateAd(editing.id, form);
      else await api.adminAddAd(form);
      onToast("Kaydedildi"); setEditing(null); load();
    } catch (e: any) { onToast(e.message); }
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={styles.sectionTitle}>Reklamlar (Sadece normal kullanıcılara gösterilir)</Text>
        <Pressable onPress={() => open(null)} style={styles.smallBtn} testID="add-ad-btn"><Ionicons name="add" size={16} color="#fff" /></Pressable>
      </View>
      {ads.length === 0 ? (
        <Text style={{ color: theme.textDim, paddingVertical: 16, textAlign: "center" }}>Reklam yok</Text>
      ) : ads.map(a => (
        <Pressable key={a.id} onPress={() => open(a)} style={styles.itemRow} testID={`ad-${a.id}`}>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemName}>{a.title}{a.active ? "" : " · pasif"}</Text>
            <Text style={styles.itemMeta}>{a.type} · ağırlık {a.weight}</Text>
            <Text style={styles.itemAddr} numberOfLines={1}>{a.image_url}</Text>
          </View>
          <Pressable onPress={() => api.adminDelAd(a.id).then(() => { onToast("Silindi"); load(); }).catch(e => onToast(e.message))} style={styles.iconBtn} hitSlop={6}>
            <Ionicons name="trash-outline" size={20} color={theme.danger} />
          </Pressable>
        </Pressable>
      ))}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.modalRoot}>
          <Pressable style={styles.modalBack} onPress={() => setEditing(null)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{editing?.id ? "Reklamı Düzenle" : "Yeni Reklam"}</Text>
            <View style={styles.inputWrap}><TextInput value={form.title} onChangeText={v => setForm({ ...form, title: v })} placeholder="Başlık" placeholderTextColor={theme.textMute} style={styles.input} /></View>
            <View style={styles.inputWrap}><TextInput value={form.image_url} onChangeText={v => setForm({ ...form, image_url: v })} placeholder="Görsel URL" placeholderTextColor={theme.textMute} style={styles.input} autoCapitalize="none" /></View>
            <View style={styles.inputWrap}><TextInput value={form.link_url || ""} onChangeText={v => setForm({ ...form, link_url: v })} placeholder="Tıklama URL (opsiyonel)" placeholderTextColor={theme.textMute} style={styles.input} autoCapitalize="none" /></View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLbl}>Aktif</Text>
              <Switch value={form.active} onValueChange={v => setForm({ ...form, active: v })} thumbColor={form.active ? theme.accent : "#888"} />
            </View>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Pressable onPress={() => setEditing(null)} style={[styles.secondaryBtn, { flex: 1 }]}><Text style={styles.secondaryText}>İptal</Text></Pressable>
              <Pressable onPress={save} style={[styles.primaryBtn, { flex: 1 }]}><Text style={styles.primaryText}>Kaydet</Text></Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </ScrollView>
  );
}

// ---------- SETTINGS ----------
function SettingsTab({ onToast }: { onToast: (m: string) => void }) {
  const [s, setS] = useState<AppSettings | null>(null);
  useEffect(() => { api.adminGetSettings().then(setS).catch(() => {}); }, []);
  const save = async () => {
    if (!s) return;
    try { await api.adminPutSettings(s); onToast("Ayarlar kaydedildi"); } catch (e: any) { onToast(e.message); }
  };
  if (!s) return <View style={styles.centerAll}><ActivityIndicator color={theme.accent} /></View>;
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>Uygulama Görünümü</Text>
      <Field label="Uygulama adı"><TextInput value={s.app_name} onChangeText={v => setS({ ...s, app_name: v })} style={styles.input} placeholderTextColor={theme.textMute} /></Field>
      <Field label="Alt başlık"><TextInput value={s.tagline} onChangeText={v => setS({ ...s, tagline: v })} style={styles.input} placeholderTextColor={theme.textMute} /></Field>
      <Field label="Ana renk (HEX)"><TextInput value={s.primary_color} onChangeText={v => setS({ ...s, primary_color: v })} style={styles.input} autoCapitalize="none" placeholderTextColor={theme.textMute} /></Field>
      <Field label="VIP tanıtım metni"><TextInput value={s.vip_intro} onChangeText={v => setS({ ...s, vip_intro: v })} style={[styles.input, { minHeight: 60 }]} multiline placeholderTextColor={theme.textMute} /></Field>
      <Field label="Destek mesajı"><TextInput value={s.support_msg} onChangeText={v => setS({ ...s, support_msg: v })} style={[styles.input, { minHeight: 60 }]} multiline placeholderTextColor={theme.textMute} /></Field>
      <Field label="Ödeme notu"><TextInput value={s.payment_note} onChangeText={v => setS({ ...s, payment_note: v })} style={[styles.input, { minHeight: 60 }]} multiline placeholderTextColor={theme.textMute} /></Field>
      <View style={styles.switchRow}>
        <Text style={styles.switchLbl}>Reklamlar etkin</Text>
        <Switch value={s.ads_enabled} onValueChange={v => setS({ ...s, ads_enabled: v })} thumbColor={s.ads_enabled ? theme.accent : "#888"} />
      </View>
      <Pressable onPress={save} style={[styles.primaryBtn, { marginTop: 10 }]} testID="save-settings">
        <Ionicons name="save" size={16} color="#fff" /><Text style={styles.primaryText}>Kaydet</Text>
      </Pressable>
    </ScrollView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <View style={[styles.inputWrap, { paddingVertical: 4 }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  centerAll: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerGrad: { paddingBottom: 12 },
  head: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 },
  title: { color: theme.text, fontSize: 20, fontWeight: "800" },
  sub: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  tab: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: theme.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.border },
  tabActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  tabText: { color: theme.textDim, fontWeight: "600", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  content: { padding: 16, gap: 10, paddingBottom: 60 },
  sectionTitle: { color: theme.text, fontSize: 14, fontWeight: "800", marginTop: 8, marginBottom: 6 },
  btnRow: { flexDirection: "row", gap: 10 },
  primaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.accent, paddingVertical: 12, borderRadius: 10 },
  primaryText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  secondaryBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: theme.surface, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border },
  secondaryText: { color: theme.text, fontWeight: "700", fontSize: 14 },
  smallBtn: { width: 32, height: 32, borderRadius: 8, backgroundColor: theme.accent, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", padding: 40, gap: 8 },
  emptyText: { color: theme.text, fontWeight: "700" },
  statCard: { width: "47%", backgroundColor: theme.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: theme.border, gap: 6 },
  statIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  statVal: { color: theme.text, fontSize: 22, fontWeight: "800" },
  statLbl: { color: theme.textDim, fontSize: 12 },
  sourceCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.surface, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.border },
  sourceName: { color: theme.text, fontSize: 15, fontWeight: "700" },
  sourceUrl: { color: theme.textDim, fontSize: 11, marginTop: 2, fontFamily: "monospace" },
  sourceMeta: { color: theme.textMute, fontSize: 11, marginTop: 4 },
  iconBtn: { padding: 6 },
  userCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.surface, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.border },
  userAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: theme.bg2, alignItems: "center", justifyContent: "center" },
  userName: { color: theme.text, fontSize: 14, fontWeight: "700" },
  userRole: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  miniBtn: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, backgroundColor: theme.bg2, borderWidth: 1, borderColor: theme.border, minWidth: 28, justifyContent: "center" },
  miniBtnActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  miniBtnText: { color: theme.textDim, fontSize: 11, fontWeight: "800" },
  chRow: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  chName: { color: theme.text, fontSize: 14, fontWeight: "600" },
  chCat: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.surface, paddingHorizontal: 12, borderRadius: 10, height: 42, borderWidth: 1, borderColor: theme.border },
  searchInput: { flex: 1, color: theme.text, fontSize: 14 },
  itemRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: theme.surface, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.border },
  itemName: { color: theme.text, fontSize: 14, fontWeight: "700" },
  itemMeta: { color: theme.textDim, fontSize: 11, marginTop: 2 },
  itemAddr: { color: theme.textMute, fontSize: 10, marginTop: 4, fontFamily: "monospace" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBack: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalCard: { backgroundColor: theme.bg2, padding: 18, paddingBottom: 30, borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: 10, borderWidth: 1, borderColor: theme.border, maxHeight: "85%" },
  modalTitle: { color: theme.text, fontSize: 17, fontWeight: "800" },
  modalSub: { color: theme.textDim, fontSize: 12, lineHeight: 17 },
  inputWrap: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: theme.surface, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: theme.border, minHeight: 46 },
  input: { flex: 1, color: theme.text, fontSize: 14 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, paddingVertical: 8 },
  switchLbl: { color: theme.text, fontSize: 14, fontWeight: "600" },
  fieldLbl: { color: theme.textDim, fontSize: 12, marginBottom: 4, marginLeft: 4 },
  tinyChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border },
  tinyChipText: { color: theme.textDim, fontSize: 11, fontWeight: "700" },
  toast: { position: "absolute", bottom: 24, left: 20, right: 20, backgroundColor: theme.surface2, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: theme.accent, alignItems: "center" },
  toastText: { color: theme.text, fontSize: 13, fontWeight: "600" },
});