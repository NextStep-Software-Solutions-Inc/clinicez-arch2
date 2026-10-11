import type { SyncChangesPage } from '../api/documentsApi';

/**
 * Cursor-driven incremental pull. Pure orchestration: the network call, cursor storage and the
 * database upserts are injected so the loop can be unit tested without a database.
 *
 * Contract: send the stored `cursor` as `since` (omit it for the first full pull), apply the rows
 * as upserts by id, persist the returned cursor, and keep calling while `hasMore`.
 */

export const MAX_SYNC_PAGES = 100;

export interface PullChangesDeps {
  fetchPage: (since: string | null) => Promise<SyncChangesPage>;
  readCursor: () => Promise<string | null>;
  /** Persist the cursor. Called only after the page was applied, so a crash replays the page. */
  writeCursor: (cursor: string) => Promise<void>;
  applyPage: (page: SyncChangesPage) => Promise<void>;
}

export interface PullChangesResult {
  pages: number;
  cursor: string | null;
}

export async function pullAllChanges(deps: PullChangesDeps): Promise<PullChangesResult> {
  let cursor = await deps.readCursor();
  let pages = 0;

  while (pages < MAX_SYNC_PAGES) {
    const page = await deps.fetchPage(cursor);
    await deps.applyPage(page);
    await deps.writeCursor(page.cursor);
    pages += 1;

    const stalled = page.cursor === cursor;
    cursor = page.cursor;
    if (!page.hasMore || stalled) break;
  }

  return { pages, cursor };
}

/** Whether a page changed anything the inbox screens display. */
export function pageHasDocumentChanges(page: SyncChangesPage): boolean {
  return (
    page.labRequests.length > 0 ||
    page.prescriptions.length > 0 ||
    page.labResults.length > 0 ||
    page.medicalCertificates.length > 0 ||
    page.notifications.length > 0
  );
}
