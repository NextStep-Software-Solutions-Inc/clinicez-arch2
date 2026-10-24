import React from 'react';
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
    <RecordsSyncBanner
      patientId={patientId}
      pendingCount={pendingCount}
      failedCount={failedCount}
      isSyncing={isSyncing}
      onSync={onSync}
      onRetryFailed={onRetryFailed}
    />
  );
}

export default FilesHeader;
