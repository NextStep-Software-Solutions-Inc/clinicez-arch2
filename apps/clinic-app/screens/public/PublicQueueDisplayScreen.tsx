import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
} from 'react-native';
import { darkColors } from '@clinicez/design-tokens';
import { theme } from '../../constants/theme';
import Icon from '../../components/ui/Icon';
import { clinicService } from '../../services/clinicService';
import { isAudioMuted, setAudioMuted, playAlertChime, unlockAudio } from '../../utils/audioChime';
import { CoBrandedLogo } from '../../components/ui/ClinicEzLogo';

export interface ServingTicket {
  queueItemId: string;
  ticketNumber: string;
  doctorName?: string | null;
  roomOrStation?: string | null;
  calledTime?: string | null;
  status: string;
}

export interface UpcomingTicket {
  queueItemId: string;
  ticketNumber: string;
  displayName: string;
  priority: string;
  status: string;
  sequenceNumber: number;
  checkInTime: string;
}

export interface PublicQueueDisplayData {
  clinicId: string;
  clinicName: string;
  tenantSlug?: string;
  facilitySlug?: string;
  nowServing: ServingTicket[];
  upNext: UpcomingTicket[];
  maskPatientNames: boolean;
  generatedAtUtc: string;
  patientsWaitingCount: number;
  logoUrl?: string | null;
}

