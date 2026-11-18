import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
  Image,
  useWindowDimensions,
} from 'react-native';
import { darkColors } from '@clinicez/design-tokens';
import { theme } from '../../constants/theme';
import Button from '../../components/ui/Button';
import Icon from '../../components/ui/Icon';
import { clinicService } from '../../services/clinicService';
import { isAudioMuted, setAudioMuted, playAlertChime, playQueueCallAlert, unlockAudio } from '../../utils/audioChime';
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
  isPinRequired?: boolean;
  isPinValid?: boolean;
  tvDisplaySoundTheme?: string;
  tvDisplayVoiceEnabled?: boolean;
  tvDisplayShowPhysicianName?: boolean;
}

const PIN_STORAGE_KEY = 'clinicez_tv_pin_lan';

function getStoredPin(): string {
  if (typeof window !== 'undefined') {
    try {
      const url = new URL(window.location.href);
      const qPin = url.searchParams.get('pin');
      if (qPin) return qPin;
      if (window.location.hash.includes('?')) {
        const hashSearch = window.location.hash.split('?')[1];
        const hashParams = new URLSearchParams(hashSearch);
        const hPin = hashParams.get('pin');
        if (hPin) return hPin;
      }
      return localStorage.getItem(PIN_STORAGE_KEY) || '';
    } catch {}
  }
  return '';
}

