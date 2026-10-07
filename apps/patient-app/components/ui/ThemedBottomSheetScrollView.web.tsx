import { ScrollView, type ScrollViewProps } from 'react-native';

/**
 * Web stand-in for gorhom's BottomSheetScrollView. On web the sheet is a plain modal (see
 * ThemedBottomSheetModal.web) so there is no gorhom context to attach to; a normal ScrollView is used.
 */
export default function ThemedBottomSheetScrollView(props: ScrollViewProps) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}
