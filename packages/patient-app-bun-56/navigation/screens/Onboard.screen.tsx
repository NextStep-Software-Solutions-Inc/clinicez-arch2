import { ScrollView, View, StyleSheet, Pressable, useWindowDimensions, NativeSyntheticEvent, NativeScrollEvent, StatusBar } from "react-native";

import { LinearGradient } from "expo-linear-gradient";
import ThemedText from "@ui/ThemedText";
import { useOnboarding } from "contexts/OnboardingContext";
import { useRef, useState } from "react";


type Slide = {
  title: string;
  tagline: string;
  subtitle: string;
  icon: string;
  gradient: readonly [string, string, ...string[]];
};

const slides: Slide[] = [
  {
    title: "Secure",
    tagline: "Your privacy, protected end-to-end.",
    subtitle: "All your health data is encrypted in transit and at rest. Only you and your care team have access.",
    icon: "🔒",
    gradient: ["#1a1a2e", "#16213e", "#0f3460"],
  },
  {
    title: "Multi Clinic",
    tagline: "One app. Every clinic you trust.",
    subtitle: "Seamlessly switch between clinics, manage separate records, and stay connected to every care provider.",
    icon: "🏥",
    gradient: ["#134e5e", "#1a6b50", "#2d8a47"],
  },
  {
    title: "Offline",
    tagline: "Works anywhere. Even without signal.",
    subtitle: "Your records and appointments are always available, with smart sync when your connection returns.",
    icon: "📡",
    gradient: ["#3a1c71", "#d76d77", "#ffaf7b"],
  },
];

export default function OnboardScreen() {
    const { width, height } = useWindowDimensions();
    const { complete } = useOnboarding();
    const scrollRef = useRef<ScrollView | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);

    const handleComplete = async () => {
        await complete(); // persists to secure store → state machine handles routing
    };


    const handleNext = () => {
        if (activeIndex < slides.length - 1) {
            scrollRef.current?.scrollTo({ x: width * (activeIndex + 1), animated: true });
        } else {
            handleComplete();
        }
    };

    const handleScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
        const index = Math.round(event.nativeEvent.contentOffset.x / width);
        setActiveIndex(index);
    };

    return (
        <View style={styles.root}>
        <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

        <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            onMomentumScrollEnd={handleScrollEnd}
            scrollEventThrottle={16}
            style={StyleSheet.absoluteFill}
            contentContainerStyle={{ width: width * slides.length }}
        >
            {slides.map((slide) => (
            <LinearGradient
                key={slide.title}
                colors={slide.gradient}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={[styles.slide, { width, height }]}
            >
                <View style={styles.content}>
                <ThemedText style={styles.brand}>Clinic EZ</ThemedText>

                <View style={styles.iconArea}>
                    <ThemedText style={styles.icon}>{slide.icon}</ThemedText>
                </View>

                <View style={styles.copy}>
                    <ThemedText style={styles.title}>{slide.title}</ThemedText>
                    <ThemedText style={styles.tagline}>{slide.tagline}</ThemedText>
                    <ThemedText style={styles.subtitle}>{slide.subtitle}</ThemedText>
                </View>
                </View>
            </LinearGradient>
            ))}
        </ScrollView>

        <View style={styles.footer}>
            <View style={styles.pager}>
            {slides.map((_, index) => (
                <View
                key={index}
                style={[styles.dot, index === activeIndex && styles.dotActive]}
                />
            ))}
            </View>

            <Pressable
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={handleNext}
            >
            <ThemedText style={styles.ctaText}>
                {activeIndex === slides.length - 1 ? "Continue to Login" : "Next"}
            </ThemedText>
            </Pressable>
        </View>
        </View>
    );
    }

    const styles = StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: "#1a1a2e",
    },
    slide: {
        flex: 1,
    },
    content: {
        flex: 1,
        paddingHorizontal: 32,
        paddingTop: 80,
        paddingBottom: 180,
        justifyContent: "space-between",
    },
    brand: {
        fontSize: 13,
        letterSpacing: 2.4,
        textTransform: "uppercase",
        color: "rgba(255,255,255,0.55)",
        fontWeight: "600",
    },
    iconArea: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    icon: {
        fontSize: 96,
    },
    copy: {
        gap: 12,
    },
    title: {
        fontSize: 48,
        fontWeight: "800",
        color: "#FFFFFF",
        letterSpacing: -1,
        lineHeight: 54,
    },
    tagline: {
        fontSize: 18,
        fontWeight: "600",
        color: "rgba(255,255,255,0.90)",
        lineHeight: 26,
    },
    subtitle: {
        fontSize: 15,
        lineHeight: 24,
        color: "rgba(255,255,255,0.65)",
    },
    footer: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 28,
        paddingBottom: 44,
        paddingTop: 20,
    },
    pager: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        marginBottom: 20,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: "rgba(255,255,255,0.35)",
    },
    dotActive: {
        width: 28,
        borderRadius: 4,
        backgroundColor: "#FFFFFF",
    },
    cta: {
        backgroundColor: "#FFFFFF",
        borderRadius: 14,
        paddingVertical: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    ctaPressed: {
        opacity: 0.84,
    },
    ctaText: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111827",
    },
});
