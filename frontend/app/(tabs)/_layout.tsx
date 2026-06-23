import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { theme } from "@/src/api";
import { Platform } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMute,
        tabBarStyle: {
          backgroundColor: theme.bg2,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          height: Platform.OS === "ios" ? 84 : 64,
          paddingBottom: Platform.OS === "ios" ? 24 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Anasayfa",
          tabBarIcon: ({ color, size }) => <Ionicons name="tv" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="categories"
        options={{
          title: "Kategoriler",
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: "Favoriler",
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
