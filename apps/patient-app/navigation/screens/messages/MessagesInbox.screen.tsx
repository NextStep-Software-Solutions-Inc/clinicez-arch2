import React, { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { format, parseISO } from 'date-fns';
import Screen from '../../../components/layout/Screen';
import Card from '../../../components/ui/Card';
import Badge from '../../../components/ui/Badge';
import { AppIcon } from '../../../components/ui/Icon';
import IconButton from '../../../components/ui/IconButton';
import ThemedText from '../../../components/ui/ThemedText';
import EmptyState from '../../../components/ui/EmptyState';
import { SkeletonCard } from '../../../components/ui/Skeleton';
import FilterChipBar from '../../../components/ui/FilterChipBar';
import BottomTabsHeaderRight from '../../../components/BottomTabsHeaderRight';
import { useAppTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../contexts/AuthContext';
import { usePrivacy } from '../../../contexts/PrivacyContext';
import { useContentInsets } from '../../../hooks/useContentInsets';
import {
  communicationsService,
  type PatientConversationDto,
  type PatientEligibilityGrantDto,
} from '../../../services/comms/communicationsService';
import { dialog } from '../../../utils/dialog';

type FacilityFilter = 'All' | 'Clinics' | 'Pharmacies' | 'Laboratories';

interface DependentOption {
  id: string | null; // null for All
  label: string;
}

export default function MessagesInboxScreen() {
  const { colors, spacing, radii, sizes, shadows } = useAppTheme();
  const navigation = useNavigation<any>();
  const { getToken, internalPatientId } = useAuth();
  const contentInsets = useContentInsets();
  const tabBarBottom = contentInsets.bottom;
  const {
    privacyBlurEnabled,
    togglePrivacyBlur,
    showHiddenConversations,
    hiddenConversationIds,
    hideConversation,
  } = usePrivacy();

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <BottomTabsHeaderRight
          onTogglePrivacy={togglePrivacyBlur}
          isPrivacyActive={privacyBlurEnabled}
        />
      ),
    });
  }, [navigation, togglePrivacyBlur, privacyBlurEnabled]);

  const [conversations, setConversations] = useState<PatientConversationDto[]>([]);
  const [grants, setGrants] = useState<PatientEligibilityGrantDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [facilityFilter, setFacilityFilter] = useState<FacilityFilter>('All');
  const [selectedDependentId, setSelectedDependentId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [convos, eligibilityGrants] = await Promise.all([
        communicationsService.getConversations(getToken, selectedDependentId ?? undefined),
        communicationsService.getEligibilityGrants(getToken).catch(() => []),
      ]);
      setConversations(convos);
      setGrants(eligibilityGrants);
    } catch (err: any) {
      console.warn('[MessagesInbox] Failed to load data:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [getToken, selectedDependentId]);

  useEffect(() => {
    setIsLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadData();
  }, [loadData]);

  // Dependent Filter Options (Self + Dependents from conversations/grants)
  const dependentOptions: DependentOption[] = useMemo(() => {
    const list: DependentOption[] = [
      { id: null, label: 'All Records' },
      { id: internalPatientId ?? 'self', label: 'Me (Self)' },
    ];

    const seenIds = new Set<string>();
    if (internalPatientId) seenIds.add(internalPatientId);

    // Collect dependents from conversations
    for (const c of conversations) {
      if (c.patientId && !seenIds.has(c.patientId)) {
        seenIds.add(c.patientId);
        const name = c.relationshipToPatient
          ? `Dependent (${c.relationshipToPatient})`
          : 'Linked Dependent';
        list.push({ id: c.patientId, label: name });
      }
    }

    // Collect dependents from grants
    for (const g of grants) {
      if (g.patientId && !seenIds.has(g.patientId)) {
        seenIds.add(g.patientId);
        list.push({ id: g.patientId, label: 'Linked Dependent' });
      }
    }

    return list;
  }, [conversations, grants, internalPatientId]);

  // Filter conversations
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // Hide my copy filter
      const isHiddenLocally = hiddenConversationIds.has(c.id);
      if ((c.isHiddenByPatient || isHiddenLocally) && !showHiddenConversations) {
        return false;
      }

      // Facility filter
      if (facilityFilter === 'Clinics' && c.homeFacilityType !== 'Clinic') return false;
      if (facilityFilter === 'Pharmacies' && c.homeFacilityType !== 'Pharmacy') return false;
      if (facilityFilter === 'Laboratories' && c.homeFacilityType !== 'Laboratory') return false;

      // Dependent filter
      if (selectedDependentId && selectedDependentId !== 'self') {
        if (c.patientId !== selectedDependentId) return false;
      } else if (selectedDependentId === 'self' && internalPatientId) {
        if (c.patientId !== internalPatientId) return false;
      }

      return true;
    });
  }, [
    conversations,
    facilityFilter,
    hiddenConversationIds,
    internalPatientId,
    selectedDependentId,
    showHiddenConversations,
  ]);

  const handleHideCopy = useCallback(
    async (conversation: PatientConversationDto) => {
      const ok = await dialog.confirm({
        title: 'Hide My Copy',
        message: `Hide your copy of "${conversation.subject}"? This removes the conversation from your device view without altering the official facility record.`,
        confirmLabel: 'Hide',
        destructive: true,
      });
      if (ok) {
        await hideConversation(conversation.id, getToken);
        dialog.alert('Copy Hidden', 'This conversation copy has been hidden from your active inbox.');
      }
    },
    [getToken, hideConversation],
  );

  const renderConversationItem = ({ item }: { item: PatientConversationDto }) => {
    let formattedTime = '';
    try {
      formattedTime = format(parseISO(item.lastMessageAtUtc), 'MMM d, h:mm a');
    } catch {
      formattedTime = item.lastMessageAtUtc || '';
    }

    const facilityTone =
      item.homeFacilityType === 'Pharmacy'
        ? 'info'
        : item.homeFacilityType === 'Laboratory'
          ? 'primary'
          : 'neutral';

    const statusTone =
      item.status === 'Routed'
        ? 'success'
        : item.status === 'WithTriage'
          ? 'warning'
          : item.status === 'Closed'
            ? 'neutral'
            : 'info';

    const isHidden = item.isHiddenByPatient || hiddenConversationIds.has(item.id);

    return (
      <Card
        padding="md"
        style={[
          styles.card,
          {
            borderColor: item.unreadCount > 0 ? colors.primary : colors.border,
            backgroundColor: item.unreadCount > 0 ? colors.surfaceSubtle : colors.surface,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open conversation: ${item.subject} with ${item.facilityName}`}
          onPress={() =>
            navigation.navigate('Main', {
              screen: 'ConversationThreadScreen',
              params: {
                conversationId: item.id,
                title: item.facilityName,
                scope: item.homeFacilityType,
              },
            })
          }
          style={styles.pressableRow}
        >
          {/* Header Row: Facility Name + Type Badge + Time */}
          <View style={styles.topRow}>
            <View style={styles.facilityGroup}>
              <AppIcon
                name={
                  item.homeFacilityType === 'Pharmacy'
                    ? 'pill'
                    : item.homeFacilityType === 'Laboratory'
                      ? 'lab'
                      : 'hospital'
                }
                size={16}
                color={
                  item.homeFacilityType === 'Pharmacy'
                    ? 'purple'
                    : item.homeFacilityType === 'Laboratory'
                      ? 'info'
                      : 'primary'
                }
              />
              <ThemedText variant="bodyBold" numberOfLines={1} style={styles.facilityName}>
                {item.facilityName}
              </ThemedText>
              <Badge label={item.homeFacilityType} tone={facilityTone} size="sm" />
              {isHidden && <Badge label="Hidden Copy" tone="warning" size="sm" />}
            </View>
            <ThemedText variant="caption" color="textMuted">
              {formattedTime}
            </ThemedText>
          </View>

          {/* Subject & Category */}
          <View style={[styles.metaRow, { gap: spacing.xs, marginVertical: 4 }]}>
            <Badge label={item.category} tone="neutral" size="sm" />
            <ThemedText variant="smallBold" numberOfLines={1} style={styles.subjectText}>
              {item.subject}
            </ThemedText>
            <Badge label={item.status} tone={statusTone} size="sm" />
          </View>

          {/* Snippet & Delivery State / Unread */}
          <View style={styles.bottomRow}>
            <ThemedText
              variant="small"
              color={item.unreadCount > 0 ? 'text' : 'textMuted'}
              numberOfLines={2}
              style={[
                styles.snippetText,
                privacyBlurEnabled && styles.blurredText,
              ]}
            >
              {privacyBlurEnabled ? '••••••••••••••••••••••••••••••••' : item.lastMessagePreview}
            </ThemedText>

            <View style={styles.actionsRight}>
              {item.unreadCount > 0 && (
                <View
                  style={[
                    styles.unreadBadge,
                    { backgroundColor: colors.primary, borderRadius: radii.full },
                  ]}
                >
                  <ThemedText variant="captionBold" color="onPrimary">
                    {item.unreadCount}
                  </ThemedText>
                </View>
              )}

              {/* Hide My Copy button */}
              <IconButton
                icon="eyeOff"
                accessibilityLabel="Hide My Copy"
                hitSize={36}
                onPress={() => handleHideCopy(item)}
              />
            </View>
          </View>
        </Pressable>
      </Card>
    );
  };

  return (
    <Screen
      width="form"
      bottomInset={tabBarBottom}
      refreshing={isRefreshing}
      onRefresh={onRefresh}
      contentContainerStyle={{ gap: spacing.md }}
      footer={
        <Pressable
          onPress={() =>
            navigation.navigate('Main', {
              screen: 'NewMessageInquiryScreen',
            })
          }
          style={({ pressed }) => [
            styles.fab,
            {
              backgroundColor: colors.primary,
              borderRadius: radii.full,
              bottom: contentInsets.bottom + spacing.lg,
              right: spacing.xl,
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.md,
              opacity: pressed ? 0.88 : 1,
            },
            shadows.md,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Start a new message inquiry"
        >
          <AppIcon name="plus" size={sizes.iconMd} color="onPrimary" />
          <ThemedText variant="bodyBold" color="onPrimary">
            New Inquiry
          </ThemedText>
        </Pressable>
      }
    >
      {/* Subtitle / Context description */}
      <ThemedText variant="small" color="textMuted" style={styles.headerSubtitle}>
        Unified inbox across clinics, pharmacies, & labs
      </ThemedText>

      {/* Dependent Filter Chips */}
      {dependentOptions.length > 2 && (
        <View style={{ gap: spacing.xs }}>
          <ThemedText variant="captionBold" color="textMuted">
            ACTING FOR
          </ThemedText>
          <FilterChipBar
            items={dependentOptions.map((opt) => ({
              key: opt.id ?? 'all',
              label: opt.label,
            }))}
            selectedKey={selectedDependentId ?? 'all'}
            onSelect={(id) => setSelectedDependentId(id === 'all' ? null : id)}
            style={{ marginHorizontal: -spacing.lg }}
            contentContainerStyle={{ paddingHorizontal: spacing.lg }}
          />
        </View>
      )}

      {/* Facility Filter Chips */}
      <FilterChipBar
        items={[
          { key: 'All', label: 'All Facilities' },
          { key: 'Clinics', label: 'Clinics' },
          { key: 'Pharmacies', label: 'Pharmacies' },
          { key: 'Laboratories', label: 'Laboratories' },
        ]}
        selectedKey={facilityFilter}
        onSelect={(id) => setFacilityFilter(id as FacilityFilter)}
        style={{ marginHorizontal: -spacing.lg }}
        contentContainerStyle={{ paddingHorizontal: spacing.lg }}
      />

      {/* Content List */}
      {isLoading ? (
        <View style={{ gap: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : filteredConversations.length === 0 ? (
        <EmptyState
          icon="chat"
          title="No active conversations"
          message={
            facilityFilter !== 'All'
              ? `No messages with ${facilityFilter.toLowerCase()} found.`
              : 'You have no messages yet. You can submit an inquiry or question to your connected healthcare facilities.'
          }
        />
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={renderConversationItem}
          scrollEnabled={false}
          contentContainerStyle={{ gap: spacing.sm }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerSubtitle: {
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  card: {
    borderWidth: 1,
  },
  pressableRow: {
    width: '100%',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  facilityGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  facilityName: {
    flexShrink: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  subjectText: {
    flex: 1,
    flexShrink: 1,
  },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  snippetText: {
    flex: 1,
    marginRight: 8,
  },
  blurredText: {
    letterSpacing: 2,
    opacity: 0.6,
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
