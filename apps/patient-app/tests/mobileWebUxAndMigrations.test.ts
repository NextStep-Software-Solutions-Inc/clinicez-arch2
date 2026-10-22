import { describe, expect, test } from 'bun:test';
import { Database } from 'bun:sqlite';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveWebHeaderState } from '../navigation/webSections';

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string => readFileSync(join(APP_ROOT, rel), 'utf8');

describe('Mobile Web UI/UX & Compact Header State Resolution', () => {
  test('resolveWebHeaderState returns isRootTab=true for Home, Appointments, Records root, and Profile', () => {
    const makeTabState = (tabIndex: number, nestedRouteName?: string): any => ({
      index: 0,
      routes: [
        {
          key: 'bottom-tabs',
          name: 'BottomTabs',
          state: {
            index: tabIndex,
            routes: [
              { key: 'tab-home', name: 'HomeScreen' },
              { key: 'tab-appts', name: 'AppointmentsScreen' },
              {
                key: 'tab-files',
                name: 'FilesScreen',
                state: nestedRouteName
                  ? {
                      index: 1,
                      routes: [
                        { key: 'files-root', name: 'FilesBrowserScreen' },
                        { key: 'files-nested', name: nestedRouteName },
                      ],
                    }
                  : {
                      index: 0,
                      routes: [{ key: 'files-root', name: 'FilesBrowserScreen' }],
                    },
              },
              { key: 'tab-profile', name: 'ProfileScreen' },
            ],
          },
        },
      ],
    });

    const homeHeader = resolveWebHeaderState(makeTabState(0));
    expect(homeHeader).toEqual({
      isRootTab: true,
      isNestedTabPush: false,
      tabKey: 'HomeScreen',
      title: 'Clinic EZ',
      subtitle: 'Patient Portal',
    });

    const apptsHeader = resolveWebHeaderState(makeTabState(1));
    expect(apptsHeader).toEqual({
      isRootTab: true,
      isNestedTabPush: false,
      tabKey: 'AppointmentsScreen',
      title: 'My Appointments',
      subtitle: 'Patient Portal',
    });

    const recordsRootHeader = resolveWebHeaderState(makeTabState(2));
    expect(recordsRootHeader).toEqual({
      isRootTab: true,
      isNestedTabPush: false,
      tabKey: 'FilesScreen',
      title: 'Health Records',
      subtitle: 'Patient Portal',
    });

    const profileHeader = resolveWebHeaderState(makeTabState(3));
    expect(profileHeader).toEqual({
      isRootTab: true,
      isNestedTabPush: false,
      tabKey: 'ProfileScreen',
      title: 'My Profile',
      subtitle: 'Patient Portal',
    });

    // Nested push inside FilesScreen stack (e.g., FilesUploadScreen) becomes isRootTab=false with Back header
    const uploadHeader = resolveWebHeaderState(makeTabState(2, 'FilesUploadScreen'));
    expect(uploadHeader).toEqual({
      isRootTab: false,
      isNestedTabPush: true,
      tabKey: 'FilesScreen',
      title: 'Add Health Record',
    });
  });

  test('resolveWebHeaderState returns isRootTab=false for pushed Main stack screens', () => {
    const pushedState: any = {
      index: 1,
      routes: [
        { key: 'bottom-tabs', name: 'BottomTabs' },
        { key: 'notif', name: 'NotificationScreen' },
      ],
    };
    const header = resolveWebHeaderState(pushedState, {
      notif: { options: { title: 'Notifications' } },
    });
    expect(header).toEqual({
      isRootTab: false,
      isNestedTabPush: false,
      title: 'Notifications',
    });
  });

  test('WebAppFrame renders compact brand header on root tabs when isCompact is true', () => {
    const frameSource = readApp('components/layout/WebAppFrame.web.tsx');
    expect(frameSource.includes('resolveWebHeaderState')).toBe(true);
    expect(frameSource.includes('showCompactTabHeader')).toBe(true);
    expect(frameSource.includes('showBrand')).toBe(true);
    expect(frameSource.includes('showAccountActions')).toBe(true);
  });

  test('StatTile enforces equal height in rows and adaptive typography for long text statuses', () => {
    const primitivesSource = readApp('components/ui/Primitives.tsx');
    expect(primitivesSource.includes('isLongText')).toBe(true);
    expect(primitivesSource.includes('valueVariant')).toBe(true);
    expect(primitivesSource.includes("justifyContent: 'space-between'")).toBe(true);
  });

  test('Files.screen.web.tsx uses direct Input without 38px outer wrapper and uses grid icon', () => {
    const filesWebSource = readApp('navigation/screens/files/Files.screen.web.tsx');
    expect(filesWebSource.includes('icon="grid"')).toBe(true);
    expect(filesWebSource.includes('styles.searchField')).toBe(false);
    expect(filesWebSource.includes('Health Records & Documents')).toBe(true);
  });

  test('FilesUpload.screen.web.tsx wraps category chips instead of clipping in horizontal ScrollView', () => {
    const uploadWebSource = readApp('navigation/screens/files/FilesUpload.screen.web.tsx');
    expect(uploadWebSource.includes('typeList')).toBe(true);
    expect(uploadWebSource.includes("flexWrap: 'wrap'")).toBe(true);
  });
});

describe('SQLite Migration 0015 (local_health_records, local_documents, upload_queue, files_metadata)', () => {
  test('0015 migration file exists and is registered in journal and migrations.js', () => {
    const sqlPath = join(APP_ROOT, 'drizzle/0015_health_records_and_upload_queue.sql');
    expect(existsSync(sqlPath)).toBe(true);

    const journal = JSON.parse(readApp('drizzle/meta/_journal.json'));
    const entry15 = journal.entries.find((e: { idx: number }) => e.idx === 15);
    expect(entry15).toBeDefined();
    expect(entry15.tag).toBe('0015_health_records_and_upload_queue');

    const migrationsJs = readApp('drizzle/migrations.js');
    expect(migrationsJs.includes('0015_health_records_and_upload_queue.sql')).toBe(true);
    expect(migrationsJs.includes('m0015')).toBe(true);
  });

  test('applying all SQLite migrations 0000..0015 creates local_health_records, local_documents, upload_queue and alters files_metadata', () => {
    const sqlite = new Database(':memory:');
    const journal = JSON.parse(readApp('drizzle/meta/_journal.json'));

    for (const entry of journal.entries) {
      const sqlContent = readApp(`drizzle/${entry.tag}.sql`);
      const statements = sqlContent.split('--> statement-breakpoint');
      for (const stmt of statements) {
        const trimmed = stmt.trim();
        if (trimmed) {
          sqlite.exec(trimmed);
        }
      }
    }

    const tables = sqlite
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map((t) => t.name));

    expect(tableNames.has('local_health_records')).toBe(true);
    expect(tableNames.has('local_documents')).toBe(true);
    expect(tableNames.has('upload_queue')).toBe(true);
    expect(tableNames.has('files_metadata')).toBe(true);

    const filesMetadataCols = sqlite
      .query('PRAGMA table_info(files_metadata)')
      .all() as Array<{ name: string }>;
    const colNames = new Set(filesMetadataCols.map((c) => c.name));

    expect(colNames.has('title')).toBe(true);
    expect(colNames.has('document_date')).toBe(true);
    expect(colNames.has('facility_name')).toBe(true);
    expect(colNames.has('notes')).toBe(true);
    expect(colNames.has('is_cached')).toBe(true);
    expect(colNames.has('last_sync_error')).toBe(true);
    expect(colNames.has('retry_count')).toBe(true);

    sqlite.close();
  });
});
