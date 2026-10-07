import React, { useState, useEffect, useCallback } from 'react';
import { View, Image, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import ThemedText from './ui/ThemedText';
import { AppIcon } from './ui/Icon';
import { dialog } from '@utils/dialog';

export default function ProfileCard() {
  const { colors } = useTheme();
  const { user } = useUser();

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

  const displayName =
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
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Avatar with camera overlay */}
      <Pressable
        onPress={handlePickImage}
        accessibilityLabel="Change profile photo"
        accessibilityRole="button"
        style={styles.avatarWrapper}
      >
        <View style={styles.avatarContainer}>
          {avatarSource ? (
            <Image
              source={require('../assets/fallback_profile.jpg')}
              style={[styles.avatar, { backgroundColor: colors.border }]}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <ThemedText style={styles.initials}>{initials}</ThemedText>
            </View>
          )}
          {avatarSource && !imageError && (
            <Image
              source={{ uri: avatarSource }}
              style={[styles.avatar, { position: 'absolute', top: 0, left: 0 }]}
              onLoadStart={() => setImageLoading(true)}
              onLoadEnd={() => setImageLoading(false)}
              onError={() => setImageError(true)}
            />
          )}
          {imageLoading && (
            <View style={[StyleSheet.absoluteFill, styles.avatarLoader]}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          )}
        </View>

        {/* Camera overlay badge */}
        <View
          style={[
            styles.cameraBadge,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.primary} style={styles.badgeSpinner} />
          ) : (
            <AppIcon name="camera" size={12} color={colors.text as string} />
          )}
        </View>
      </Pressable>

      {/* Info */}
      <View style={styles.info}>
        <ThemedText style={styles.name} numberOfLines={1}>
          {displayName}
        </ThemedText>
        {email ? (
          <ThemedText style={[styles.email, { color: colors.text, opacity: 0.65 }]} numberOfLines={1}>
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
    borderRadius: 14,
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
    borderRadius: 29,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarLoader: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.4)',
  },
  avatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
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
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
  email: {
    fontSize: 14,
    marginTop: 2,
  },
});
