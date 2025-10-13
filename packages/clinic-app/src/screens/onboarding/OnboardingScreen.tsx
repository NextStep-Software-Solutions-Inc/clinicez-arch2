import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Easing, Image, Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { useColorScheme } from "nativewind";
import { useAuth, useUser } from "@clerk/clerk-expo";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ThemedButton from "@components/ThemedButton";
import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import ThemedView from "@components/ThemedView";
import DatePicker from "@components/DatePicker";
import { submitScheduleAvailability } from "@actions/onboarding";
import { cn } from "@lib/utils";
import { getThemeColor } from "@theme/colors";
import { markOnboardingAsComplete } from "@utils/onboarding-status";
import ClinicEZLogo from "@images/clinicez-logo-v2.png";
import CharacterWelcome from "@images/clinicez-character-welcome.png";
import CharacterSnake from "@images/clinicez-character-snake.png";
import CharacterCalendar from "@images/clinicez-character-calendar.png";
import CharacterWink from "@images/clinicez-character-wink.png";


const STEPS = ["Welcome", "UploadProfile", "SetSchedule", "AllSet"] as const;
type OnboardingStep = typeof STEPS[number];

const WEEK_DAYS = ["M", "T", "W", "Th", "F", "Sa", "Su"] as const;
type Weekday = typeof WEEK_DAYS[number];

const createTime = (hours: number, minutes: number) => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date;
};

const formatTo24Hour = (date: Date) => {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
};

const STEP_CONTENT: Record<Exclude<OnboardingStep, "AllSet">, { title: string; description: string }> = {
  Welcome: {
    title: "Welcome to ClinicEZ",
    description: "Let's setup your Clinic Staff Account",
  },
  UploadProfile: {
    title: "Upload Profile",
    description: "Add photo to help patients and staff recognize you",
  },
  SetSchedule: {
    title: "Set Schedule",
    description: "Set your weekly availability and preferred consultation hours",
  },
};

const FINAL_STEP_COPY = {
  title: "You're All Set",
  description: "You can now start managing patients and appointments",
};

const CHARACTER_IMAGES: Record<OnboardingStep, ReturnType<typeof require>> = {
  Welcome: CharacterWelcome,
  UploadProfile: CharacterSnake,
  SetSchedule: CharacterCalendar,
  AllSet: CharacterWink,
};

