import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { NavigationState, ParamListBase } from '@react-navigation/native';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { useAppTheme } from '../../contexts/ThemeContext';
import { isTabRoute } from '../../navigation/webSections';
import { useWebKeyboardShortcuts } from '../../hooks/useWebKeyboardShortcuts.web';
import WebSidebar from './WebSidebar.web';
import WebPageHeader from './WebPageHeader.web';

interface WebAppFrameProps {
  state: NavigationState<ParamListBase>;
  navigation: { navigate: (...args: any[]) => void; canGoBack: () => boolean; goBack: () => void };
  descriptors: Record<string, { options: { title?: string } }>;
  children: ReactNode;
}

/**
 * Navigator `layout` for the web Main stack.
 *
 * >= 768px  : persistent sidebar + content column (centered, max width from tokens)
 * <  768px  : full-width content; the compact bottom tab bar is rendered by the tab navigator
 *
 * Pushed (non-tab) pages get a header with back + title. Tab pages draw their own page header.
 */
export default function WebAppFrame({ state, navigation, descriptors, children }: WebAppFrameProps) {
  const { colors, sizes } = useAppTheme();
  const { isWorkstation, isDesktop } = useBreakpoint();
  useWebKeyboardShortcuts(navigation);

  const focused = state.routes[state.index];
  const showHeader = !isTabRoute(state);
  const title = focused ? descriptors[focused.key]?.options.title : undefined;

  const onBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('BottomTabs', { screen: 'HomeScreen' });
  };

  const content = (
    <View style={styles.column}>
      {showHeader ? <WebPageHeader title={title} onBack={onBack} /> : null}
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

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', width: '100%' },
  column: { flex: 1, minWidth: 0 },
  contentOuter: { flex: 1, alignItems: 'center' },
  contentInner: { flex: 1, width: '100%' },
});