export default function PublicQueueDisplayScreen() {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const [data, setData] = useState<PublicQueueDisplayData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState<boolean>(isAudioMuted);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDate, setCurrentDate] = useState<string>('');
  const [lastUpdatedTime, setLastUpdatedTime] = useState<number>(Date.now());
  const [pulsingTicketIds, setPulsingTicketIds] = useState<string[]>([]);
  const alertTimeoutsRef = useRef<NodeJS.Timeout[]>([]);

  // PIN / Passcode state
  const [pin, setPin] = useState<string>(getStoredPin);
  const [pinEntry, setPinEntry] = useState<string>('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [unlocking, setUnlocking] = useState<boolean>(false);

  const isInitialMountRef = useRef<boolean>(true);
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

  // Cleanup alert timeouts on unmount
  useEffect(() => {
    return () => {
      alertTimeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  // Data fetching and ticket advancement detection
  const fetchQueue = useCallback(async (pinOverride?: string) => {
    const activePin = pinOverride !== undefined ? pinOverride : pin;
    try {
      const [res, err] = await clinicService.getPublicQueueDisplay(undefined, undefined, undefined, activePin || undefined);
      if (err || !res) {
        failureCountRef.current += 1;
        setError(err?.message || 'Unable to sync queue updates.');
        setLoading(false);
        return;
      }

      failureCountRef.current = 0;
      setError(null);
      setLastUpdatedTime(Date.now());

      // If valid PIN was supplied, persist it; if invalid or required, clear stale storage
      if (activePin && res.isPinValid) {
        try {
          localStorage.setItem(PIN_STORAGE_KEY, activePin);
        } catch {}
      } else if (res.isPinRequired && !res.isPinValid) {
        try {
          localStorage.removeItem(PIN_STORAGE_KEY);
        } catch {}
      }

      const newServing: string[] = res.nowServing?.map((s: ServingTicket) => s.ticketNumber) || [];
      const prevServing = prevServingRef.current;

      // Audio & visual alerts when one or more tickets are newly called
      const newlyCalled: ServingTicket[] = res.nowServing?.filter((s: ServingTicket) => !prevServing.includes(s.ticketNumber)) || [];
      if (!isInitialMountRef.current && newlyCalled.length > 0) {
        // Sequentially announce each newly called patient and keep the card glow active
        // for that specific ticket until its announcement finishes
        newlyCalled.forEach((ticket: ServingTicket, idx: number) => {
          const alertTimer = setTimeout(() => {
            playQueueCallAlert({
              theme: res.tvDisplaySoundTheme || 'classicChime',
              voiceEnabled: res.tvDisplayVoiceEnabled,
              ticketNumber: ticket.ticketNumber,
              roomOrStation: ticket.roomOrStation,
              doctorName: ticket.doctorName,
              onStart: () => {
                setPulsingTicketIds((prev) => Array.from(new Set([...prev, ticket.queueItemId])));
              },
              onEnd: () => {
                setPulsingTicketIds((prev) => prev.filter((id) => id !== ticket.queueItemId));
              },
            });
          }, idx * 3600);
          alertTimeoutsRef.current.push(alertTimer);
        });
      }

      isInitialMountRef.current = false;
      prevServingRef.current = newServing;
      setData(res);
      setLoading(false);
    } catch (e: any) {
      failureCountRef.current += 1;
      setError(e?.message || 'Network error fetching queue.');
      setLoading(false);
    }
  }, [pin]);

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

  // Physical keyboard support on web for PIN entry
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const isLocked = Boolean(data?.isPinRequired && !data?.isPinValid);
    if (!isLocked) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        setPinEntry((prev) => {
          if (prev.length >= 6) return prev;
          const next = prev + e.key;
          if (next.length === 6) {
            void handleUnlock(next);
          }
          return next;
        });
        setPinError(null);
      } else if (e.key === 'Backspace') {
        setPinEntry((prev) => prev.slice(0, -1));
        setPinError(null);
      } else if (e.key === 'Enter') {
        if (pinEntry.length > 0) {
          void handleUnlock(pinEntry);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [data?.isPinRequired, data?.isPinValid, pinEntry]);

  const handleUnlock = async (enteredPin: string) => {
    if (!enteredPin.trim()) return;
    setUnlocking(true);
    setPinError(null);
    try {
      const [res, err] = await clinicService.getPublicQueueDisplay(undefined, undefined, undefined, enteredPin.trim());
      setUnlocking(false);
      if (err || !res) {
        setPinError(err?.message || 'Unable to verify TV passcode.');
        return;
      }
      if (res.isPinRequired && !res.isPinValid) {
        setPinError('Incorrect TV passcode. Please verify in Clinic Settings.');
        return;
      }
      setPin(enteredPin.trim());
      setData(res);
      try {
        localStorage.setItem(PIN_STORAGE_KEY, enteredPin.trim());
      } catch {}
    } catch {
      setUnlocking(false);
      setPinError('Connection error verifying TV passcode.');
    }
  };

  const handleLockBoard = () => {
    try {
      localStorage.removeItem(PIN_STORAGE_KEY);
    } catch {}
    setPin('');
    setPinEntry('');
    setPinError(null);
    void fetchQueue('');
  };

  const handleUserInteraction = () => {
    unlockAudio();
  };

  const handleToggleMute = () => {
    unlockAudio();
    const nextMuted = !muted;
    setMuted(nextMuted);
    setAudioMuted(nextMuted);
    if (!nextMuted) {
      playAlertChime(data?.tvDisplaySoundTheme || 'classicChime');
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
  const isLocked = Boolean(data?.isPinRequired && !data?.isPinValid);
  const primaryServing = data?.nowServing?.[0];
  const otherServing = data?.nowServing?.slice(1) || [];
  const upNextList = data?.upNext || [];
  const pulseActive = primaryServing ? pulsingTicketIds.includes(primaryServing.queueItemId) : false;

  const safeWidth = windowWidth > 0 ? windowWidth : 1280;
  const safeHeight = windowHeight > 0 ? windowHeight : 800;
  const hasUpNext = upNextList.length > 0;
  // Breakpoint strictly by screen size (<1024px) - Up Next column remains visible on widescreen displays to maintain balanced 65/35 grid layout
  const isCompact = safeWidth < 1024;

  // Responsive padding to squeeze content inwards from top, sides, and bottom
  const bodyPaddingHorizontal = Math.max(28, Math.min(64, Math.round(safeWidth * 0.04)));
  const bodyPaddingVertical = Math.max(20, Math.min(44, Math.round(safeHeight * 0.04)));

  // Equal height constraint so Now Serving and Up Next match and avoid overly tall cards
  const contentMaxHeight = Math.min(640, Math.max(400, Math.round((safeHeight - 110) * 0.84)));

  const headerNowServingFontSize = Math.max(
    theme.fontSizes['2xl'],
    Math.min(theme.fontSizes['3xl'] + 2, Math.round(safeWidth * 0.02))
  );
  const sectionTitleFontSize = Math.max(
    theme.fontSizes.xl,
    Math.min(theme.fontSizes['3xl'] + 2, Math.round(safeWidth * 0.024))
  );
  const sectionSubtitleFontSize = Math.max(
    theme.fontSizes.xs,
    Math.min(theme.fontSizes.md, Math.round(safeWidth * 0.011))
  );

  // Dynamic ticket number font size calculation to guarantee zero truncation and zero overflow
  const getTicketFontSize = (ticketNum: string, stationCount: number) => {
    const len = Math.max(ticketNum?.length || 5, 4);
    const colWidth = isCompact ? safeWidth * 0.95 : safeWidth * 0.65;
    const cols = stationCount === 1 ? 1 : stationCount === 2 ? 2 : Math.min(stationCount, 3);
    const cardWidth = (colWidth - (cols - 1) * 20 - 48) / cols;
    // Monospace character width is ~0.62 * fontSize
    const maxFontByWidth = Math.floor((cardWidth - 28) / (len * 0.62));

    if (stationCount === 1) {
      return Math.min(96, Math.max(52, maxFontByWidth));
    } else if (stationCount === 2) {
      return Math.min(60, Math.max(34, maxFontByWidth));
    } else if (stationCount === 3) {
      return Math.min(46, Math.max(26, maxFontByWidth));
    } else {
      return Math.min(36, Math.max(22, maxFontByWidth));
    }
  };

  return (
    <View
      style={styles.root}
      onTouchStart={handleUserInteraction}
      {...(Platform.OS === 'web' ? { onClick: handleUserInteraction } : {})}
    >
      {Platform.OS === 'web' && (
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @keyframes cardFadeIn {
                from { opacity: 0; transform: scale(0.96) translateY(8px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
              }
              @keyframes cardPulseGlow {
                0%, 100% {
                  box-shadow: 0 0 20px ${darkColors.primaryBorder};
                  border-color: ${darkColors.primaryBorder};
                }
                50% {
                  box-shadow: 0 0 45px ${darkColors.primary}, 0 0 15px ${darkColors.primaryHover};
                  border-color: ${darkColors.primary};
                }
              }
            `,
          }}
        />
      )}
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
          <View style={styles.brandTitleContainer}>
            <Text
              style={[
                styles.clinicTitle,
                { fontSize: headerNowServingFontSize },
              ]}
              numberOfLines={1}
            >
              NOW SERVING
            </Text>
            {(isLocked || isStale) && (
              <View style={styles.liveBadgeRow}>
                <View
                  style={[
                    styles.livePill,
                    { backgroundColor: darkColors.warningBg },
                  ]}
                >
                  <View
                    style={[
                      styles.pingDot,
                      { backgroundColor: darkColors.warningText },
                    ]}
                  />
                  <Text
                    style={[
                      styles.livePillText,
                      { color: darkColors.warningText },
                    ]}
                  >
                    {isLocked ? 'Locked (Passcode Required)' : 'Syncing...'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>

        <View style={styles.controlsRow}>
          <View style={styles.clockBox}>
            <Text style={styles.clockTime}>{currentTime}</Text>
            <Text style={styles.clockDate}>{currentDate}</Text>
          </View>

          <View style={styles.actionsBox}>
            {/* Lock / Relock Button */}
            {!isLocked && data?.isPinRequired && (
              <Button
                variant="subtle"
                size="md"
                icon="lock"
                iconOnly
                onPress={handleLockBoard}
                accessibilityLabel="Lock TV Display Board"
                style={styles.controlBtn}
              />
            )}

            <Button
              variant={muted ? 'subtle' : 'outline'}
              size="md"
              icon={muted ? 'volumeX' : 'volume2'}
              iconOnly
              onPress={handleToggleMute}
              accessibilityLabel={muted ? 'Unmute Audio' : 'Mute Audio'}
              style={[
                styles.controlBtn,
                {
                  backgroundColor: muted ? darkColors.surfaceHighlight : darkColors.primarySubtle,
                  borderColor: muted ? darkColors.border : darkColors.primaryBorder,
                },
              ]}
            />

            {Platform.OS === 'web' && (
              <Button
                variant="subtle"
                size="md"
                icon={isFullscreen ? 'minimize' : 'maximize'}
                iconOnly
                onPress={handleToggleFullscreen}
                accessibilityLabel={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                style={styles.controlBtn}
              />
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

      {/* Main Content: Lock Keypad or 2-Column Split Layout */}
      {isLocked ? (
        <View style={styles.lockContainer}>
          <View style={styles.lockCard}>
            <View style={styles.lockIconBox}>
              <Icon name="lock" size={36} color={darkColors.primary} />
            </View>
            <Text style={styles.lockTitle}>TV Display Board Locked</Text>
            <Text style={styles.lockSubtitle}>
              This waiting area queue board is protected. Enter the 6-digit TV passcode configured in Clinic Settings to view live queue tickets.
            </Text>

            {/* PIN Dots */}
            <View style={styles.pinDotsRow}>
              {[0, 1, 2, 3, 4, 5].map((idx) => {
                const isFilled = idx < pinEntry.length;
                return (
                  <View
                    key={idx}
                    style={[
                      styles.pinDot,
                      isFilled && styles.pinDotFilled,
                    ]}
                  >
                    {isFilled && <View style={styles.pinDotInner} />}
                  </View>
                );
              })}
            </View>

            {pinError && (
              <View style={styles.lockErrorBanner}>
                <Icon name="alertCircle" size={16} color={darkColors.warningText} />
                <Text style={styles.lockErrorText}>{pinError}</Text>
              </View>
            )}

            {/* Numeric Keypad */}
            <View style={styles.keypadGrid}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                <Pressable
                  key={digit}
                  accessibilityRole="button"
                  accessibilityLabel={`Digit ${digit}`}
                  style={styles.keypadBtn}
                  onPress={() => {
                    setPinEntry((prev) => {
                      if (prev.length >= 6) return prev;
                      const next = prev + digit;
                      if (next.length === 6) {
                        void handleUnlock(next);
                      }
                      return next;
                    });
                    setPinError(null);
                  }}
                >
                  <Text style={styles.keypadDigit}>{digit}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Clear passcode"
                style={styles.keypadActionBtn}
                onPress={() => {
                  setPinEntry('');
                  setPinError(null);
                }}
              >
                <Text style={styles.keypadActionText}>Clear</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Digit 0"
                style={styles.keypadBtn}
                onPress={() => {
                  setPinEntry((prev) => {
                    if (prev.length >= 6) return prev;
                    const next = prev + '0';
                    if (next.length === 6) {
                      void handleUnlock(next);
                    }
                    return next;
                  });
                  setPinError(null);
                }}
              >
                <Text style={styles.keypadDigit}>0</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Backspace"
                style={styles.keypadActionBtn}
                onPress={() => {
                  setPinEntry((prev) => prev.slice(0, -1));
                  setPinError(null);
                }}
              >
                <Icon name="arrowLeft" size={20} color={darkColors.textSecondary} />
              </Pressable>
            </View>

            {/* Submit / Unlock Button */}
            <Button
              title={unlocking ? 'Verifying Passcode...' : 'Unlock TV Display'}
              variant="primary"
              size="lg"
              loading={unlocking}
              disabled={pinEntry.length === 0 || unlocking}
              onPress={() => handleUnlock(pinEntry)}
              style={styles.unlockBtn}
            />
          </View>
        </View>
      ) : (
        <View
          style={[
            styles.mainGrid,
            {
              paddingHorizontal: bodyPaddingHorizontal,
              paddingVertical: bodyPaddingVertical,
            },
          ]}
        >
          <View
            style={[
              styles.contentWrapper,
              { maxHeight: contentMaxHeight },
            ]}
          >
            {/* Left Column: Active Stations (NOW SERVING) */}
            <View style={[styles.servingCol, isCompact && styles.servingColCompact]}>
          {!primaryServing ? (
            <View style={styles.emptyServingCard}>
              <Icon name="clock" size={48} color={darkColors.primary} />
              <Text style={styles.emptyServingTitle}>No Active Patient Called</Text>
              <Text style={styles.emptyServingSubtitle}>
                Please wait for your ticket number to be called.
              </Text>
            </View>
          ) : data?.nowServing && data.nowServing.length > 1 ? (
            /* Multi-Station Equal Prominence Flexbox (Responsive, Zero-Scroll) */
            <View style={styles.multiStationContainer}>
              {data.nowServing.map((item) => {
                const isItemPulsing = pulsingTicketIds.includes(item.queueItemId);
                const count = data.nowServing.length;
                return (
                  <View
                    key={item.queueItemId}
                    style={[
                      styles.stationCard,
                      count === 2 && styles.stationCard2Up,
                      count === 3 && styles.stationCard3Up,
                      count === 4 && styles.stationCard4Up,
                      count >= 5 && styles.stationCard5Plus,
                      isItemPulsing && styles.stationCardPulsing,
                    ]}
                  >
                    {/* Header: Station & Status */}
                    <View style={styles.stationCardHeader}>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.stationCaption} numberOfLines={1}>
                          STATION / ROOM
                        </Text>
                        <Text style={styles.stationName} numberOfLines={1}>
                          {item.roomOrStation || '—'}
                        </Text>
                      </View>
                      {isItemPulsing && (
                        <View style={styles.stationStatusBadgePulsing}>
                          <Text style={styles.stationStatusTextPulsing}>JUST CALLED</Text>
                        </View>
                      )}
                    </View>

                    {/* Center: Ticket Number */}
                    <View style={styles.stationTicketBox}>
                      <Text style={styles.stationTicketLabel} numberOfLines={1}>
                        TICKET NUMBER
                      </Text>
                      <Text
                        style={[
                          styles.stationTicketNumber,
                          { fontSize: getTicketFontSize(item.ticketNumber, count) },
                        ]}
                      >
                        {item.ticketNumber}
                      </Text>
                    </View>

                    {/* Footer: Attending Physician */}
                    {data?.tvDisplayShowPhysicianName !== false && (
                      <View style={styles.stationFooter}>
                        <Text style={styles.stationDoctorCaption} numberOfLines={1}>
                          ATTENDING PHYSICIAN
                        </Text>
                        <Text style={styles.stationDoctorText} numberOfLines={1}>
                          {item.doctorName || '—'}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            /* Single Station Clean Display */
            <View
              style={[
                styles.servingCard,
                pulseActive && { borderColor: darkColors.primary, borderWidth: 3 },
              ]}
            >
              {/* Header: Station & Status */}
              <View style={styles.singleCardHeader}>
                <View>
                  <Text style={styles.stationCaption} numberOfLines={1}>
                    STATION / ROOM
                  </Text>
                  <Text style={styles.singleStationName} numberOfLines={1}>
                    {primaryServing.roomOrStation || '—'}
                  </Text>
                </View>
                {pulseActive && (
                  <View style={styles.stationStatusBadgePulsing}>
                    <Text style={styles.stationStatusTextPulsing}>JUST CALLED</Text>
                  </View>
                )}
              </View>

              {/* Center: Hero Ticket Number */}
              <View style={styles.ticketBox}>
                <Text style={styles.ticketLabel} numberOfLines={1}>
                  TICKET NUMBER
                </Text>
                <Text
                  style={[
                    styles.ticketHero,
                    { fontSize: getTicketFontSize(primaryServing.ticketNumber, 1) },
                  ]}
                >
                  {primaryServing.ticketNumber}
                </Text>
              </View>

              {/* Footer: Attending Physician */}
              {data?.tvDisplayShowPhysicianName !== false && (
                <View style={styles.singleCardFooter}>
                  <Text style={styles.stationDoctorCaption} numberOfLines={1}>
                    ATTENDING PHYSICIAN
                  </Text>
                  <Text style={styles.singleDoctorName} numberOfLines={1}>
                    {primaryServing.doctorName || '—'}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* Right Column: UP NEXT (Visible on widescreen displays) */}
        {!isCompact && (
        <View style={styles.upNextCol}>
          <View style={styles.upNextContainer}>
            <View style={styles.upNextCardHeader}>
              <Text
                style={[
                  styles.sectionTitle,
                  { fontSize: sectionTitleFontSize },
                ]}
                numberOfLines={1}
              >
                UP NEXT
              </Text>
            </View>

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
        )}
          </View>
        </View>
      )}

      {/* Footer Ticker */}
      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          <Text style={styles.footerNote}>
            Please wait for your ticket number to be called.
          </Text>
        </View>

        <View style={styles.footerRight}>
          <View style={styles.autoRefreshPill}>
            <View style={styles.refreshDot} />
            <Text style={styles.autoRefreshText}>Live</Text>
          </View>
          <Button
            title="Staff Sign In"
            variant="ghost"
            size="xs"
            onPress={handleExitKiosk}
            style={styles.staffLink}
            textStyle={styles.staffLinkText}
          />
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: darkColors.surface,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
    flexWrap: 'nowrap',
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
  brandTitleContainer: {
    justifyContent: 'center',
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
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  clockBox: {
    alignItems: 'flex-end',
  },
  clockTime: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '700',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    color: darkColors.text,
  },
  clockDate: {
    fontSize: theme.fontSizes.xs - 1,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
    flexDirection: 'row',
    gap: 24,
  },
  servingCol: {
    flex: 65,
    height: '100%',
    gap: 20,
  },
  servingColCompact: {
    flex: 1,
  },
  upNextCol: {
    flex: 35,
    height: '100%',
    gap: 20,
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
  servingCard: {
    flex: 1,
    height: '100%',
    backgroundColor: darkColors.surface,
    borderColor: darkColors.border,
    borderWidth: 2,
    borderRadius: theme.radii['2xl'],
    padding: 24,
    justifyContent: 'space-between',
  },
  ticketBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    width: '100%',
  },
  ticketLabel: {
    fontSize: theme.fontSizes.md,
    fontWeight: '700',
    color: darkColors.textMuted,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  ticketHero: {
    fontSize: theme.fontSizes['4xl'] * 2.2,
    fontWeight: '900',
    color: darkColors.primary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    letterSpacing: -2,
    textAlign: 'center',
    ...(Platform.OS === 'web'
      ? ({
          whiteSpace: 'nowrap' as any,
          wordBreak: 'keep-all' as any,
          textOverflow: 'clip' as any,
        } as any)
      : {}),
  },
  ticketHeroCompact: {
    fontSize: theme.fontSizes['4xl'] * 1.8,
    lineHeight: 76,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any, wordBreak: 'keep-all' as any } : {}),
  },
  singleCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  singleStationName: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: '800',
    color: darkColors.text,
    marginTop: 2,
  },
  stationCaption: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '700',
    color: darkColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  stationName: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '800',
    color: darkColors.text,
    marginTop: 2,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  stationStatusBadge: {
    backgroundColor: darkColors.surfaceHighlight,
    borderColor: darkColors.border,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: theme.radii.full,
  },
  stationStatusBadgePulsing: {
    backgroundColor: darkColors.primaryLight,
    borderColor: darkColors.primaryBorder,
  },
  stationStatusText: {
    fontSize: theme.fontSizes.xs,
    fontWeight: '700',
    color: darkColors.textSecondary,
    textTransform: 'uppercase',
  },
  stationStatusTextPulsing: {
    color: darkColors.primary,
  },
  singleCardFooter: {
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  singleDoctorName: {
    fontSize: theme.fontSizes.xl,
    fontWeight: '800',
    color: darkColors.text,
    marginTop: 2,
  },
  stationDoctorCaption: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '700',
    color: darkColors.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  multiStationContainer: {
    flex: 1,
    height: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    overflow: 'hidden',
  },
  stationCard: {
    flexGrow: 1,
    flexShrink: 1,
    backgroundColor: darkColors.surface,
    borderColor: darkColors.border,
    borderWidth: 2,
    borderRadius: theme.radii['2xl'],
    padding: 20,
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...(Platform.OS === 'web'
      ? ({
          transitionProperty: 'all',
          transitionDuration: '400ms',
          transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          animationKeyframes: 'cardFadeIn',
          animationDuration: '350ms',
          animationTimingFunction: 'ease-out',
        } as any)
      : {}),
  },
  stationCard2Up: {
    flexBasis: '47%',
    height: '100%',
    padding: 24,
  },
  stationCard3Up: {
    flexBasis: '31%',
    height: '100%',
    padding: 18,
  },
  stationCard4Up: {
    flexBasis: '47%',
    height: '47%',
    padding: 16,
  },
  stationCard5Plus: {
    flexBasis: '31%',
    height: '47%',
    padding: 14,
  },
  stationCardPulsing: {
    borderColor: darkColors.primary,
    borderWidth: 3,
    backgroundColor: darkColors.surfaceHighlight,
    ...(Platform.OS === 'web'
      ? ({
          boxShadow: `0 0 35px ${darkColors.primaryLight}, 0 0 15px ${darkColors.primary}`,
          animationKeyframes: 'cardPulseGlow',
          animationDuration: '1600ms',
          animationTimingFunction: 'ease-in-out',
          animationIterationCount: 'infinite',
        } as any)
      : {}),
  },
  stationCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  stationTicketBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    width: '100%',
    overflow: 'hidden',
  },
  stationTicketLabel: {
    fontSize: theme.fontSizes.xs - 1,
    fontWeight: '700',
    color: darkColors.textMuted,
    letterSpacing: 1,
    marginBottom: 6,
    ...(Platform.OS === 'web' ? { whiteSpace: 'nowrap' as any } : {}),
  },
  stationTicketNumber: {
    fontWeight: '900',
    color: darkColors.primary,
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    letterSpacing: -1,
    textAlign: 'center',
    ...(Platform.OS === 'web'
      ? ({
          whiteSpace: 'nowrap' as any,
          wordBreak: 'keep-all' as any,
          textOverflow: 'clip' as any,
        } as any)
      : {}),
  },
  stationFooter: {
    paddingTop: 12,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  stationDoctorText: {
    fontSize: theme.fontSizes.md,
    fontWeight: '800',
    color: darkColors.text,
    marginTop: 2,
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
  upNextContainer: {
    flex: 1,
    height: '100%',
    backgroundColor: darkColors.surface,
    borderWidth: 2,
    borderColor: darkColors.border,
    borderRadius: theme.radii['2xl'],
    padding: 20,
  },
  upNextCardHeader: {
    paddingBottom: 14,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  upNextScroll: {
    flex: 1,
  },
  upNextList: {
    gap: 16,
  },
  upNextCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: theme.radii.xl,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
  },
  upNextLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    flex: 1,
  },
  indexCircle: {
    width: 28,
    height: 28,
    borderRadius: theme.radii.lg,
    backgroundColor: darkColors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: darkColors.textMuted,
  },
  upNextTicket: {
    fontSize: theme.fontSizes['2xl'] + 2,
    fontWeight: '900',
    fontFamily: Platform.OS === 'web' ? 'monospace' : undefined,
    lineHeight: 26,
    ...(Platform.OS === 'web'
      ? ({
          whiteSpace: 'nowrap' as any,
          textOverflow: 'clip' as any,
        } as any)
      : {}),
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
  lockContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  lockCard: {
    width: '100%',
    maxWidth: 440,
    backgroundColor: darkColors.surface,
    borderColor: darkColors.border,
    borderWidth: 1,
    borderRadius: theme.radii['2xl'],
    padding: 32,
    alignItems: 'center',
  },
  lockIconBox: {
    width: 68,
    height: 68,
    borderRadius: theme.radii.full,
    backgroundColor: darkColors.surfaceHighlight,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  lockTitle: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: '800',
    color: darkColors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  lockSubtitle: {
    fontSize: theme.fontSizes.sm,
    color: darkColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  pinDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 20,
  },
  pinDot: {
    width: 18,
    height: 18,
    borderRadius: theme.radii.full,
    borderWidth: 2,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    borderColor: darkColors.primary,
  },
  pinDotInner: {
    width: 10,
    height: 10,
    borderRadius: theme.radii.full,
    backgroundColor: darkColors.primary,
  },
  lockErrorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: darkColors.emergencyBg,
    borderColor: darkColors.emergencyBorder,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: theme.radii.md,
    marginBottom: 16,
    width: '100%',
  },
  lockErrorText: {
    fontSize: theme.fontSizes.xs,
    color: darkColors.emergencyText,
    fontWeight: '600',
    flex: 1,
  },
  keypadGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 320,
    marginBottom: 20,
  },
  keypadBtn: {
    width: 80,
    height: 56,
    borderRadius: theme.radii.lg,
    backgroundColor: darkColors.surfaceHighlight,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadDigit: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: '700',
    color: darkColors.text,
  },
  keypadActionBtn: {
    width: 80,
    height: 56,
    borderRadius: theme.radii.lg,
    backgroundColor: darkColors.surface,
    borderWidth: 1,
    borderColor: darkColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keypadActionText: {
    fontSize: theme.fontSizes.sm,
    fontWeight: '700',
    color: darkColors.textSecondary,
  },
  unlockBtn: {
    width: '100%',
  },
});
