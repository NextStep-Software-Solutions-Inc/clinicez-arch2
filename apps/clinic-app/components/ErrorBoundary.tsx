import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TextInput,
  Platform,
} from 'react-native';
import ThemedText from './ui/ThemedText';
import Button from './ui/Button';
import Badge from './ui/Badge';
import Icon from './ui/Icon';
import { theme } from '../constants/theme';
import {
  CrashReport,
  formatCrashReport,
  recordCrash,
  shareCrashReport,
} from '../services/crashReporter';
import { clearActiveTenantContext } from '@shared/safe';
import { notify } from '../utils/feedback';

interface State {
  failed: boolean;
  error?: Error | null;
  componentStack?: string | null;
  report?: CrashReport | null;
  copied: boolean;
  expandedDetails: boolean;
}

/**
 * Robust, production-grade Error Boundary for Clinic EZ.
 *
 * When an unhandled rendering error occurs, it traps the exception, generates and
 * persists a structured diagnostic crash report, and displays a comprehensive
 * technical view with one-click sharing/copying for developers and tech support.
 */
export default class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = {
    failed: false,
    error: null,
    componentStack: null,
    report: null,
    copied: false,
    expandedDetails: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { failed: true, error };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught render failure:', error, info.componentStack);

    const report = recordCrash({
      source: 'ErrorBoundary',
      name: error instanceof Error ? error.name : 'RenderError',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      componentStack: info.componentStack || undefined,
      isFatal: true,
    });

    this.setState({
      componentStack: info.componentStack,
      report,
    });
  }

  private reset = () => {
    this.setState({
      failed: false,
      error: null,
      componentStack: null,
      report: null,
      copied: false,
      expandedDetails: false,
    });
  };

  private handleShare = async () => {
    if (!this.state.report) return;
    const ok = await shareCrashReport(this.state.report);
    if (ok) {
      this.setState({ copied: true });
      notify.success('Error report copied to clipboard. Share this with tech support.');
      setTimeout(() => this.setState({ copied: false }), 4000);
    }
  };

  private handleSwitchWorkspace = () => {
    clearActiveTenantContext();
    this.reset();
  };

  private toggleDetails = () => {
    this.setState((prev) => ({ expandedDetails: !prev.expandedDetails }));
  };

  render() {
    if (!this.state.failed) return this.props.children;

    const { error, report, copied, expandedDetails } = this.state;
    const formattedLog = report ? formatCrashReport(report) : error?.stack || error?.message || 'No stack trace available.';

    return (
      <View style={styles.container} accessibilityRole="alert">
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header Badge & Title */}
          <View style={styles.headerBlock}>
            <Badge label="Application Error" variant="emergency" icon="alertCircle" />
            <ThemedText variant="h1" style={styles.titleText}>
              Something went wrong
            </ThemedText>
            <ThemedText variant="body" color={theme.colors.textSecondary} style={styles.messageText}>
              Clinic EZ encountered an unexpected error. A full diagnostic report has been
              recorded on this device to help developers and technical support pin down and patch the cause quickly.
            </ThemedText>
          </View>

          {/* Primary Error Summary Card */}
          <View style={styles.summaryCard}>
            <View style={styles.errorBannerHeader}>
              <Icon name="alertCircle" size={theme.sizes.iconMd} color={theme.colors.emergencyText} />
              <ThemedText variant="bodyBold" color={theme.colors.emergencyText} style={styles.errorTitle}>
                {error?.name || report?.name || 'Runtime Error'}: {error?.message || report?.message || 'Unknown failure'}
              </ThemedText>
            </View>

            {report && (
              <View style={styles.metadataGrid}>
                <View style={styles.metaItem}>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>Platform:</ThemedText>
                  <ThemedText variant="captionBold">{report.platform} (OS {report.osVersion})</ThemedText>
                </View>
                <View style={styles.metaItem}>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>Workspace:</ThemedText>
                  <ThemedText variant="captionBold">{report.workspace || '(none)'}</ThemedText>
                </View>
                <View style={styles.metaItem}>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>Screen Size:</ThemedText>
                  <ThemedText variant="captionBold">{report.windowDimensions.width}x{report.windowDimensions.height}</ThemedText>
                </View>
                <View style={styles.metaItem}>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>Time:</ThemedText>
                  <ThemedText variant="captionBold">{report.formattedTime}</ThemedText>
                </View>
              </View>
            )}
          </View>

          {/* Collapsible / Expandable Diagnostic Log */}
          <View style={styles.logSection}>
            <Button
              title={expandedDetails ? 'Hide diagnostic details' : 'View full technical diagnostics (stack trace)'}
              variant="secondary"
              icon={expandedDetails ? 'chevronUp' : 'chevronDown'}
              onPress={this.toggleDetails}
            />

            {expandedDetails && (
              <View style={styles.logWrapper}>
                <View style={styles.logHeader}>
                  <ThemedText variant="captionBold" color={theme.colors.textSecondary}>
                    Error Diagnostic Log
                  </ThemedText>
                  <ThemedText variant="caption" color={theme.colors.textMuted}>
                    Select all and copyable
                  </ThemedText>
                </View>
                <TextInput
                  style={styles.logInput}
                  multiline
                  editable={false}
                  value={formattedLog}
                  selectTextOnFocus
                  scrollEnabled
                />
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actions}>
            <Button
              title={copied ? 'Report copied to clipboard!' : 'Copy / Share Error Report'}
              icon="copy"
              size="lg"
              variant="primary"
              onPress={this.handleShare}
            />
            <Button
              title="Try again"
              icon="refresh"
              size="lg"
              variant="secondary"
              onPress={this.reset}
            />
            <Button
              title="Switch workspace / Reconnect"
              icon="clinic"
              variant="ghost"
              onPress={this.handleSwitchWorkspace}
            />
          </View>
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: theme.spacing['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100%',
    gap: theme.spacing.lg,
  },
  headerBlock: {
    alignItems: 'center',
    maxWidth: 560,
    gap: theme.spacing.sm,
  },
  titleText: {
    textAlign: 'center',
  },
  messageText: {
    textAlign: 'center',
    lineHeight: 22,
  },
  summaryCard: {
    width: '100%',
    maxWidth: 640,
    backgroundColor: theme.colors.emergencyBg,
    borderColor: theme.colors.emergencyBorder,
    borderWidth: theme.sizes.borderWidth,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  errorBannerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.sm,
  },
  errorTitle: {
    flex: 1,
    lineHeight: 20,
  },
  metadataGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    borderTopWidth: theme.sizes.borderWidth,
    borderTopColor: theme.colors.emergencyBorder,
  },
  metaItem: {
    minWidth: 130,
    gap: theme.spacing.xs / 2,
  },
  logSection: {
    width: '100%',
    maxWidth: 640,
    gap: theme.spacing.sm,
  },
  logWrapper: {
    backgroundColor: theme.colors.surfaceInverse,
    borderRadius: theme.radii.md,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logInput: {
    fontFamily: theme.fonts.mono['400'],
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textInverted,
    maxHeight: 240,
    padding: theme.spacing.xs,
  },
  actions: {
    width: '100%',
    maxWidth: 420,
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
});
