import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  RefreshControl,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { theme } from '../../constants/theme';
import ThemedText from '../ui/ThemedText';
import ErrorState from '../ui/ErrorState';
import Button from '../ui/Button';
import { useAuth, usePermission } from '../../context/AuthContext';
import { useClinic } from '../../context/ClinicContext';
import { PERMISSIONS } from '../../constants/permissions';
import { useAuditLogs } from '../../hooks/useAuditLogs';
import { usePersistedTab } from '../../hooks/usePersistedTab';
import AuditFilterBar from './AuditFilterBar';
import AuditTable from './AuditTable';
import AuditInspectionDrawer from './AuditInspectionDrawer';
import AuditExportModal from './AuditExportModal';
import AuditFilterMoreSheet from './AuditFilterMoreSheet';
import DateRangePickerModal from '../ui/DateRangePickerModal';
import type { ClinicAuditEntryDto, AuditDatePreset } from '../../services/clinicService';

export interface AuditWorkstationViewProps {
  embeddedInSettings?: boolean;
  navigation?: any;
}

export function AuditWorkstationView({
  embeddedInSettings = false,
  navigation,
}: AuditWorkstationViewProps) {
  const { user } = useAuth();
  const { dateFormat, timeFormat, timeZoneId } = useClinic();
  const canRead = usePermission(PERMISSIONS.auditRead) || user?.role === 'Admin';
  const canExport = usePermission(PERMISSIONS.auditExport) || user?.role === 'Admin';

  const [selectedEntry, setSelectedEntry] = useState<ClinicAuditEntryDto | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isDateRangeModalOpen, setIsDateRangeModalOpen] = useState<boolean>(false);
  const [isMoreFiltersSheetOpen, setIsMoreFiltersSheetOpen] = useState<boolean>(false);

  // Virtualization & scroll tracking state
  const [scrollY, setScrollY] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(800);
  const [listTopOffset, setListTopOffset] = useState(0);
  const lastScrollYRef = useRef(0);
  const viewportHeightRef = useRef(800);
  const scrollViewRef = useRef<ScrollView>(null);

  // Unified Persistence & Deep Linking for Audit Filters
  const [persistedCategory, setPersistedCategory] = usePersistedTab<string>({
    storageKey: 'clinicez_audit_category',
    allowedValues: ['All', 'Security', 'Operations', 'Billing', 'Clinical Access', 'PhilHealth Yakap', 'Clinical', 'PhilHealth'],
    defaultValue: 'All',
    queryParam: 'category',
    pathnameMatcher: (p) => (p || '').includes('audit') || (p || '').includes('settings'),
    omitDefaultFromUrl: true,
    navigation,
  });

  const [persistedSeverity, setPersistedSeverity] = usePersistedTab<string>({
    storageKey: 'clinicez_audit_severity',
    allowedValues: ['All', 'Emergency', 'Urgent', 'Routine'],
    defaultValue: 'All',
    queryParam: 'severity',
    pathnameMatcher: (p) => (p || '').includes('audit') || (p || '').includes('settings'),
    omitDefaultFromUrl: true,
    navigation,
  });

  const [persistedSearch, setPersistedSearch] = usePersistedTab<string>({
    storageKey: 'clinicez_audit_search',
    defaultValue: '',
    queryParam: 'q',
    queryParamAliases: ['search'],
    pathnameMatcher: (p) => (p || '').includes('audit') || (p || '').includes('settings'),
    omitDefaultFromUrl: true,
    allowEmpty: true,
    navigation,
  });

  const [persistedDatePreset, setPersistedDatePreset] = usePersistedTab<AuditDatePreset>({
    storageKey: 'clinicez_audit_date_preset',
    allowedValues: ['today', '24h', '7d', '30d', 'all', 'custom'],
    defaultValue: '7d',
    queryParam: 'preset',
    pathnameMatcher: (p) => (p || '').includes('audit') || (p || '').includes('settings'),
    omitDefaultFromUrl: true,
    navigation,
  });

  const [persistedStartDate, setPersistedStartDate] = usePersistedTab<string>({
    storageKey: 'clinicez_audit_start_date',
    defaultValue: '',
    queryParam: 'start',
    queryParamAliases: ['startDate'],
    pathnameMatcher: (p) => (p || '').includes('audit') || (p || '').includes('settings'),
    omitDefaultFromUrl: true,
    allowEmpty: true,
    navigation,
  });

  const [persistedEndDate, setPersistedEndDate] = usePersistedTab<string>({
    storageKey: 'clinicez_audit_end_date',
    defaultValue: '',
    queryParam: 'end',
    queryParamAliases: ['endDate'],
    pathnameMatcher: (p) => (p || '').includes('audit') || (p || '').includes('settings'),
    omitDefaultFromUrl: true,
    allowEmpty: true,
    navigation,
  });

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
    initialCategory: persistedCategory,
    initialSeverity: persistedSeverity,
    initialDatePreset: persistedDatePreset,
  });

  const didSyncDatesRef = useRef(false);
  useEffect(() => {
    if (didSyncDatesRef.current) return;
    didSyncDatesRef.current = true;
    if (persistedDatePreset === 'custom') {
      if (persistedStartDate) setStartDate(persistedStartDate);
      if (persistedEndDate) setEndDate(persistedEndDate);
    }
    if (persistedSearch && persistedSearch !== search) {
      setSearch(persistedSearch);
    }
  }, []);

  const handleSelectCategory = useCallback(
    (cat: string) => {
      setCategory(cat);
      setPersistedCategory(cat);
    },
    [setCategory, setPersistedCategory],
  );

  const handleSeverityFilterChange = useCallback(
    (sev: string) => {
      setSeverity(sev);
      setPersistedSeverity(sev);
    },
    [setSeverity, setPersistedSeverity],
  );

  const handleSearchChange = useCallback(
    (text: string) => {
      setSearch(text);
      setPersistedSearch(text);
    },
    [setSearch, setPersistedSearch],
  );

  const handleDatePresetChange = useCallback(
    (preset: AuditDatePreset) => {
      applyDatePreset(preset);
      setPersistedDatePreset(preset);
      if (preset !== 'custom') {
        setPersistedStartDate('');
        setPersistedEndDate('');
      }
    },
    [applyDatePreset, setPersistedDatePreset, setPersistedStartDate, setPersistedEndDate],
  );

  const handleStartDateChange = useCallback(
    (d: string) => {
      setStartDate(d);
      setPersistedDatePreset('custom');
      setPersistedStartDate(d);
    },
    [setStartDate, setPersistedDatePreset, setPersistedStartDate],
  );

  const handleEndDateChange = useCallback(
    (d: string) => {
      setEndDate(d);
      setPersistedDatePreset('custom');
      setPersistedEndDate(d);
    },
    [setEndDate, setPersistedDatePreset, setPersistedEndDate],
  );

  const handleResetFilters = useCallback(() => {
    resetFilters();
    setPersistedCategory('All');
    setPersistedSeverity('All');
    setPersistedSearch('');
    setPersistedDatePreset('7d');
    setPersistedStartDate('');
    setPersistedEndDate('');
  }, [
    resetFilters,
    setPersistedCategory,
    setPersistedSeverity,
    setPersistedSearch,
    setPersistedDatePreset,
    setPersistedStartDate,
    setPersistedEndDate,
  ]);

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;

      // Update scroll position for virtualizer (throttled to 25px steps to avoid unnecessary re-renders)
      const currentY = Math.max(0, contentOffset.y);
      if (Math.abs(currentY - lastScrollYRef.current) >= 25 || currentY === 0) {
        lastScrollYRef.current = currentY;
        setScrollY(currentY);
      }
      if (layoutMeasurement.height > 0 && Math.abs(layoutMeasurement.height - viewportHeightRef.current) >= 50) {
        viewportHeightRef.current = layoutMeasurement.height;
        setViewportHeight(layoutMeasurement.height);
      }

      // Near-bottom detection for infinite scroll
      const isNearBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 350;
      if (isNearBottom && hasMore && !loadingEarlier && !loading) {
        loadEarlierStream();
      }
    },
    [hasMore, loadingEarlier, loading, loadEarlierStream]
  );

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

  // When embedded in Settings tab, inherit outer Settings ScrollView
  if (embeddedInSettings) {
    return (
      <View style={[styles.root, styles.rootEmbedded]}>
        {/* Filter Controls Bar */}
        <AuditFilterBar
          selectedCategory={category}
          onSelectCategory={handleSelectCategory}
          search={search}
          onSearchChange={handleSearchChange}
          startDate={startDate}
          onStartDateChange={handleStartDateChange}
          endDate={endDate}
          onEndDateChange={handleEndDateChange}
          severityFilter={severity}
          onSeverityFilterChange={handleSeverityFilterChange}
          datePreset={datePreset}
          onDatePresetChange={handleDatePresetChange}
          dateRangeError={dateRangeError}
          onResetFilters={handleResetFilters}
          onOpenExport={canExport ? () => setIsExportModalOpen(true) : undefined}
          isExporting={isExporting}
          onRefresh={refresh}
          isRefreshing={refreshing}
          onOpenDateRangePicker={() => setIsDateRangeModalOpen(true)}
          onOpenMoreFilters={() => setIsMoreFiltersSheetOpen(true)}
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
        <View
          onLayout={(e) => {
            const layoutY = e.nativeEvent.layout.y;
            if (layoutY > 0 && Math.abs(layoutY - listTopOffset) > 10) {
              setListTopOffset(layoutY);
            }
          }}
        >
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
            scrollY={scrollY}
            viewportHeight={viewportHeight}
            listTopOffset={listTopOffset}
            dateFormat={dateFormat}
            timeFormat={timeFormat}
            timeZoneId={timeZoneId}
          />
        </View>

        {/* Persistent Desktop Slide-Over Drawer / Mobile Modal */}
        <AuditInspectionDrawer
          entry={selectedEntry}
          detail={selectedDetail}
          loadingDetail={loadingDetail}
          onClose={handleCloseDrawer}
          dateFormat={dateFormat}
          timeFormat={timeFormat}
          timeZoneId={timeZoneId}
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

        {/* Date Range Calendar Picker Modal */}
        <DateRangePickerModal
          visible={isDateRangeModalOpen}
          onClose={() => setIsDateRangeModalOpen(false)}
          startDate={startDate}
          endDate={endDate}
          onApply={(start, end) => {
            handleStartDateChange(start);
            handleEndDateChange(end);
          }}
          boundaryMode="pastOrToday"
        />

        {/* Mobile More Filters Sheet */}
        <AuditFilterMoreSheet
          visible={isMoreFiltersSheetOpen}
          onClose={() => setIsMoreFiltersSheetOpen(false)}
          selectedCategory={category}
          onSelectCategory={handleSelectCategory}
          severityFilter={severity}
          onSeverityFilterChange={handleSeverityFilterChange}
          startDate={startDate}
          endDate={endDate}
          onOpenDateRangePicker={() => setIsDateRangeModalOpen(true)}
          onResetFilters={handleResetFilters}
        />
      </View>
    );
  }

  // Standalone mode (Audit Screen): full responsive ScrollView with pull-to-refresh & infinite scroll
  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollViewRef}
        style={styles.scrollRoot}
        contentContainerStyle={styles.scrollContent}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Filter Controls Bar */}
        <AuditFilterBar
          selectedCategory={category}
          onSelectCategory={handleSelectCategory}
          search={search}
          onSearchChange={handleSearchChange}
          startDate={startDate}
          onStartDateChange={handleStartDateChange}
          endDate={endDate}
          onEndDateChange={handleEndDateChange}
          severityFilter={severity}
          onSeverityFilterChange={handleSeverityFilterChange}
          datePreset={datePreset}
          onDatePresetChange={handleDatePresetChange}
          dateRangeError={dateRangeError}
          onResetFilters={handleResetFilters}
          onOpenExport={canExport ? () => setIsExportModalOpen(true) : undefined}
          isExporting={isExporting}
          onRefresh={refresh}
          isRefreshing={refreshing}
          onOpenDateRangePicker={() => setIsDateRangeModalOpen(true)}
          onOpenMoreFilters={() => setIsMoreFiltersSheetOpen(true)}
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

        {/* Audit Log Table with Virtualization & Infinite Scroll */}
        <View
          onLayout={(e) => {
            const layoutY = e.nativeEvent.layout.y;
            if (layoutY > 0 && Math.abs(layoutY - listTopOffset) > 10) {
              setListTopOffset(layoutY);
            }
          }}
        >
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
            scrollY={scrollY}
            viewportHeight={viewportHeight}
            listTopOffset={listTopOffset}
            dateFormat={dateFormat}
            timeFormat={timeFormat}
            timeZoneId={timeZoneId}
          />
        </View>
      </ScrollView>

      {/* Persistent Desktop Slide-Over Drawer / Mobile Modal */}
      <AuditInspectionDrawer
        entry={selectedEntry}
        detail={selectedDetail}
        loadingDetail={loadingDetail}
        onClose={handleCloseDrawer}
        dateFormat={dateFormat}
        timeFormat={timeFormat}
        timeZoneId={timeZoneId}
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

      {/* Date Range Calendar Picker Modal */}
      <DateRangePickerModal
        visible={isDateRangeModalOpen}
        onClose={() => setIsDateRangeModalOpen(false)}
        startDate={startDate}
        endDate={endDate}
        onApply={(start, end) => {
          handleStartDateChange(start);
          handleEndDateChange(end);
        }}
        boundaryMode="pastOrToday"
      />

      {/* Mobile More Filters Sheet */}
      <AuditFilterMoreSheet
        visible={isMoreFiltersSheetOpen}
        onClose={() => setIsMoreFiltersSheetOpen(false)}
        selectedCategory={category}
        onSelectCategory={handleSelectCategory}
        severityFilter={severity}
        onSeverityFilterChange={handleSeverityFilterChange}
        startDate={startDate}
        endDate={endDate}
        onOpenDateRangePicker={() => setIsDateRangeModalOpen(true)}
        onResetFilters={handleResetFilters}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  rootEmbedded: {
    padding: 0,
    backgroundColor: theme.colors.transparent,
    gap: theme.spacing.md,
  },
  scrollRoot: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
});
export default AuditWorkstationView;
