import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Badge, { BadgeVariant } from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon from '../ui/Icon';
import { theme } from '../../constants/theme';
import { FacilityLicenseStatus } from '../../services/clinicService';
import { InfoRow } from './common';

const LICENSE_STATUS: Record<string, { label: string; variant: BadgeVariant }> = {
  Active: { label: 'Active', variant: 'success' },
  ActivationRequired: { label: 'Activation required', variant: 'warning' },
  Expired: { label: 'Expired', variant: 'emergency' },
  Tampered: { label: 'Verification failed', variant: 'emergency' },
};

interface LicenseSystemTabProps {
  license: FacilityLicenseStatus | null;
  clinicName: string;
  activeStaffCount: number;
  maxStaffSeats: number | null;
  onOpenActivationModal: () => void;
  onRefreshLicense: () => Promise<void>;
}

export default function LicenseSystemTab({
  license,
  clinicName,
  activeStaffCount,
  maxStaffSeats,
  onOpenActivationModal,
  onRefreshLicense,
}: LicenseSystemTabProps) {
  const licenseStatus = license
    ? LICENSE_STATUS[license.status] ?? { label: license.status, variant: 'neutral' as BadgeVariant }
    : null;

  return (
    <View style={styles.container}>
      {/* License Overview */}
      <Card>
        <CardHeader
          title="Facility Cryptographic License"
          subtitle="Offline-verifiable license parameters, operational limits, and feature authorizations"
          rightAction={
            <Button
              title="Update license key"
              icon="key"
              variant="outline"
              size="sm"
              onPress={onOpenActivationModal}
            />
          }
        />
        <CardContent>
          {license ? (
            <View style={styles.licenseDetails}>
              <View style={styles.badgeRow}>
                <Badge label={`${license.planTier} Plan`} variant="primary" size="md" />
                {licenseStatus ? (
                  <Badge label={licenseStatus.label} variant={licenseStatus.variant} size="md" />
                ) : null}
                {license.limits?.isOfflineCapable ? (
                  <Badge label="Air-Gapped / Offline Ready" variant="success" size="md" />
                ) : null}
              </View>

              <View style={styles.rows}>
                <InfoRow
                  label="Licensed Facility"
                  value={license.clinicName || clinicName || 'Not configured'}
                />
                <InfoRow
                  label="Staff Seat Allocation"
                  value={
                    maxStaffSeats != null
                      ? `${activeStaffCount} of ${maxStaffSeats} seats occupied`
                      : `${activeStaffCount} active staff`
                  }
                  valueColor={
                    maxStaffSeats != null && activeStaffCount >= maxStaffSeats
                      ? theme.colors.emergencyText
                      : theme.colors.primary
                  }
                />
                {license.limits?.maxDailyEncounters != null && (
                  <InfoRow
                    label="Daily Patient Consultations"
                    value={
                      license.limits.maxDailyEncounters >= 2147483647
                        ? 'Unlimited'
                        : `${license.limits.maxDailyEncounters} visits/day`
                    }
                  />
                )}
                <InfoRow
                  label="Offline Operational Grace"
                  value={
                    license.limits?.isOfflineCapable
                      ? '72 Hours Offline Sync Window'
                      : 'Requires continuous connectivity'
                  }
                  valueColor={license.limits?.isOfflineCapable ? theme.colors.successText : undefined}
                />
                {license.expiresAtUtc ? (
                  <InfoRow
                    label="License Expiration"
                    value={new Date(license.expiresAtUtc).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  />
                ) : (
                  <InfoRow label="License Validity" value="Perpetual" />
                )}
              </View>
            </View>
          ) : (
            <EmptyState
              icon="key"
              title="No Facility License Found"
              description="Activate this installation with your issued clinic license key to unlock medical features."
              actionTitle="Enter License Key"
              onAction={onOpenActivationModal}
            />
          )}
        </CardContent>
      </Card>

      {/* System Integrity & Diagnostics */}
      <Card>
        <CardHeader
          title="System Architecture & Synchronization"
          subtitle="Local edge database and mesh node synchronization details"
        />
        <CardContent>
          <View style={styles.rows}>
            <InfoRow label="Deployment Architecture" value="Local-First Hybrid Edge (Air-Gapped Capable)" />
            <InfoRow label="Database Engine" value="PostgreSQL 16 + Local Embedded Cache" />
            <InfoRow label="Security Enclave" value="PBKDF2 SHA-256 + Ed25519 Cryptographic Signatures" />
            <InfoRow label="DOH / PhilHealth Standards" value="Yakap Teleconsult & ePrescription Compliant" />
          </View>
        </CardContent>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  licenseDetails: {
    gap: theme.spacing.md,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  rows: {
    gap: theme.spacing.xs,
  },
});