const OnboardingScreen: React.FC = () => {
  const router = useRouter();
  const { colorScheme } = useColorScheme();
  const { user, isLoaded } = useUser();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const insets = useSafeAreaInsets();

  const backgroundColor = useMemo(
    () => getThemeColor("backgroundDark", colorScheme === "dark" ? "dark" : "light"),
    [colorScheme]
  );
  const containerPadding = useMemo(
    () => ({
      paddingTop: Math.max(insets.top, 32),
      paddingBottom: Math.max(insets.bottom, 32),
    }),
    [insets.bottom, insets.top]
  );

  useEffect(() => {
    if (authLoaded && !isSignedIn) {
      router.replace("/(auth)/sign-in");
    }
  }, [authLoaded, isSignedIn, router]);

  if (!authLoaded || !isLoaded) {
    return null;
  }

  const [currentIndex, setCurrentIndex] = useState(0);
  const [transitionDirection, setTransitionDirection] = useState<1 | -1>(1);
  const currentStep = STEPS[currentIndex];

  const [profileImageUri, setProfileImageUri] = useState<string | null>(null);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [selectedDays, setSelectedDays] = useState<Set<Weekday>>(
    () => new Set(WEEK_DAYS.slice(0, 5))
  );
  const [startTime, setStartTime] = useState<Date>(() => createTime(9, 0));
  const [endTime, setEndTime] = useState<Date>(() => createTime(17, 0));
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [completingOnboarding, setCompletingOnboarding] = useState(false);
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateX = useRef(new Animated.Value(0)).current;
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (user?.imageUrl) {
      setProfileImageUri(user.imageUrl);
    }
  }, [user?.imageUrl]);

  const primaryColor = useMemo(
    () => getThemeColor("primary", colorScheme === "dark" ? "dark" : "light"),
    [colorScheme]
  );
  const mutedDotColor = useMemo(
    () => getThemeColor("mutedForeground", colorScheme === "dark" ? "dark" : "light"),
    [colorScheme]
  );

  const goToStep = useCallback((index: number) => {
    setCurrentIndex((previousIndex) => {
      const clampedIndex = Math.min(Math.max(index, 0), STEPS.length - 1);

      if (clampedIndex === previousIndex) {
        return previousIndex;
      }

      setTransitionDirection(clampedIndex > previousIndex ? 1 : -1);
      return clampedIndex;
    });
  }, []);

  const goToNext = useCallback(() => {
    goToStep(currentIndex + 1);
  }, [currentIndex, goToStep]);

  const goToPrevious = useCallback(() => {
    goToStep(currentIndex - 1);
  }, [currentIndex, goToStep]);

  const handleSkipProfile = useCallback(() => {
    goToStep(2);
  }, [goToStep]);

  const toggleDay = useCallback((day: Weekday) => {
    setSelectedDays(prev => {
      const next = new Set(prev);
      if (next.has(day)) {
        next.delete(day);
      } else {
        next.add(day);
      }
      return next;
    });
  }, []);

  const pickProfileImage = useCallback(async () => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          "Permission needed",
          "Please allow photo access to upload your profile picture."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const asset = result.assets[0];
      setProfileImageUri(asset.uri);

      if (!user) {
        return;
      }

      setUploadingProfileImage(true);
      const response = await fetch(asset.uri);
      const blob = await response.blob();

      await user.setProfileImage({ file: blob });
    } catch (error) {
      console.error("Profile upload failed", error);
      Alert.alert(
        "Upload failed",
        "Something went wrong while uploading your profile picture. Please try again."
      );
    } finally {
      setUploadingProfileImage(false);
    }
  }, [user]);

  const handleScheduleNext = useCallback(async () => {
    if (savingSchedule) {
      return;
    }

    const orderedDays = WEEK_DAYS.filter((day) => selectedDays.has(day));
    if (!orderedDays.length) {
      Alert.alert("Select availability", "Choose at least one day you are available.");
      return;
    }

    if (startTime.getTime() >= endTime.getTime()) {
      Alert.alert(
        "Adjust consultation hours",
        "End time must be later than the start time."
      );
      return;
    }

    try {
      setSavingSchedule(true);
      await submitScheduleAvailability({
        days: orderedDays,
        startTime: formatTo24Hour(startTime),
        endTime: formatTo24Hour(endTime),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      goToNext();
    } catch (error) {
      console.error("Failed to persist schedule", error);
      Alert.alert(
        "Unable to save schedule",
        "Something went wrong while storing your availability. Please try again."
      );
    } finally {
      setSavingSchedule(false);
    }
  }, [savingSchedule, selectedDays, startTime, endTime, goToNext]);

  const handleCompleteOnboarding = useCallback(async () => {
    if (completingOnboarding) {
      return;
    }

    try {
      setCompletingOnboarding(true);
      await markOnboardingAsComplete();
      router.replace("/(main)/(tabs)");
    } catch (error) {
      console.error("Failed to finish onboarding", error);
      Alert.alert(
        "Unable to finish onboarding",
        "Please try again in a moment."
      );
    } finally {
      setCompletingOnboarding(false);
    }
  }, [completingOnboarding, router]);

  const renderIndicators = useMemo(() => {
    const showIndicators = currentStep !== "AllSet";

    return (
      <View className="items-center space-y-6">
        <Image source={ClinicEZLogo} className="h-16 w-48" resizeMode="contain" />
        {showIndicators && (
          <View className="flex-row justify-center items-center">
            {STEPS.map((step, index) => {
              const isActive = index === currentIndex;
              const size = isActive ? 12 : 8;

              return (
                <View
                  key={step}
                  style={{
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: isActive ? primaryColor : "transparent",
                    borderWidth: isActive ? 0 : 1.5,
                    borderColor: isActive ? primaryColor : mutedDotColor,
                    marginHorizontal: 4,
                  }}
                />
              );
            })}
          </View>
        )}
      </View>
    );
  }, [currentIndex, currentStep, mutedDotColor, primaryColor]);

  const renderDaySelector = () => (
    <View className="mt-6">
      <View className="flex-row items-center mb-3">
        <ThemedIcon icon="calendar-days" size="md" color="primary" className="mr-2" />
        <ThemedText variant="label" className="font-semibold">
          Days
        </ThemedText>
      </View>
      <View className="flex-row flex-wrap gap-2">
        {WEEK_DAYS.map((day) => {
          const isSelected = selectedDays.has(day);
          return (
            <Pressable
              key={day}
              onPress={() => toggleDay(day)}
              className={cn(
                "px-4 py-2 rounded-full border",
                isSelected
                  ? "bg-primary dark:bg-primary-dark border-primary dark:border-primary-dark"
                  : "bg-surface dark:bg-surface-dark border-border dark:border-border-dark"
              )}
            >
              <ThemedText
                variant="button"
                className={isSelected ? "text-primary-foreground dark:text-primary-foreground" : "text-text dark:text-text-dark"}
              >
                {day}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const renderTimeSelector = () => (
    <View className="mt-6">
      <View className="flex-row items-center mb-3">
        <ThemedIcon icon="clock" size="md" color="primary" className="mr-2" />
        <ThemedText variant="label" className="font-semibold">
          Time
        </ThemedText>
      </View>
      <View className="flex-row gap-4">
        <View className="flex-1">
          <ThemedText variant="caption" className="mb-2 text-muted dark:text-muted-dark">
            Start
          </ThemedText>
          <DatePicker
            value={startTime}
            onChange={setStartTime}
            placeholder="Start"
            variant="outlined"
            size="md"
            mode="time"
          />
        </View>
        <View className="flex-1">
          <ThemedText variant="caption" className="mb-2 text-muted dark:text-muted-dark">
            End
          </ThemedText>
          <DatePicker
            value={endTime}
            onChange={setEndTime}
            placeholder="End"
            variant="outlined"
            size="md"
            mode="time"
          />
        </View>
      </View>
    </View>
  );

  const renderStepCopy = () => {
    if (currentStep === "AllSet") {
      return (
        <View className="items-center space-y-5">
          <ThemedText variant="header" className="text-center">
            {FINAL_STEP_COPY.title}
          </ThemedText>
          <ThemedText variant="body" className="text-center text-muted dark:text-muted-dark">
            {FINAL_STEP_COPY.description}
          </ThemedText>
        </View>
      );
    }

    const { title, description } = STEP_CONTENT[currentStep as Exclude<OnboardingStep, "AllSet">];

    return (
      <View className="items-center space-y-5">
        <ThemedText variant="header" className="text-center">
          {title}
        </ThemedText>
        <ThemedText variant="body" className="text-center text-muted dark:text-muted-dark">
          {description}
        </ThemedText>
      </View>
    );
  };

  const renderCharacterSection = () => {
    switch (currentStep) {
      case "Welcome":
        return (
          <View className="items-center">
            <Image
              source={CHARACTER_IMAGES.Welcome}
              className="w-72 h-72"
              resizeMode="contain"
            />
          </View>
        );
      case "UploadProfile":
        return (
          <View className="items-center">
            <View className="w-44 h-44 rounded-full border-4 border-primary/70 dark:border-primary-dark/70 bg-background dark:bg-background-dark items-center justify-center overflow-hidden">
              {profileImageUri ? (
                <Image source={{ uri: profileImageUri }} className="w-full h-full" resizeMode="cover" />
              ) : (
                <Image
                  source={CHARACTER_IMAGES.UploadProfile}
                  className="w-full h-full"
                  resizeMode="cover"
                  style={{ transform: [{ scale: 1.25 }] }}
                />
              )}
              {uploadingProfileImage && (
                <View className="absolute inset-0 bg-background-dark/40 dark:bg-background-dark/40 items-center justify-center">
                  <ActivityIndicator color={getThemeColor("primaryForeground", "light")} />
                </View>
              )}
            </View>
            <ThemedButton
              variant="default"
              size="lg"
              className="w-44 mt-6"
              onPress={pickProfileImage}
              disabled={uploadingProfileImage || !isLoaded}
              loading={uploadingProfileImage}
            >
              Upload
            </ThemedButton>
          </View>
        );
      case "SetSchedule":
        return (
          <View className="items-center">
            <Image
              source={CHARACTER_IMAGES.SetSchedule}
              className="w-64 h-64"
              resizeMode="contain"
            />
            <View className="w-full mt-8 rounded-2xl border border-border dark:border-border-dark bg-background/80 dark:bg-background-dark/60 p-4">
              {renderDaySelector()}
              {renderTimeSelector()}
            </View>
          </View>
        );
      case "AllSet":
        return (
          <View className="items-center">
            <Image
              source={CHARACTER_IMAGES.AllSet}
              className="w-64 h-64"
              resizeMode="contain"
            />
          </View>
        );
      default:
        return null;
    }
  };

  const renderNavigation = () => {
    switch (currentStep) {
      case "Welcome":
        return (
          <ThemedButton variant="default" size="lg" className="w-full" onPress={goToNext}>
            Next
          </ThemedButton>
        );
      case "UploadProfile":
        return (
          <View className="flex-row gap-4">
            <ThemedButton variant="outline" size="lg" className="flex-1" onPress={goToPrevious}>
              Prev
            </ThemedButton>
            <ThemedButton
              variant="default"
              size="lg"
              className="flex-1"
              onPress={handleSkipProfile}
              disabled={uploadingProfileImage}
            >
              Skip
            </ThemedButton>
          </View>
        );
      case "SetSchedule":
        return (
          <View className="flex-row gap-4">
            <ThemedButton variant="outline" size="lg" className="flex-1" onPress={goToPrevious}>
              Prev
            </ThemedButton>
            <ThemedButton
              variant="default"
              size="lg"
              className="flex-1"
              onPress={handleScheduleNext}
              loading={savingSchedule}
              disabled={savingSchedule}
            >
              Next
            </ThemedButton>
          </View>
        );
      case "AllSet":
        return (
          <ThemedButton
            variant="default"
            size="lg"
            className="w-full"
            onPress={handleCompleteOnboarding}
            loading={completingOnboarding}
            disabled={completingOnboarding}
          >
            Get Started
          </ThemedButton>
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    contentOpacity.setValue(0);

    if (isFirstRender.current) {
      contentTranslateX.setValue(0);
      isFirstRender.current = false;
    } else {
      contentTranslateX.setValue(transitionDirection * 40);
    }

    Animated.parallel([
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(contentTranslateX, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [contentOpacity, contentTranslateX, currentStep, transitionDirection]);

  return (
    <View style={[{ flex: 1, backgroundColor }, containerPadding]}>
      <ThemedView variant="transparent" className="flex-1 px-6">
        <View className="flex-1 w-full items-center justify-center">
          <Animated.View
            key={currentStep}
            className="w-full max-w-xl items-center justify-center"
            style={{
              opacity: contentOpacity,
              transform: [{ translateX: contentTranslateX }],
            }}
          >
            <View className="w-full items-center mb-12">{renderIndicators}</View>
            <View className="w-full items-center mb-12 px-4">{renderStepCopy()}</View>
            <View className="w-full items-center">{renderCharacterSection()}</View>
          </Animated.View>
        </View>

        <View className="w-full mt-12">
          {renderNavigation()}
        </View>
      </ThemedView>
    </View>
  );
};

OnboardingScreen.displayName = "OnboardingScreen";

export default OnboardingScreen;
