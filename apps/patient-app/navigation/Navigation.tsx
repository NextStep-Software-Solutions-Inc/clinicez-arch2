import { createStaticNavigation, createNavigationContainerRef, type StaticParamList } from '@react-navigation/native';
import RootStack from './navigators/RootStack';

export type RootStackType = typeof RootStack;

declare module '@react-navigation/core' {
  interface RootNavigator extends RootStackType {}
}

export type RootParamList = StaticParamList<typeof RootStack>;

declare global {
  namespace ReactNavigation {
    interface RootParamList extends StaticParamList<typeof RootStack> {}
  }
}

export const navigationRef = createNavigationContainerRef<RootParamList>();

export const Navigation = createStaticNavigation(RootStack);
