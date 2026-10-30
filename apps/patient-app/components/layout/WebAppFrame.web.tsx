import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NavigationState, ParamListBase } from '@react-navigation/native';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAppTheme } from '../../contexts/ThemeContext';
import {
  HeaderSearchProvider,
  useHeaderSearchEntry,
  useWebHeaderOverride,
} from '../../contexts/HeaderSearchContext';
import { resolveFocusedScreenName, resolveWebHeaderState } from '../../navigation/webSections';
import { useWebKeyboardShortcuts } from '../../hooks/useWebKeyboardShortcuts.web';
import WebSidebar from './WebSidebar.web';
import WebPageHeader from './WebPageHeader.web';

interface WebAppFrameProps {
  state: NavigationState<ParamListBase>;
  navigation: { navigate: (...args: any[]) => void; canGoBack: () => boolean; goBack: () => void };
  descriptors: Record<string, { options: { title?: string } }>;
  children: ReactNode;
}

function WebAppFrameInner({ state, navigation, descriptors, children }: WebAppFrameProps) {
  const { colors, sizes } = useAppTheme();
  const { isWorkstation, isDesktop, isCompact } = useBreakpoint();
  useWebKeyboardShortcuts(navigation);

  const headerInfo = resolveWebHeaderState(state, descriptors);
  const focusedScreenName = resolveFocusedScreenName(state);
  const headerOverride = useWebHeaderOverride(!headerInfo.isRootTab ? focusedScreenName : undefined);
  const showBackHeader = !headerInfo.isRootTab;
  const showCompactTabHeader = headerInfo.isRootTab && isCompact;
  const activeSearch = useHeaderSearchEntry(headerInfo.isRootTab ? headerInfo.tabKey : undefined);

  const onBack = () => {
    if (headerInfo.isNestedTabPush && (headerInfo.tabKey === 'RecordsScreen' || headerInfo.tabKey === 'FilesScreen')) {
      navigation.navigate('BottomTabs', {
        screen: headerInfo.tabKey,
        params: { screen: 'FilesBrowserScreen' },
      });
      return;
    }
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('BottomTabs', { screen: 'HomeScreen' });
  };

  const content = (
    <View style={styles.column}>
      {showBackHeader ? (
        <WebPageHeader
          title={headerOverride?.title || headerInfo.title}
          subtitle={headerOverride?.subtitle ?? headerInfo.subtitle}
          onBack={onBack}
        />
      ) : showCompactTabHeader ? (
        <WebPageHeader
          title={headerInfo.title}
          subtitle={headerInfo.subtitle}
          showBrand
          showAccountActions
          onOpenSearch={activeSearch?.openSearch}
          hasActiveSearch={activeSearch?.hasActiveSearch}
          onOpenNotifications={() => navigation.navigate('NotificationScreen')}
          onOpenSettings={() => navigation.navigate('SettingsScreen')}
        />
      ) : null}
      <View style={styles.contentOuter}>
        <View style={[styles.contentInner, { maxWidth: sizes.contentMaxWidth }]}>{children}</View>
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {isWorkstation ? <WebSidebar state={state} navigation={navigation} collapsed={!isDesktop} /> : null}
      {content}
    </View>
  );
}

/**
 * Navigator `layout` for the web Main stack.
 *
 * >= 768px  : persistent sidebar + content column (centered, max width from tokens)
 * <  768px  : full-width content with a persistent top header and compact bottom tab bar
 *
 * Pushed (non-tab) pages and nested tab sub-pages (e.g. Add Health Record) get a header
 * with back + title on all viewports. Root tab pages get the compact header with brand mark,
 * title, optional Search button, and Notification/Settings actions when < 768px.
 */
export default function WebAppFrame(props: WebAppFrameProps) {
  return (
    <HeaderSearchProvider>
      <WebAppFrameInner {...props} />
    </HeaderSearchProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', width: '100%' },
  column: { flex: 1, minWidth: 0 },
  contentOuter: { flex: 1, alignItems: 'center' },
  contentInner: { flex: 1, width: '100%' },
});
