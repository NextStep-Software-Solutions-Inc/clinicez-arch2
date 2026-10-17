import React, { useState } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import ErrorState from '../ui/ErrorState';
import Button from '../ui/Button';
import { useAuth, usePermission } from '../../context/AuthContext';
import { PERMISSIONS } from '../../constants/permissions';
import { useAuditLogs } from '../../hooks/useAuditLogs';
import AuditFilterBar from './AuditFilterBar';
import AuditTable from './AuditTable';
import AuditInspectionDrawer from './AuditInspectionDrawer';
import AuditExportModal from './AuditExportModal';
import type { ClinicAuditEntryDto } from '../../services/clinicService';

export interface AuditWorkstationViewProps {
  embeddedInSettings?: boolean;
}

export function AuditWorkstationView({ embeddedInSettings = false }: AuditWorkstationViewProps) {
  const { user } = useAuth();
  const canRead = usePermission(PERMISSIONS.auditRead) || user?.role === 'Admin';
  const canExport = usePermission(PERMISSIONS.auditExport) || user?.role === 'Admin';

  const [selectedEntry, setSelectedEntry] = useState<ClinicAuditEntryDto | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);

  const {
    items,
    loading,
    refreshing,
    loadingEarlier,
    error,
    dateRangeError,
    totalCount,
    category,
    setCategory,
    severity,
    setSeverity,
    search,
    setSearch,
    datePreset,
    applyDatePreset,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    resetFilters,
    hasMore,
    pageNumber,
    hasPreviousPage,
    hasNextPage,
    goToNextPage,
    goToPreviousPage,
    loadEarlierStream,
    refresh,
    selectedDetail,
    loadingDetail,
    openDetail,
    closeDetail,
    isExporting,
    exportLogs,
  } = useAuditLogs({
    canRead,
  });

  if (!canRead) {
    return (
      <View style={styles.centerContainer}>
        <ErrorState
          title="Access Denied"
          message="You do not have administrative permission (audit:read) to view the clinic audit log."
        />
      </View>
    );
  }

  const handleInspect = (entry: ClinicAuditEntryDto) => {
    setSelectedEntry(entry);
    openDetail(entry);
  };

  const handleCloseDrawer = () => {
    setSelectedEntry(null);
    closeDetail();
  };

  return (
    <View style={[styles.root, embeddedInSettings && styles.rootEmbedded]}>
      {/* Workstation Header (when standalone) */}
      {!embeddedInSettings && (
        <View style={styles.header}>
          <View style={styles.headerTextGroup}>
            <ThemedText style={styles.headerTitle}>Audit Log & Forensic Trail</ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Exhaustive clinic-wide activity trail with privacy-preserving PHI redaction (DPA RA 10173 compliant)
            </ThemedText>
          </View>
          <View style={styles.headerActions}>
            <Button
              title="Refresh"
              variant="outline"
              size="sm"
              icon="refresh"
              loading={refreshing}
              onPress={refresh}
            />
            {canExport && (
              <Button
                title="Export Trail"
                variant="primary"
                size="sm"
                icon="download"
                loading={isExporting}
                onPress={() => setIsExportModalOpen(true)}
              />
            )}
          </View>
        </View>
      )}

      {/* Filter Controls Bar */}
      <AuditFilterBar
        selectedCategory={category}
        onSelectCategory={setCategory}
        search={search}
        onSearchChange={setSearch}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        severityFilter={severity}
        onSeverityFilterChange={setSeverity}
        datePreset={datePreset}
        onDatePresetChange={applyDatePreset}
        dateRangeError={dateRangeError}
        onResetFilters={resetFilters}
        onOpenExport={canExport ? () => setIsExportModalOpen(true) : undefined}
        isExporting={isExporting}
      />

      {/* API Error Alert */}
      {error && (
        <ErrorState
          title="Unable to load audit logs"
          message={error.message || 'The server returned an error while querying audit records.'}
          onRetry={refresh}
          retryLabel="Retry Query"
        />
      )}

      {/* Audit Log Table */}
      <AuditTable
        items={items}
        loading={loading}
        loadingEarlier={loadingEarlier}
        hasMore={hasMore}
        hasPreviousPage={hasPreviousPage}
        hasNextPage={hasNextPage}
        pageNumber={pageNumber}
        totalCount={totalCount}
        onInspect={handleInspect}
        onNextPage={goToNextPage}
        onPreviousPage={goToPreviousPage}
        onLoadEarlier={loadEarlierStream}
        onResetFilters={resetFilters}
        filterSummary={search || (category !== 'All' ? category : '')}
      />

      {/* Persistent Desktop Slide-Over Drawer / Mobile Modal */}
      <AuditInspectionDrawer
        entry={selectedEntry}
        detail={selectedDetail}
        loadingDetail={loadingDetail}
        onClose={handleCloseDrawer}
      />

      {/* Export Dialog Modal */}
      {canExport && (
        <AuditExportModal
          visible={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          onExport={exportLogs}
          isExporting={isExporting}
          activeCategory={category}
          activeSeverity={severity}
          activeSearch={search}
          startDate={startDate}
          endDate={endDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
    backgroundColor: theme.colors.background,
  },
  rootEmbedded: {
    padding: 0,
    backgroundColor: theme.colors.transparent,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  headerTextGroup: {
    gap: theme.spacing.xs,
  },
  headerTitle: {
    color: theme.colors.text,
    ...theme.typography.h1,
  },
  headerSubtitle: {
    color: theme.colors.textSecondary,
    ...theme.typography.body,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
});
export default AuditWorkstationView;
