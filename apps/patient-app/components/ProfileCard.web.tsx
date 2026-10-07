import React, { useState, useEffect, useCallback } from 'react';
import { View, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import ThemedText from './ui/ThemedText';
import { AppIcon } from './ui/Icon';
import { dialog } from '@utils/dialog';
import { useAppTheme } from '../contexts/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { db } from '@db/index';
import { patients } from '@db/schema/patients';
import { eq } from 'drizzle-orm';

export default function ProfileCardWeb() {
  const { colors, radii, shadows } = useAppTheme();
  const { user } = useUser();
  const { internalPatientId } = useAuth();
  const [patientRecord, setPatientRecord] = useState<{ firstName?: string | null; lastName?: string | null } | null>(null);

  useEffect(() => {
    if (!internalPatientId) return;
    db.query.patients.findFirst({
      where: eq(patients.id, internalPatientId),
    }).then((p) => {
      if (p) setPatientRecord({ firstName: p.firstName, lastName: p.lastName });
    }).catch(() => {});
  }, [internalPatientId]);

  // Locally cached URI — shown immediately before Clerk image loads
  const [localUri, setLocalUri] = useState<string | null>(null);
  // Temporary optimistic preview while uploading
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem('patient_avatar_local');
      if (cached) {
        setLocalUri(cached);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const avatarSource = previewUri ?? localUri ?? user?.imageUrl ?? null;

  const localDbName = [patientRecord?.firstName, patientRecord?.lastName].filter(Boolean).join(' ').trim();
  const displayName =
    localDbName ||
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    user?.emailAddresses[0]?.emailAddress ||
    'User';

  const initials = displayName
    .split(' ')
    .map((w: string) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const email = user?.emailAddresses[0]?.emailAddress ?? '';

  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [avatarSource]);

  const handlePickImage = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const pickedUri = asset.uri;

    // Immediate optimistic preview
    setPreviewUri(pickedUri);
    setUploading(true);

    try {
      // 1. Persist in localStorage for fast display next session
      try {
        window.localStorage.setItem('patient_avatar_local', pickedUri);
        setLocalUri(pickedUri);
      } catch {
        // Ignore quota errors
      }

      // 2. Upload to Clerk
      let fileToUpload: any = (asset as any).file;
      if (!fileToUpload) {
        const response = await fetch(pickedUri);
        fileToUpload = await response.blob();
      }

      await user?.setProfileImage({ file: fileToUpload });
      dialog.alert('Success', 'Your profile photo has been updated.', [{ text: 'OK' }]);

      // Clear temp preview — Clerk's imageUrl will update via useUser re-render
      setPreviewUri(null);
    } catch (err) {
      console.warn('Avatar upload failed:', err);
      dialog.alert(
        'Upload Failed',
        'Could not update photo with the server. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setUploading(false);
    }
  }, [user]);

  return (
    <View
      style={[
        styles.card,
        shadows.sm,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
        },
      ]}
    >
      {/* Avatar with camera overlay */}
      <Pressable
        onPress={handlePickImage}
        accessibilityLabel="Change profile photo"
        accessibilityRole="button"
        style={({ pressed, hovered }: any) => [
          styles.avatarWrapper,
          hovered && { opacity: 0.85 },
          pressed && { opacity: 0.7 },
        ]}
      >
        <View style={[styles.avatarContainer, { borderRadius: radii.full }]}>
          {avatarSource ? (
            <Image
              source={require('../assets/fallback_profile.jpg')}
              style={[styles.avatar, { backgroundColor: colors.border, borderRadius: radii.full }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary, borderRadius: radii.full }]}>
              <ThemedText variant="h2" style={{ color: colors.onPrimary }}>
                {initials}
              </ThemedText>
            </View>
          )}
          {avatarSource && !imageError && (
            <Image
              source={{ uri: avatarSource }}
              style={[styles.avatar, { position: 'absolute', top: 0, left: 0, borderRadius: radii.full }]}
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
              onError={() => setImageError(true)}
            />
          )}
          {imageLoading && (
            <View style={[StyleSheet.absoluteFill, styles.avatarLoader, { backgroundColor: colors.overlay }]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </View>

        {/* Camera overlay badge */}
        <View
          style={[
            styles.cameraBadge,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              borderRadius: radii.full,
            },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.badgeSpinner} />
          ) : (
            <AppIcon name="camera" size={12} color="text" />
          )}
        </View>
      </Pressable>

      {/* Info */}
      <View style={styles.info}>
        <ThemedText variant="title" numberOfLines={1}>
          {displayName}
        </ThemedText>
        {email ? (
          <ThemedText
            variant="body"
            color="textSecondary"
            numberOfLines={1}
            style={styles.email}
          >
            {email}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 28,
    gap: 14,
  },
  avatarWrapper: {
    position: 'relative',
    cursor: 'pointer',
  } as any,
  avatarContainer: {
    width: 58,
    height: 58,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarLoader: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 58,
    height: 58,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeSpinner: {
    transform: [{ scale: 0.6 }],
  },
  info: {
    flex: 1,
  },
  email: {
    marginTop: 2,
  },
});
