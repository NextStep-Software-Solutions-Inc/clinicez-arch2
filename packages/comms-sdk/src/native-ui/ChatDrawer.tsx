import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import {
  fontSizeScale,
  lightColors,
  radiusScale,
  sizes,
  spaceScale
} from '@clinicez/design-tokens';
import {
  ChatDrawerItem,
  ChatDrawerProps,
  ConversationScopeFilter
} from './types';

const SCOPES: ConversationScopeFilter[] = [
  'All',
  'PatientFacility',
  'StaffContext',
  'Facility',
  'Direct'
];

export const ChatDrawer: React.FC<ChatDrawerProps> = ({
  items,
  activeConversationId,
  onSelectConversation,
  selectedScope,
  onSelectScope,
  searchQuery,
  onSearchChange,
  isCollapsed = false,
  onToggleCollapse,
  connectionState = 'Connected',
  loading = false,
  error = null,
  onNewConversation,
  style
}) => {
  if (isCollapsed) {
    return (
      <View style={[styles.collapsedContainer, style]}>
        <TouchableOpacity
          style={styles.touchTarget}
          onPress={onToggleCollapse}
          accessibilityLabel="Expand communication drawer"
        >
          <Text style={styles.iconText}>Chat</Text>
        </TouchableOpacity>
        {items.some((i) => i.unreadCount > 0) && (
          <View style={styles.collapsedBadge}>
            <Text style={styles.collapsedBadgeText}>•</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Communications</Text>
          <View style={styles.headerActions}>
            {onToggleCollapse && (
              <TouchableOpacity
                style={styles.headerButton}
                onPress={onToggleCollapse}
                accessibilityLabel="Collapse drawer"
              >
                <Text style={styles.headerButtonText}>◀</Text>
              </TouchableOpacity>
            )}
            {onNewConversation && (
              <TouchableOpacity
                style={styles.primaryIconButton}
                onPress={onNewConversation}
                accessibilityLabel="New conversation"
              >
                <Text style={styles.primaryIconButtonText}>+ New</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {connectionState !== 'Connected' && (
          <View
            style={[
              styles.connectionBanner,
              connectionState === 'Reconnecting' ? styles.reconnectingBanner : styles.disconnectedBanner
            ]}
          >
            <Text style={styles.connectionText}>
              {connectionState === 'Reconnecting' ? 'Reconnecting to comms...' : 'Disconnected from comms'}
            </Text>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchContainer}>
          <Text style={styles.searchIcon}>Search</Text>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Search conversations..."
            placeholderTextColor={lightColors.textMuted}
            accessibilityLabel="Search conversations"
          />
        </View>

        {/* Scopes Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scopesScroll}>
          {SCOPES.map((scope) => {
            const isSelected = selectedScope === scope;
            return (
              <TouchableOpacity
                key={scope}
                style={[styles.scopePill, isSelected && styles.scopePillActive]}
                onPress={() => onSelectScope(scope)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.scopePillText, isSelected && styles.scopePillTextActive]}>
                  {scope === 'PatientFacility'
                    ? 'Triage'
                    : scope === 'StaffContext'
                      ? 'Care Team'
                      : scope}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content States */}
      {loading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color={lightColors.primary} />
          <Text style={styles.stateText}>Loading conversations...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorTitle}>Error Loading Conversations</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.stateContainer}>
          <Text style={styles.emptyIcon}>Chat</Text>
          <Text style={styles.emptyTitle}>No Conversations</Text>
          <Text style={styles.emptySubtitle}>No messages match your selected filter.</Text>
          {onNewConversation && (
            <TouchableOpacity style={styles.emptyCta} onPress={onNewConversation}>
              <Text style={styles.emptyCtaText}>Start Conversation</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <ScrollView style={styles.listContainer}>
          {items.map((item) => {
            const isActive = item.id === activeConversationId;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, isActive && styles.cardActive]}
                onPress={() => onSelectConversation(item.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, isActive && styles.cardTitleActive]} numberOfLines={1}>
                    {item.title}
                  </Text>
                  {item.lastMessageAtUtc && (
                    <Text style={styles.cardTime}>
                      {new Date(item.lastMessageAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>

                {item.lastMessageSnippet && (
                  <Text style={styles.cardSnippet} numberOfLines={2}>
                    {item.lastMessageSnippet}
                  </Text>
                )}

                <View style={styles.cardMeta}>
                  {item.isEmergency && (
                    <View style={styles.statBadge}>
                      <Text style={styles.statBadgeText}>STAT</Text>
                    </View>
                  )}
                  {item.urgentCount !== undefined && item.urgentCount > 0 && !item.isEmergency && (
                    <View style={styles.urgentBadge}>
                      <Text style={styles.urgentBadgeText}>Urgent</Text>
                    </View>
                  )}
                  {item.unreadCount > 0 && (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{item.unreadCount}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.surface,
    borderRightWidth: 1,
    borderRightColor: lightColors.border
  },
  collapsedContainer: {
    width: 64,
    backgroundColor: lightColors.surface,
    alignItems: 'center',
    paddingTop: spaceScale.md,
    borderRightWidth: 1,
    borderRightColor: lightColors.border
  },
  touchTarget: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center'
  },
  collapsedBadge: {
    marginTop: spaceScale.xs,
    backgroundColor: lightColors.emergency,
    borderRadius: radiusScale.full,
    paddingHorizontal: spaceScale.xs
  },
  collapsedBadgeText: {
    color: lightColors.onPrimary,
    fontWeight: '700'
  },
  header: {
    padding: spaceScale.md,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spaceScale.sm
  },
  headerTitle: {
    fontSize: fontSizeScale.xl,
    fontWeight: '700',
    color: lightColors.text
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs
  },
  headerButton: {
    minWidth: sizes.touchTarget,
    minHeight: sizes.touchTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.surfaceSubtle
  },
  headerButtonText: {
    color: lightColors.textSecondary,
    fontSize: fontSizeScale.md
  },
  primaryIconButton: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.primary
  },
  primaryIconButtonText: {
    color: lightColors.onPrimary,
    fontSize: fontSizeScale.sm,
    fontWeight: '600'
  },
  connectionBanner: {
    paddingVertical: spaceScale.xs,
    paddingHorizontal: spaceScale.sm,
    borderRadius: radiusScale.xs,
    marginBottom: spaceScale.xs
  },
  reconnectingBanner: {
    backgroundColor: lightColors.warningBg,
    borderColor: lightColors.warningBorder,
    borderWidth: 1
  },
  disconnectedBanner: {
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1
  },
  connectionText: {
    fontSize: fontSizeScale.xs,
    color: lightColors.text
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surfaceSubtle,
    borderRadius: radiusScale.sm,
    paddingHorizontal: spaceScale.sm,
    minHeight: sizes.touchTarget,
    marginBottom: spaceScale.sm
  },
  searchIcon: {
    marginRight: spaceScale.xs,
    fontSize: fontSizeScale.md
  },
  searchInput: {
    flex: 1,
    fontSize: fontSizeScale.sm,
    color: lightColors.text
  },
  scopesScroll: {
    flexDirection: 'row'
  },
  scopePill: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.md,
    paddingVertical: spaceScale.xs,
    borderRadius: radiusScale.full,
    backgroundColor: lightColors.surfaceSubtle,
    marginRight: spaceScale.xs,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scopePillActive: {
    backgroundColor: lightColors.primary
  },
  scopePillText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '500',
    color: lightColors.textSecondary
  },
  scopePillTextActive: {
    color: lightColors.onPrimary,
    fontWeight: '600'
  },
  listContainer: {
    flex: 1
  },
  card: {
    padding: spaceScale.md,
    borderBottomWidth: 1,
    borderBottomColor: lightColors.border,
    minHeight: sizes.touchTarget
  },
  cardActive: {
    backgroundColor: lightColors.primarySubtle,
    borderLeftWidth: 4,
    borderLeftColor: lightColors.primary
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spaceScale.xs
  },
  cardTitle: {
    fontSize: fontSizeScale.md,
    fontWeight: '600',
    color: lightColors.text,
    flex: 1
  },
  cardTitleActive: {
    color: lightColors.primary
  },
  cardTime: {
    fontSize: fontSizeScale.xs,
    color: lightColors.textMuted,
    marginLeft: spaceScale.xs
  },
  cardSnippet: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textSecondary,
    marginBottom: spaceScale.xs
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spaceScale.xs
  },
  statBadge: {
    backgroundColor: lightColors.emergencyBg,
    borderColor: lightColors.emergencyBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.xs,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  statBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.emergencyText
  },
  urgentBadge: {
    backgroundColor: lightColors.urgentBg,
    borderColor: lightColors.urgentBorder,
    borderWidth: 1,
    paddingHorizontal: spaceScale.xs,
    paddingVertical: 2,
    borderRadius: radiusScale.xs
  },
  urgentBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.urgentText
  },
  unreadBadge: {
    backgroundColor: lightColors.primary,
    paddingHorizontal: spaceScale.sm,
    paddingVertical: 2,
    borderRadius: radiusScale.full,
    marginLeft: 'auto'
  },
  unreadBadgeText: {
    fontSize: fontSizeScale.xs,
    fontWeight: '700',
    color: lightColors.onPrimary
  },
  stateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spaceScale.xl
  },
  stateText: {
    marginTop: spaceScale.sm,
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted
  },
  emptyIcon: {
    fontSize: fontSizeScale['3xl'],
    marginBottom: spaceScale.sm
  },
  emptyTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '600',
    color: lightColors.text,
    marginBottom: spaceScale.xs
  },
  emptySubtitle: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted,
    textAlign: 'center',
    marginBottom: spaceScale.md
  },
  emptyCta: {
    minHeight: sizes.touchTarget,
    paddingHorizontal: spaceScale.lg,
    borderRadius: radiusScale.sm,
    backgroundColor: lightColors.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyCtaText: {
    color: lightColors.onPrimary,
    fontWeight: '600',
    fontSize: fontSizeScale.sm
  },
  errorIcon: {
    fontSize: fontSizeScale['3xl'],
    marginBottom: spaceScale.sm
  },
  errorTitle: {
    fontSize: fontSizeScale.lg,
    fontWeight: '600',
    color: lightColors.emergencyText,
    marginBottom: spaceScale.xs
  },
  errorSubtitle: {
    fontSize: fontSizeScale.sm,
    color: lightColors.textMuted,
    textAlign: 'center'
  },
  iconText: {
    fontSize: fontSizeScale['2xl']
  }
});
