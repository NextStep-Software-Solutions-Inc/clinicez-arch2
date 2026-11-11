import React, { useState } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import ThemedText from '../../ui/ThemedText';
import Button from '../../ui/Button';
import Badge from '../../ui/Badge';
import Icon from '../../ui/Icon';
import { Card, CardContent, CardHeader } from '../../ui/Card';
import Skeleton, { SkeletonList } from '../../ui/Skeleton';
import { theme } from '../../../constants/theme';
import { useClinic } from '../../../context/ClinicContext';
import { pickClinicLogo } from '../../../utils/logoUploader';
import { Alert, notify } from '../../../utils/feedback';
import LogoCropModal from '../LogoCropModal';

export interface ClinicLogoSpecimenCardProps {
  clinicName: string;
  showSkeletons?: boolean;
}

export default function ClinicLogoSpecimenCard({
  clinicName,
  showSkeletons = false,
}: ClinicLogoSpecimenCardProps) {
  const { clinicLogo, setClinicLogo, loading: clinicLoading, facilityName } = useClinic();
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [cropModalVisible, setCropModalVisible] = useState(false);
  const [pendingLogoUri, setPendingLogoUri] = useState<string | null>(null);

  const handlePickLogo = async () => {
    setUploadingLogo(true);
    try {
      const res = await pickClinicLogo();
      if (!res) {
        setUploadingLogo(false);
        return;
      }
      if (res.error) {
        Alert.alert('Logo upload failed', res.error);
        setUploadingLogo(false);
        return;
      }
      if (res.dataUri) {
        setPendingLogoUri(res.dataUri);
        setCropModalVisible(true);
      }
    } catch (err: any) {
      Alert.alert('Upload error', err?.message || 'Failed to select image.');
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleConfirmCroppedLogo = async (croppedUri: string) => {
    setCropModalVisible(false);
    setUploadingLogo(true);
    try {
      const success = await setClinicLogo(croppedUri);
      if (success) {
        notify.success('Clinic logo updated and saved to database.');
      } else {
        Alert.alert('Logo saved locally', 'Logo updated on device, but could not sync to server database.');
      }
    } catch (err: any) {
      Alert.alert('Save error', err?.message || 'Failed to save logo.');
    } finally {
      setUploadingLogo(false);
      setPendingLogoUri(null);
    }
  };

  const handleRemoveLogo = async () => {
    Alert.alert(
      'Remove clinic logo',
      'Are you sure you want to remove the custom clinic logo and revert to the default icon?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setUploadingLogo(true);
            try {
              await setClinicLogo(null);
              notify.success('Clinic logo removed.');
            } finally {
              setUploadingLogo(false);
            }
          },
        },
      ]
    );
  };

  const isLoading = Boolean(showSkeletons || (clinicLoading && !clinicName.trim()));
  const resolvedFacilityName = clinicName.trim() || facilityName.trim() || 'No clinic name set';

  return (
    <>
      <Card style={styles.card} testID="clinic-logo-specimen-card">
        <CardHeader
          title="Clinic Logo"
          subtitle="Shown in your clinic menu, headers, and printed prescriptions or receipts"
          rightAction={
            isLoading ? (
              <Skeleton width={96} height={22} />
            ) : (
              <Badge
                label={clinicLogo ? 'Custom Logo Active' : 'Default Logo'}
                variant={clinicLogo ? 'success' : 'neutral'}
                size="sm"
              />
            )
          }
        />
        <CardContent>
          {isLoading ? (
            <SkeletonList rows={3} />
          ) : (
            <View style={styles.splitRow}>
              {/* Left Live Logo Preview */}
              <View style={styles.specimenPane}>
                <View style={styles.specimenStage}>
                  <View style={styles.logoFrame}>
                    {clinicLogo ? (
                      <Image
                        source={{ uri: clinicLogo }}
                        style={styles.logoImage}
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        <Icon name="clinic" size={theme.sizes.iconLg} color={theme.colors.primary} />
                      </View>
                    )}
                  </View>
                  <View style={styles.specimenHeaderMock}>
                    <ThemedText variant="smallBold" color={theme.colors.text} numberOfLines={1}>
                      {resolvedFacilityName}
                    </ThemedText>
                    <ThemedText variant="caption" color={theme.colors.textMuted} numberOfLines={1}>
                      Prescription &amp; Receipt Header
                    </ThemedText>
                  </View>
                </View>
              </View>

              {/* Right Controls */}
              <View style={styles.controlsPane}>
                <ThemedText variant="bodyBold" color={theme.colors.text}>
                  {clinicLogo ? 'Current Clinic Logo' : 'Upload Clinic Logo'}
                </ThemedText>
                <ThemedText variant="caption" color={theme.colors.textSecondary} style={styles.helperCopy}>
                  {clinicLogo
                    ? 'Saved for your clinic across all computers and tablets. Supported formats: PNG, JPEG, SVG, WebP (up to 2MB).'
                    : 'No custom logo uploaded yet. Upload a square or transparent PNG or SVG image (up to 2MB) to appear on prescriptions and receipts.'}
                </ThemedText>

                <View style={styles.actionsRow}>
                  <Button
                    title={clinicLogo ? 'Change logo' : 'Upload logo'}
                    icon="upload"
                    onPress={handlePickLogo}
                    loading={uploadingLogo}
                    size="sm"
                  />
                  {clinicLogo ? (
                    <Button
                      title="Remove"
                      variant="outline"
                      icon="trash"
                      onPress={handleRemoveLogo}
                      disabled={uploadingLogo}
                      size="sm"
                    />
                  ) : null}
                </View>
              </View>
            </View>
          )}
        </CardContent>
      </Card>

      <LogoCropModal
        visible={cropModalVisible}
        imageUri={pendingLogoUri}
        onClose={() => {
          setCropModalVisible(false);
          setPendingLogoUri(null);
        }}
        onConfirm={handleConfirmCroppedLogo}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minWidth: 0,
    alignSelf: 'stretch',
  },
  splitRow: {
    width: '100%',
    minWidth: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.xl,
    alignItems: 'center',
  },
  specimenPane: {
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 280,
    minWidth: 0,
    maxWidth: '100%',
  },
  specimenStage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: theme.radii.lg,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSubtle,
  },
  logoFrame: {
    width: 64,
    height: 64,
    borderRadius: theme.radii.md,
    borderWidth: theme.sizes.borderWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  logoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primaryLight,
  },
  specimenHeaderMock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  controlsPane: {
    flex: 1,
    flexBasis: 260,
    minWidth: 0,
    gap: theme.spacing.xs,
  },
  helperCopy: {
    lineHeight: 18,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
