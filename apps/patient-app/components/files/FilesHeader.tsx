import React from 'react';
import { StyleSheet, View } from 'react-native';
import { RecordsSyncBanner } from '../records/RecordsSyncBanner';

export type BrowserContents = {
  pendingSyncCount: number;
};

export function FilesHeader({
  contents,
  isSyncing,
  onSync,
  onRetryFailed,
  failedCount = 0,
  patientId,
}: {
  contents: BrowserContents | null;
  folderId?: string;
  isSyncing: boolean;
  onSync: () => void;
  onRetryFailed?: () => void;
  failedCount?: number;
  patientId?: string;
  onCreateFolder?: () => void;
  onOpenFolder?: (id: string) => void;
  onOpenRoot?: () => void;
  onOpenUpload?: () => void;
}) {
  const pendingCount = contents?.pendingSyncCount ?? 0;

  return (
    <View style={styles.header}>
      <RecordsSyncBanner
        patientId={patientId}
        pendingCount={pendingCount}
        failedCount={failedCount}
        isSyncing={isSyncing}
        onSync={onSync}
        onRetryFailed={onRetryFailed}
      />
    </View>
  );
}

export default FilesHeader;

const styles = StyleSheet.create({
  header: {
    width: '100%',
  },
});
