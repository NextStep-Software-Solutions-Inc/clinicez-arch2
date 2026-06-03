import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Image,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { useTheme } from '@react-navigation/native';
import { useUser } from '@clerk/expo';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { MaterialSymbol, SFSymbol } from '@react-navigation/native';
import ThemedText from './ui/ThemedText';

const avatarFile = new File(Paths.document, 'profile_avatar.jpg');
export default function ProfileCard() {
  const { colors } = useTheme();
  const { user } = useUser();

  // Locally cached URI — shown immediately on next launch before Clerk image loads
  const [localUri, setLocalUri] = useState<string | null>(null);
  // Temporary optimistic preview while uploading
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Hydrate local cache on mount
  useEffect(() => {
    (async () => {
      const info = avatarFile.info();
      if (info.exists) {
        setLocalUri(avatarFile.uri + '?t=' + info.modificationTime);
      }
    })();
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

  const handlePickImage = useCallback(async () => {
    // Request permission
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please allow access to your photo library to change your profile photo.',
        [{ text: 'OK' }],
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.75,
    });

    if (result.canceled || !result.assets?.[0]) return;

    const pickedUri = result.assets[0].uri;

    // Immediate optimistic preview
    setPreviewUri(pickedUri);
    setUploading(true);

    try {
      // 1. Persist locally for fast loading on next launch
      avatarFile.exists && avatarFile.delete();
      await new File(pickedUri).copy(avatarFile);
      const info = avatarFile.info();
      setLocalUri(avatarFile.uri + '?t=' + (info.exists ? info.modificationTime : Date.now()));

      // 2. Upload to Clerk
      await user?.setProfileImage({ file: avatarFile });
      Alert.alert('Success', 'Your profile photo has been updated.', [{ text: 'OK' }]);

      // Clear temp preview — Clerk's imageUrl will update via useUser re-render
      setPreviewUri(null);
    } catch (err) {
      console.warn('Avatar upload failed:', err);
      Alert.alert(
        'Upload Failed',
        'Your photo was saved locally but could not be uploaded. It will retry on your next update.',
        [{ text: 'OK' }],
      );
      // Keep local preview visible (previewUri stays set)
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
        {avatarSource ? (
          <Image
            source={{ uri: avatarSource }}
            style={[styles.avatar, { backgroundColor: colors.border }]}
          />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <ThemedText style={styles.initials}>{initials}</ThemedText>
          </View>
        )}

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
            Platform.select({
              android: <MaterialSymbol name={'photo_camera' as any} size={12} color={colors.text as string} />,
              ios: <SFSymbol name={'camera.fill' as any} size={10} color={colors.text as string} />,
            })
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