export default function PublicQueueDisplayScreen() {
  const [data, setData] = useState<PublicQueueDisplayData | null>(null);
  const [, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(isAudioMuted);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [lastUpdatedTime, setLastUpdatedTime] = useState<number>(Date.now());
  const [pulseActive, setPulseActive] = useState<boolean>(false);

  const prevServingRef = useRef<string[]>([]);
  const failureCountRef = useRef<number>(0);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Live Philippine Clock (Asia/Manila)
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-PH', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      setCurrentDate(
        now.toLocaleDateString('en-PH', {
          weekday: 'long',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      );
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fullscreen change listener on web
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Data fetching and ticket advancement detection
  const fetchQueue = useCallback(async () => {
    try {
      const [res, err] = await clinicService.getPublicQueueDisplay();
      if (err || !res) {
        failureCountRef.current += 1;
        setError(err?.message || 'Unable to sync queue updates.');
        return;
      }

      failureCountRef.current = 0;
      setError(null);
      setLastUpdatedTime(Date.now());

      const newServing: string[] = res.nowServing?.map((s: ServingTicket) => s.ticketNumber) || [];
      const prevServing = prevServingRef.current;

      // Audio & visual alert when a new ticket is called
      const hasNewCall = newServing.some((t) => !prevServing.includes(t));
      if (hasNewCall && prevServing.length > 0) {
        setPulseActive(true);
        setTimeout(() => setPulseActive(false), 3600);
        playAlertChime();
      }

      prevServingRef.current = newServing;
      setData(res);
      setLoading(false);
    } catch (e: any) {
      failureCountRef.current += 1;
      setError(e?.message || 'Network error fetching queue.');
    }
  }, []);

  // Polling loop with exponential backoff on failure (4s base)
  useEffect(() => {
    let isActive = true;

    const scheduleNextPoll = () => {
      if (!isActive) return;
      const baseInterval = 4000;
      const backoffInterval = Math.min(30000, baseInterval * Math.pow(2, failureCountRef.current));
      const nextDelay = failureCountRef.current > 0 ? backoffInterval : baseInterval;

      pollTimerRef.current = setTimeout(async () => {
        if (!isActive) return;
        await fetchQueue();
        scheduleNextPoll();
      }, nextDelay);
    };

    void fetchQueue();
    scheduleNextPoll();

    return () => {
      isActive = false;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [fetchQueue]);

  const handleUserInteraction = () => {
    unlockAudio();
  };

  const handleToggleMute = () => {
    unlockAudio();
    const nextMuted = !muted;
    setMuted(nextMuted);
    setAudioMuted(nextMuted);
    if (!nextMuted) {
      playAlertChime();
    }
  };

  const handleToggleFullscreen = () => {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  const handleExitKiosk = () => {
    if (typeof window !== 'undefined') {
      window.location.hash = '';
      window.location.pathname = '/';
    }
  };

  const isStale = Date.now() - lastUpdatedTime > 60000;
  const primaryServing = data?.nowServing?.[0];
  const otherServing = data?.nowServing?.slice(1) || [];
  const upNextList = data?.upNext || [];

  return (
    <View
      style={styles.root}
      onTouchStart={handleUserInteraction}
      {...(Platform.OS === 'web' ? { onClick: handleUserInteraction } : {})}
    >
      {/* Header Bar */}
      <View style={styles.header}>
        <View style={styles.brandRow}>
          {data?.logoUrl ? (
            <Image
              source={{ uri: data.logoUrl }}
              style={styles.clinicLogo}
              resizeMode="contain"
            />
          ) : (
            <CoBrandedLogo
              clinicName={data?.clinicName || 'Clinic EZ'}
              size={48}
              variant="squircle"
            />
          )}
          <View>
            <Text style={styles.clinicTitle}>{data?.clinicName || 'Clinic EZ Healthcare'}</Text>
            <View style={styles.liveBadgeRow}>
              <View
                style={[
                  styles.livePill,
                  {
                    backgroundColor: isStale ? darkColors.warningBg : darkColors.primaryLight,
                  },
                ]}
              >
                <View
                  style={[
                    styles.pingDot,
                    {
                      backgroundColor: isStale ? darkColors.warningText : darkColors.primary,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.livePillText,
                    {
                      color: isStale ? darkColors.warningText : darkColors.primary,
                    },
                  ]}
                >
                  {isStale ? 'Syncing...' : 'Live LAN Queue Kiosk'}
                </Text>
              </View>
              <Text style={styles.waitingCountText}>
                {data?.patientsWaitingCount || 0} waiting in line
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.clockBox}>
            <Text style={styles.clockTime}>{currentTime}</Text>
            <Text style={styles.clockDate}>{currentDate}</Text>
          </View>

          <View style={styles.actionsBox}>
            <TouchableOpacity
              style={[
                styles.controlBtn,
                {
                  backgroundColor: muted ? darkColors.surfaceHighlight : darkColors.primarySubtle,
                  borderColor: muted ? darkColors.border : darkColors.primaryBorder,
                },
              ]}
              onPress={handleToggleMute}
              accessibilityLabel={muted ? 'Unmute Audio' : 'Mute Audio'}
            >
              <Icon
                name={muted ? 'volumeX' : 'volume2'}
                size={22}
                color={muted ? darkColors.textMuted : darkColors.primary}
              />
            </TouchableOpacity>

            {Platform.OS === 'web' && (
              <TouchableOpacity
                style={styles.controlBtn}
                onPress={handleToggleFullscreen}
                accessibilityLabel={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                <Icon
                  name={isFullscreen ? 'minimize' : 'maximize'}
                  size={22}
                  color={darkColors.textSecondary}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      {/* Network Warning Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <Icon name="alertCircle" size={16} color={darkColors.warningText} />
          <Text style={styles.errorText}>{error} Retrying automatically...</Text>
        </View>
      )}

      {/* Main 2-Column Split Layout */}
      <View style={styles.mainGrid}>
        {/* Left Column (60%): NOW SERVING */}
        <View style={styles.servingCol}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>NOW SERVING</Text>
              <Text style={styles.sectionSubtitle}>Kasalukuyang Tinatawag</Text>
            </View>
            {primaryServing && (
              <View style={styles.inConsultationBadge}>
                <Text style={styles.inConsultationText}>In Consultation</Text>
              </View>
            )}
          </View>

          {primaryServing ? (
            <View
              style={[
                styles.servingCard,
                pulseActive && { borderColor: darkColors.primary, borderWidth: 3 },
              ]}
            >
              <View style={styles.ticketBox}>
                <Text style={styles.ticketLabel}>TICKET NUMBER / NUMERO NG TIKET</Text>
                <Text style={styles.ticketHero}>{primaryServing.ticketNumber}</Text>
              </View>

              <View style={styles.attributionGrid}>
                {/* Station / Room */}
                <View style={styles.attributionItem}>
                  <View style={styles.attrIconBox}>
                    <Icon name="mapPin" size={24} color={darkColors.primary} />
                  </View>
                  <View style={styles.attrTextBox}>
                    <Text style={styles.attrCaption}>STATION / ROOM</Text>
                    <Text style={styles.attrValue} numberOfLines={1}>
                      {primaryServing.roomOrStation || 'Consultation Room 1'}
                    </Text>
                  </View>
                </View>

                {/* Doctor */}
                <View style={styles.attributionItem}>
                  <View style={styles.attrIconBox}>
                    <Icon name="stethoscope" size={24} color={darkColors.primary} />
                  </View>
                  <View style={styles.attrTextBox}>
                    <Text style={styles.attrCaption}>ATTENDING PHYSICIAN</Text>
                    <Text style={styles.attrValue} numberOfLines={1}>
                      {primaryServing.doctorName || 'Attending Physician'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Other concurrently serving stations */}
              {otherServing.length > 0 && (
                <View style={styles.concurrentBox}>
                  <Text style={styles.concurrentCaption}>ALSO SERVING AT OTHER STATIONS:</Text>
                  <View style={styles.concurrentGrid}>
                    {otherServing.map((item) => (
                      <View key={item.queueItemId} style={styles.concurrentCard}>
                        <Text style={styles.concurrentTicket}>{item.ticketNumber}</Text>
                        <Text style={styles.concurrentRoom} numberOfLines={1}>
                          {item.roomOrStation || 'Exam Room'}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyServingCard}>
              <Icon name="clock" size={48} color={darkColors.primary} />
              <Text style={styles.emptyServingTitle}>No Active Patient Called</Text>
              <Text style={styles.emptyServingSubtitle}>
                Please wait for your ticket number to be called.
              </Text>
            </View>
          )}
        </View>

        {/* Right Column (40%): UP NEXT */}
        <View style={styles.upNextCol}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>UP NEXT</Text>
              <Text style={styles.sectionSubtitle}>Susunod Na Tiket</Text>
            </View>
            <View style={styles.queueOrderBadge}>
              <Text style={styles.queueOrderText}>Queue Order</Text>
            </View>
          </View>

          <View style={styles.upNextContainer}>
            {upNextList.length > 0 ? (
              <ScrollView style={styles.upNextScroll} contentContainerStyle={styles.upNextList}>
                {upNextList.slice(0, 10).map((ticket, idx) => {
                  const isUrgent = ticket.priority.toLowerCase() === 'urgent';
                  const isEmergency = ticket.priority.toLowerCase() === 'emergency';
                  const isOnHold = ticket.status.toLowerCase() === 'onhold';

                  const badgeBg = isEmergency
                    ? darkColors.emergencyBg
                    : isUrgent
                    ? darkColors.urgentBg
                    : darkColors.routineBg;
                  const badgeText = isEmergency
                    ? darkColors.emergencyText
                    : isUrgent
                    ? darkColors.urgentText
                    : darkColors.routineText;
                  const badgeBorder = isEmergency
                    ? darkColors.emergencyBorder
                    : isUrgent
                    ? darkColors.urgentBorder
                    : darkColors.routineBorder;

                  return (
                    <View
                      key={ticket.queueItemId}
                      style={[
                        styles.upNextCard,
                        idx === 0 && { backgroundColor: darkColors.surfaceHighlight },
                        { borderColor: badgeBorder },
                      ]}
                    >
                      <View style={styles.upNextLeft}>
                        <View style={styles.indexCircle}>
                          <Text style={styles.indexText}>{idx + 1}</Text>
                        </View>
                        <View>
                          <Text
                            style={[
                              styles.upNextTicket,
                              {
                                color: isEmergency
                                  ? darkColors.emergency
                                  : isUrgent
                                  ? darkColors.urgent
                                  : darkColors.text,
                              },
                            ]}
                          >
                            {ticket.ticketNumber}
                          </Text>
                          <Text style={styles.upNextName} numberOfLines={1}>
                            {ticket.displayName}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.upNextRight}>
                        <View
                          style={[
                            styles.priorityBadge,
                            {
                              backgroundColor: badgeBg,
                              borderColor: badgeBorder,
                            },
                          ]}
                        >
                          <Text style={[styles.priorityText, { color: badgeText }]}>
                            {ticket.priority}
                          </Text>
                        </View>
                        <Text style={styles.upNextStatus}>
                          {isOnHold ? 'On Hold' : ticket.status}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.emptyUpNext}>
                <Icon name="clock" size={36} color={darkColors.textMuted} />
                <Text style={styles.emptyUpNextTitle}>Queue Line is Empty</Text>
                <Text style={styles.emptyUpNextSub}>
                  Upcoming registered tickets will appear here automatically.
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Footer Ticker */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerHighlight}>INSTRUCTIONS:</Text>
          <Text style={styles.footerNote}>
            Please prepare your PhilHealth ID or QR pass and wait for your ticket to be called.
          </Text>
        </View>

        <View style={styles.footerRight}>
          <Text style={styles.footerMode}>Display: LAN Kiosk (1080p/4K)</Text>
          <View style={styles.autoRefreshPill}>
            <View style={styles.refreshDot} />
            <Text style={styles.autoRefreshText}>Auto-refresh: 4s</Text>
          </View>
          <TouchableOpacity onPress={handleExitKiosk} style={styles.staffLink}>
            <Text style={styles.staffLinkText}>Staff Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: darkColors.background,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: darkColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    flexWrap: 'wrap',
    gap: 12,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  clinicLogo: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md - 2,
  },
  clinicTitle: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: '800',
    color: darkColors.text,
    letterSpacing: -0.5,
  },
  liveBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radii.lg - 2,
    gap: 6,
  },
  pingDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.xs - 1,
  },
  livePillText: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  waitingCountText: {
    fontSize: theme.fontSizes.xs,
    color: darkColors.textMuted,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  clockBox: {
    alignItems: 'flex-end',
  },
  clockTime: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    color: darkColors.text,
  },
  clockDate: {
    fontSize: theme.fontSizes.xs,
    color: darkColors.textSecondary,
    fontWeight: '500',
  },
  actionsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  controlBtn: {
    padding: 10,
    borderRadius: theme.radii.md - 2,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.surfaceHighlight,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: darkColors.warningBg,
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.warningBorder,
  },
  errorText: {
    fontSize: theme.fontSizes.sm,
    color: darkColors.warningText,
    fontWeight: '600',
  },
  mainGrid: {
    flex: 1,
    flexDirection: 'row',
    padding: 24,
    gap: 24,
  },
  servingCol: {
    flex: 6,
    gap: 16,
  },
  upNextCol: {
    flex: 4,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: theme.fontSizes['3xl'],
    fontWeight: '900',
    color: darkColors.text,
    letterSpacing: -0.5,
  },
  sectionSubtitle: {
    fontSize: theme.fontSizes.md,
    color: darkColors.textMuted,
    fontWeight: '500',
  },
  inConsultationBadge: {
    backgroundColor: darkColors.primaryLight,
    borderColor: darkColors.primaryBorder,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: theme.radii.xl - 2,
  },
  inConsultationText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: darkColors.primary,
    textTransform: 'uppercase',
  },
  servingCard: {
    flex: 1,
    backgroundColor: darkColors.surface,
    borderColor: darkColors.border,
    borderWidth: 2,
    borderRadius: theme.radii['2xl'],
    padding: 24,
    justifyContent: 'space-between',
  },
  ticketBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  ticketLabel: {
    fontSize: theme.fontSizes.md,
    fontWeight: '700',
    color: darkColors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  ticketHero: {
    fontSize: theme.fontSizes['4xl'] * 2.67,
    fontWeight: '900',
    color: darkColors.primary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    letterSpacing: -2,
    lineHeight: 104,
  },
  attributionGrid: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: darkColors.surfaceHighlight,
    padding: 16,
    borderRadius: theme.radii.xl - 2,
    borderWidth: 1,
    borderColor: darkColors.border,
  },
  attributionItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  attrIconBox: {
    width: 44,
    height: 44,
    borderRadius: theme.radii.lg - 2,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attrTextBox: {
    flex: 1,
  },
  attrCaption: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '700',
    color: darkColors.textMuted,
    letterSpacing: 0.5,
  },
  attrValue: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '800',
    color: darkColors.text,
  },
  concurrentBox: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
    paddingTop: 12,
  },
  concurrentCaption: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '700',
    color: darkColors.textMuted,
    marginBottom: 8,
  },
  concurrentGrid: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  concurrentCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: darkColors.surfaceHighlight,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  concurrentTicket: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '800',
    color: darkColors.primary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  concurrentRoom: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '600',
    color: darkColors.textSecondary,
  },
  emptyServingCard: {
    flex: 1,
    backgroundColor: darkColors.surface,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: darkColors.border,
    borderRadius: theme.radii['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  emptyServingTitle: {
    fontSize: theme.fontSizes['2xl'] + 2,
    fontWeight: '800',
    color: darkColors.text,
  },
  emptyServingSubtitle: {
    fontSize: theme.fontSizes.lg,
    color: darkColors.textSecondary,
    textAlign: 'center',
  },
  queueOrderBadge: {
    backgroundColor: darkColors.surfaceHighlight,
    borderColor: darkColors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: theme.radii.lg - 2,
  },
  queueOrderText: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '700',
    color: darkColors.textSecondary,
    textTransform: 'uppercase',
  },
  upNextContainer: {
    flex: 1,
    backgroundColor: darkColors.surface,
    borderWidth: 2,
    borderColor: darkColors.border,
    borderRadius: theme.radii['2xl'],
    padding: 16,
  },
  upNextScroll: {
    flex: 1,
  },
  upNextList: {
    gap: 10,
  },
  upNextCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: theme.radii.lg,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
  },
  upNextLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  indexCircle: {
    width: 26,
    height: 26,
    borderRadius: theme.radii.lg - 1,
    backgroundColor: darkColors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: darkColors.textMuted,
  },
  upNextTicket: {
    fontSize: theme.fontSizes['2xl'] + 2,
    fontWeight: '900',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 26,
  },
  upNextName: {
    fontSize: theme.fontSizes.md + 1,
    fontWeight: '700',
    color: darkColors.textSecondary,
    marginTop: 2,
  },
  upNextRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
  },
  priorityText: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  upNextStatus: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '600',
    color: darkColors.textMuted,
  },
  emptyUpNext: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 24,
  },
  emptyUpNextTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '800',
    color: darkColors.text,
  },
  emptyUpNextSub: {
    fontSize: theme.fontSizes.sm,
    color: darkColors.textMuted,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
    flexWrap: 'wrap',
    gap: 8,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerHighlight: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '800',
    color: darkColors.text,
  },
  footerNote: {
    fontSize: theme.fontSizes.xs,
    color: darkColors.textSecondary,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  footerMode: {
    fontSize: theme.fontSizes.xs,
    color: darkColors.textMuted,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  autoRefreshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  refreshDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radii.xs - 1,
    backgroundColor: darkColors.primary,
  },
  autoRefreshText: {
    fontSize: theme.fontSizes.xs,
    color: darkColors.textSecondary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
  },
  staffLink: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  staffLinkText: {
    fontSize: theme.fontSizes.xs,
    color: darkColors.textMuted,
    textDecorationLine: 'underline',
  },
});
