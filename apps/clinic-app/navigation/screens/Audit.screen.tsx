import React from 'react';
import { StyleSheet, View } from 'react-native';
import ResponsiveLayout from '../../components/layout/ResponsiveLayout';
import AuditWorkstationView from '../../components/audit/AuditWorkstationView';
import { theme } from '../../constants/theme';

export default function AuditScreen() {
  return (
    <ResponsiveLayout
      headerTitle="Audit Log"
      hideHeader={false}
      style={styles.container}
    >
      <View style={styles.content}>
        <AuditWorkstationView />
      </View>
    </ResponsiveLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
  },
});
