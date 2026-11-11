import React, { useMemo } from 'react';
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

export function getInitials(name: string): string {
  if (!name) return '??';
  const clean = name.replace(/^(Dr\.|Doc\.|Nurse|Atty\.|Mr\.|Ms\.|Mrs\.)\s+/i, '').trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  renderScopeIcon,
  renderEmptyState,
  renderSearchIcon,
  colors,
  style
}) => {
  const colorsKey = colors
    ? `${colors.primary ?? ''}|${colors.primaryLight ?? ''}|${colors.primarySubtle ?? ''}|${colors.primaryBorder ?? ''}|${colors.primaryDark ?? ''}|${colors.background ?? ''}|${colors.surface ?? ''}|${colors.text ?? ''}`
    : '';
  const c = useMemo<ResolvedCommsColors>(() => ({ ...lightColors, ...colors }), [colors, colorsKey]);
  const styles = useMemo(() => createStyles(c), [c]);

  if (isCollapsed) {
    return (
      <View style={[styles.collapsedContainer, style]}>
        <TouchableOpacity
          style={styles.touchTarget}
          onPress={onToggleCollapse}
          accessibilityLabel="Expand communication drawer"
        >
          {renderSearchIcon ? renderSearchIcon() : <Text style={styles.iconText}>•</Text>}
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
        {/* Search & New Button Inline Row */}
        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            {renderSearchIcon ? (
              renderSearchIcon()
            ) : (
              <View style={styles.searchIconWrap}>
                <View style={styles.searchIconLens} />
                <View style={styles.searchIconStem} />
              </View>
            )}
            <TextInput
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={onSearchChange}
              placeholder="Search conversations..."
              placeholderTextColor={c.textMuted}
              accessibilityLabel="Search conversations"
            />
          </View>

          {onNewConversation && (
            <TouchableOpacity
              style={styles.primaryIconButton}
              onPress={onNewConversation}
              accessibilityLabel="New conversation"
            >
              <Text style={styles.primaryIconButtonText}>+ New</Text>
            </TouchableOpacity>
          )}

          {onToggleCollapse && (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={onToggleCollapse}
              accessibilityLabel="Collapse drawer"
            >
              <Text style={styles.headerButtonText}>&lt;</Text>
            </TouchableOpacity>
          )}
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
          <ActivityIndicator size="small" color={c.primary} />
          <Text style={styles.stateText}>Loading conversations...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorTitle}>Error Loading Conversations</Text>
          <Text style={styles.errorSubtitle}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        renderEmptyState ? (
          renderEmptyState()
        ) : (
          <View style={styles.stateContainer}>
            <Text style={styles.emptyTitle}>No Conversations</Text>
            <Text style={styles.emptySubtitle}>No messages match your selected filter.</Text>
            {onNewConversation && (
              <TouchableOpacity style={styles.emptyCta} onPress={onNewConversation}>
                <Text style={styles.emptyCtaText}>Start Conversation</Text>
              </TouchableOpacity>
            )}
          </View>
        )
      ) : (
        <ScrollView style={styles.listContainer}>
          {items.map((item) => {
            const isActive = item.id === activeConversationId;
            const hasRecentMessage = Boolean(item.lastMessageSnippet);
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, isActive && styles.cardActive]}
                onPress={() => onSelectConversation(item.id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
              >
                <View style={[styles.cardContentRow, !hasRecentMessage && styles.cardContentRowCentered]}>
                  <View
                    style={[
                      styles.cardAvatar,
                      !hasRecentMessage && styles.cardAvatarCentered,
                      item.scope === 'Direct' && styles.cardAvatarDirect,
                      item.scope === 'StaffContext' && styles.cardAvatarCareTeam,
                      item.scope === 'Facility' && styles.cardAvatarFacility,
                      item.scope === 'PatientFacility' && styles.cardAvatarTriage,
                    ]}
                  >
                    {item.scope === 'Direct' ? (
                      <Text style={[styles.cardAvatarText, styles.cardAvatarMonogramText]}>
                        {getInitials(item.title)}
                      </Text>
                    ) : renderScopeIcon ? (
                      renderScopeIcon(item.scope)
                    ) : (
                      <Text style={styles.cardAvatarText}>
                        {item.scope === 'StaffContext'
                          ? 'C'
                          : item.scope === 'Facility'
                            ? '#'
                            : 'T'}
                      </Text>
                    )}
                  </View>

                  <View style={[styles.cardMain, !hasRecentMessage && styles.cardMainCentered]}>
                    <View style={[styles.cardHeader, !hasRecentMessage && styles.cardHeaderCentered]}>
                      <Text
                        style={[
                          styles.cardTitle,
                          item.unreadCount > 0 && styles.cardTitleUnread,
                          isActive && styles.cardTitleActive,
                        ]}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <View style={styles.cardHeaderRight}>
                        <View style={styles.scopeTag}>
                          <Text style={styles.scopeTagText}>
                            {item.scope === 'PatientFacility'
                              ? 'Triage'
                              : item.scope === 'StaffContext'
                                ? 'Care Team'
                                : item.scope === 'Facility'
                                  ? 'Facility'
                                  : 'Direct'}
                          </Text>
                        </View>
                        {item.lastMessageAtUtc && (
                          <Text style={styles.cardTime}>
                            {new Date(item.lastMessageAtUtc).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </Text>
                        )}
                      </View>
                    </View>

                    {item.lastMessageSnippet && (
                      <Text
                        style={[
                          styles.cardSnippet,
                          item.unreadCount > 0 && styles.cardSnippetUnread,
                        ]}
                        numberOfLines={2}
                      >
                        {item.lastMessageSnippet}
                      </Text>
                    )}

                    {(item.isEmergency || (item.urgentCount !== undefined && item.urgentCount > 0) || item.unreadCount > 0) && (
                      <View style={styles.cardMeta}>
                        {item.isEmergency && (
                          <View style={styles.statBadge}>
                            <Text style={styles.statBadgeText}>Emergency</Text>
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
                    )}
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

type ResolvedCommsColors = Record<keyof typeof lightColors, string>;

function createStyles(c: ResolvedCommsColors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.surface,
      borderRightWidth: 1,
      borderRightColor: c.border
    },
    collapsedContainer: {
      width: 64,
      backgroundColor: c.surface,
      alignItems: 'center',
      paddingTop: spaceScale.md,
      borderRightWidth: 1,
      borderRightColor: c.border
    },
    touchTarget: {
      minWidth: sizes.touchTarget,
      minHeight: sizes.touchTarget,
      alignItems: 'center',
      justifyContent: 'center'
    },
    collapsedBadge: {
      marginTop: spaceScale.xs,
      backgroundColor: c.emergency,
      borderRadius: radiusScale.full,
      paddingHorizontal: spaceScale.xs
    },
    collapsedBadgeText: {
      color: c.onPrimary,
      fontWeight: '700'
    },
    header: {
      padding: spaceScale.md,
      borderBottomWidth: 1,
      borderBottomColor: c.border
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
      color: c.text
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
      backgroundColor: c.surfaceSubtle
    },
    headerButtonText: {
      color: c.textSecondary,
      fontSize: fontSizeScale.md
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spaceScale.sm,
      marginBottom: spaceScale.sm,
    },
    primaryIconButton: {
      minHeight: 38,
      paddingHorizontal: spaceScale.md,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radiusScale.full,
      backgroundColor: c.primary,
      shadowColor: c.shadow,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.12,
      shadowRadius: 2,
      elevation: 2,
    },
    primaryIconButtonText: {
      color: c.onPrimary,
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
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
      borderWidth: 1
    },
    disconnectedBanner: {
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1
    },
    connectionText: {
      fontSize: fontSizeScale.xs,
      color: c.text
    },
    searchContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.surfaceSubtle,
      borderRadius: radiusScale.full,
      borderWidth: 1,
      borderColor: c.border,
      paddingHorizontal: spaceScale.md,
      minHeight: 38,
    },
    searchIconWrap: {
      width: 14,
      height: 14,
      marginRight: spaceScale.xs,
      position: 'relative',
      opacity: 0.7,
    },
    searchIconLens: {
      width: 10,
      height: 10,
      borderRadius: radiusScale.full,
      borderWidth: 1.5,
      borderColor: c.textMuted,
    },
    searchIconStem: {
      position: 'absolute',
      right: 1,
      bottom: 1,
      width: 5,
      height: 1.5,
      backgroundColor: c.textMuted,
      transform: [{ rotate: '45deg' }],
    },
    searchInput: {
      flex: 1,
      fontSize: fontSizeScale.sm,
      color: c.text
    },
    scopesScroll: {
      flexDirection: 'row'
    },
    scopePill: {
      minHeight: 34,
      paddingHorizontal: spaceScale.md,
      paddingVertical: spaceScale.xs,
      borderRadius: radiusScale.full,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.border,
      marginRight: spaceScale.xs,
      justifyContent: 'center',
      alignItems: 'center'
    },
    scopePillActive: {
      backgroundColor: c.primaryLight,
      borderColor: c.primaryBorder,
    },
    scopePillText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '500',
      color: c.textSecondary
    },
    scopePillTextActive: {
      color: c.primaryDark,
      fontWeight: '700'
    },
    listContainer: {
      flex: 1
    },
    card: {
      padding: spaceScale.md,
      borderBottomWidth: 1,
      borderBottomColor: c.borderLight,
      minHeight: sizes.touchTarget
    },
    cardActive: {
      backgroundColor: c.primarySubtle,
      borderLeftWidth: 4,
      borderLeftColor: c.primary
    },
    cardContentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spaceScale.sm,
    },
    cardContentRowCentered: {
      alignItems: 'center',
    },
    cardAvatar: {
      width: 36,
      height: 36,
      borderRadius: radiusScale.full,
      backgroundColor: c.surfaceSubtle,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    cardAvatarCentered: {
      marginTop: 0,
    },
    cardAvatarDirect: {
      backgroundColor: c.primarySubtle,
      borderColor: c.primaryBorder,
    },
    cardAvatarCareTeam: {
      backgroundColor: c.surfaceSubtle,
      borderColor: c.border,
    },
    cardAvatarFacility: {
      backgroundColor: c.surfaceSubtle,
      borderColor: c.border,
    },
    cardAvatarTriage: {
      backgroundColor: c.warningBg,
      borderColor: c.warningBorder,
    },
    cardAvatarText: {
      fontSize: fontSizeScale.sm,
      fontWeight: '600',
      color: c.primary,
    },
    cardAvatarMonogramText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.primary,
    },
    cardMain: {
      flex: 1,
    },
    cardMainCentered: {
      justifyContent: 'center',
    },
    scopeTag: {
      backgroundColor: c.surfaceSubtle,
      borderWidth: 1,
      borderColor: c.borderLight,
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radiusScale.xs,
    },
    scopeTagText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '600',
      color: c.textSecondary,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spaceScale.xs,
      gap: spaceScale.xs,
    },
    cardHeaderCentered: {
      marginBottom: 0,
    },
    cardTitle: {
      fontSize: fontSizeScale.md,
      fontWeight: '600',
      color: c.text,
      flex: 1
    },
    cardTitleActive: {
      color: c.primary
    },
    cardTitleUnread: {
      fontWeight: '700',
      color: c.text
    },
    cardHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spaceScale.xs,
      flexShrink: 0,
    },
    cardTime: {
      fontSize: fontSizeScale.xs,
      color: c.textMuted,
    },
    cardSnippet: {
      fontSize: fontSizeScale.sm,
      color: c.textSecondary,
      marginBottom: spaceScale.xs
    },
    cardSnippetUnread: {
      fontWeight: '600',
      color: c.text
    },
    cardMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spaceScale.xs
    },
    statBadge: {
      backgroundColor: c.emergencyBg,
      borderColor: c.emergencyBorder,
      borderWidth: 1,
      paddingHorizontal: spaceScale.xs,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    statBadgeText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.emergencyText
    },
    urgentBadge: {
      backgroundColor: c.urgentBg,
      borderColor: c.urgentBorder,
      borderWidth: 1,
      paddingHorizontal: spaceScale.xs,
      paddingVertical: 2,
      borderRadius: radiusScale.xs
    },
    urgentBadgeText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.urgentText
    },
    unreadBadge: {
      backgroundColor: c.primary,
      paddingHorizontal: spaceScale.sm,
      paddingVertical: 2,
      borderRadius: radiusScale.full,
      marginLeft: 'auto'
    },
    unreadBadgeText: {
      fontSize: fontSizeScale.xs,
      fontWeight: '700',
      color: c.onPrimary
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
      color: c.textMuted
    },
    emptyIcon: {
      fontSize: fontSizeScale['3xl'],
      marginBottom: spaceScale.sm
    },
    emptyTitle: {
      fontSize: fontSizeScale.lg,
      fontWeight: '600',
      color: c.text,
      marginBottom: spaceScale.xs
    },
    emptySubtitle: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
      textAlign: 'center',
      marginBottom: spaceScale.md
    },
    emptyCta: {
      minHeight: sizes.touchTarget,
      paddingHorizontal: spaceScale.lg,
      borderRadius: radiusScale.sm,
      backgroundColor: c.primary,
      justifyContent: 'center',
      alignItems: 'center'
    },
    emptyCtaText: {
      color: c.onPrimary,
      fontWeight: '600',
      fontSize: fontSizeScale.sm
    },
    errorIcon: {
      fontSize: fontSizeScale['3xl'],
      marginBottom: spaceScale.sm,
      color: c.emergencyText
    },
    errorTitle: {
      fontSize: fontSizeScale.lg,
      fontWeight: '600',
      color: c.emergencyText,
      marginBottom: spaceScale.xs
    },
    errorSubtitle: {
      fontSize: fontSizeScale.sm,
      color: c.textMuted,
      textAlign: 'center'
    },
    iconText: {
      fontSize: fontSizeScale['2xl'],
      color: c.primary
    }
  });
}
