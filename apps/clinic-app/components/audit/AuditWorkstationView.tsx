import React, { useState, useCallback, useRef } from 'react';
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
import AuditFilterBar from './AuditFilterBar';
import AuditTable from './AuditTable';
import AuditInspectionDrawer from './AuditInspectionDrawer';
import AuditExportModal from './AuditExportModal';
import AuditFilterMoreSheet from './AuditFilterMoreSheet';
import DateRangePickerModal from '../ui/DateRangePickerModal';
import type { ClinicAuditEntryDto } from '../../services/clinicService';

export interface AuditWorkstationViewProps {
  embeddedInSettings?: boolean;
}

export function AuditWorkstationView({
  embeddedInSettings = false,
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
            setStartDate(start);
            setEndDate(end);
            applyDatePreset('custom');
          }}
          boundaryMode="pastOrToday"
        />

        {/* Mobile More Filters Sheet */}
        <AuditFilterMoreSheet
          visible={isMoreFiltersSheetOpen}
          onClose={() => setIsMoreFiltersSheetOpen(false)}
          selectedCategory={category}
          onSelectCategory={setCategory}
          severityFilter={severity}
          onSeverityFilterChange={setSeverity}
          startDate={startDate}
          endDate={endDate}
          onOpenDateRangePicker={() => setIsDateRangeModalOpen(true)}
          onResetFilters={resetFilters}
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
          setStartDate(start);
          setEndDate(end);
          applyDatePreset('custom');
        }}
        boundaryMode="pastOrToday"
      />

      {/* Mobile More Filters Sheet */}
      <AuditFilterMoreSheet
        visible={isMoreFiltersSheetOpen}
        onClose={() => setIsMoreFiltersSheetOpen(false)}
        selectedCategory={category}
        onSelectCategory={setCategory}
        severityFilter={severity}
        onSeverityFilterChange={setSeverity}
        startDate={startDate}
        endDate={endDate}
        onOpenDateRangePicker={() => setIsDateRangeModalOpen(true)}
        onResetFilters={resetFilters}
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
