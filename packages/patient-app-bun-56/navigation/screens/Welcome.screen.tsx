import { StyleSheet, View, Pressable } from "react-native";
import { useNavigation } from "@react-navigation/native";
import ThemedText from "@ui/ThemedText";

export default function WelcomeScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.page}>
      <View style={styles.hero}>
        <ThemedText style={styles.brand}>Clinic EZ</ThemedText>
        <ThemedText style={styles.title}>
          Healthcare made simple, personal, and mobile.
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Complete your onboarding to access appointments, records, and secure care
          from your phone.
        </ThemedText>
      </View>

      <View style={styles.card}>
        <View style={styles.feature}>
          <ThemedText style={styles.featureTitle}>Fast access</ThemedText>
          <ThemedText style={styles.featureDescription}>
            Start your care journey quickly with a clean, guided experience.
          </ThemedText>
        </View>

        <View style={styles.feature}>
          <ThemedText style={styles.featureTitle}>Secure records</ThemedText>
          <ThemedText style={styles.featureDescription}>
            Keep your health data protected and available when you need it.
          </ThemedText>
        </View>

        <View style={styles.feature}>
          <ThemedText style={styles.featureTitle}>Patient first</ThemedText>
          <ThemedText style={styles.featureDescription}>
            Designed for clarity, calm, and confidence at every step.
          </ThemedText>
        </View>
      </View>

      <Pressable
        style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
        onPress={() =>
          navigation.navigate("Onboarding", {
            screen: "Onboard",
          })
        }
      >
        <ThemedText style={styles.ctaText}>Get started</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: 28,
    paddingVertical: 40,
    justifyContent: "space-between",
    backgroundColor: "#FAFAFB",
  },
  hero: {
    marginTop: 16,
    gap: 14,
  },
  brand: {
    fontSize: 14,
    letterSpacing: 1.6,
    textTransform: "uppercase",
    opacity: 0.75,
  },
  title: {
    fontSize: 34,
    fontWeight: "700",
    lineHeight: 42,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.75,
    maxWidth: 340,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 24,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
    gap: 20,
  },
  feature: {
    gap: 8,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  featureDescription: {
    fontSize: 14,
    lineHeight: 22,
    opacity: 0.75,
  },
  cta: {
    backgroundColor: "#111827",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  ctaPressed: {
    opacity: 0.84,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});