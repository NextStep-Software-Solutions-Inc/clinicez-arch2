import React from 'react';
import { View, StyleSheet } from 'react-native';
import ThemedText from '../ui/ThemedText';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Icon from '../ui/Icon';
import PhilHealthCatalogSection from './PhilHealthCatalogSection';
import { theme } from '../../constants/theme';
import { InfoRow } from './common';

interface PhilHealthSettingsTabProps {
  accreditationNumber: string;
  clinicName: string;
}

export default function PhilHealthSettingsTab({
  accreditationNumber,
  clinicName,
}: PhilHealthSettingsTabProps) {
  const isAccredited = Boolean(accreditationNumber?.trim());

  return (
    <View style={styles.container}>
      {/* PhilHealth Facility Accreditation Overview */}
      <Card>
        <CardHeader
          title="PhilHealth Konsulta & eClaims Accreditation"
          subtitle="Accreditation credentials and eClaims electronic submission status"
        />
        <CardContent>
          <View style={styles.statusRow}>
            <View style={styles.statusInfo}>
              <View style={styles.titleWithBadge}>
                <ThemedText variant="bodyBold">Accreditation Status</ThemedText>
                <Badge
                  label={isAccredited ? 'Accredited HCI' : 'Accreditation Required'}
                  variant={isAccredited ? 'success' : 'warning'}
                  size="md"
                />
              </View>
              <ThemedText variant="caption" color={theme.colors.textMuted}>
                {isAccredited
                  ? 'This facility is registered with PhilHealth for Konsulta package reimbursement and primary care claim filing.'
                  : 'Enter your DOH/PhilHealth accreditation number in General Settings to enable Konsulta benefit tracking.'}
              </ThemedText>
            </View>
          </View>

          <View style={styles.detailsList}>
            <InfoRow
              label="Accredited Facility Name"
              value={clinicName || 'Not configured'}
            />
            <InfoRow
              label="PhilHealth Accreditation No."
              value={accreditationNumber || 'Not set'}
              valueColor={isAccredited ? theme.colors.primary : theme.colors.textMuted}
            />
            <InfoRow
              label="Konsulta Benefit Package"
              value={isAccredited ? 'Active' : 'Pending Accreditation'}
              valueColor={isAccredited ? theme.colors.successText : theme.colors.warningText}
            />
            <InfoRow
              label="Electronic Claims Engine"
              value="Clinic EZ Yakap eClaims v2.4 (Compliant)"
            />
          </View>
        </CardContent>
      </Card>

      {/* Official PhilHealth Master Catalog & Release Kits */}
      <PhilHealthCatalogSection />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.md,
    borderBottomWidth: theme.sizes.borderWidth,
    borderBottomColor: theme.colors.border,
  },
  statusInfo: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  titleWithBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  detailsList: {
    gap: theme.spacing.xs,
    paddingTop: theme.spacing.md,
  },
});
