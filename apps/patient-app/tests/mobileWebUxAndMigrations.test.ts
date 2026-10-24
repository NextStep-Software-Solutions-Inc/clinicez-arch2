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

  test('Files.screen.web.tsx hides redundant hero header on compact screens, uses direct Input, and uses grid icon', () => {
    const filesWebSource = readApp('navigation/screens/files/Files.screen.web.tsx');
    expect(filesWebSource.includes('icon="grid"')).toBe(true);
    expect(filesWebSource.includes('styles.searchField')).toBe(false);
    expect(filesWebSource.includes('!isCompact &&')).toBe(true);
    expect(filesWebSource.includes('Health Records & Documents')).toBe(true);

    const fileRowWebSource = readApp('components/files/FileRow.web.tsx');
    expect(fileRowWebSource.includes('WebSwipeableRow')).toBe(true);
    expect(fileRowWebSource.includes('!isCompact && isHovered')).toBe(false);

    const pillBarSource = readApp('components/records/CategoryPillBar.tsx');
    expect(pillBarSource.includes('FilterChipBar')).toBe(true);
    expect(pillBarSource.includes("flexWrap: 'wrap'")).toBe(false);
  });

  test('Appointments.screen.web.tsx hides redundant hero header on compact screens and MainBottomTabs.web.tsx avoids truncating label', () => {
    const apptsWebSource = readApp('navigation/screens/Appointments.screen.web.tsx');
    expect(apptsWebSource.includes('!isCompact &&')).toBe(true);
    expect(apptsWebSource.includes('Appointments & Visits')).toBe(true);

    const bottomTabsWeb = readApp('navigation/navigators/MainBottomTabs.web.tsx');
    expect(bottomTabsWeb.includes("title: 'Appointments'")).toBe(true);
  });

  test('Profile.screen.web.tsx matches native Profile screen layout with ProfileCard and SettingsSection list', () => {
    const profileWebSource = readApp('navigation/screens/profile/Profile.screen.web.tsx');
    expect(profileWebSource.includes('<ProfileCard')).toBe(true);
    expect(profileWebSource.includes('<SettingsSection title="About You"')).toBe(true);
    expect(profileWebSource.includes('<SettingsSection title="Medical History"')).toBe(true);
    expect(profileWebSource.includes('title="Health Records"')).toBe(true);
  });

  test('Pushed web screens omit redundant large inline page headers that duplicate WebPageHeader', () => {
    const notifWebSource = readApp('navigation/screens/Notification.screen.web.tsx');
    expect(notifWebSource.includes('<ThemedText variant="display">Notifications</ThemedText>')).toBe(false);
    expect(notifWebSource.includes('Updates regarding appointments, prescriptions, and clinics.')).toBe(false);
    expect(notifWebSource.includes('icon="notifications"')).toBe(true);

    const uploadWebSource = readApp('navigation/screens/files/FilesUpload.screen.web.tsx');
    expect(uploadWebSource.includes('Add Health Record')).toBe(false);
    expect(uploadWebSource.includes('typeList')).toBe(true);
    expect(uploadWebSource.includes('typeScroll')).toBe(true);

    const attachSource = readApp('navigation/screens/appointments/AttachFiles.screen.tsx');
    expect(attachSource.includes('<ThemedText variant="h2">Attach Files</ThemedText>')).toBe(false);

    const rescheduleSource = readApp('navigation/screens/appointments/Reschedule.screen.tsx');
    expect(rescheduleSource.includes('<ThemedText variant="h2">Request Reschedule</ThemedText>')).toBe(false);
  });

  test('Records, Notifications, and Appointments share identical horizontal FilterChipBar with symmetrical top/bottom spacing', () => {
    const filterChipBarSource = readApp('components/ui/FilterChipBar.tsx');
    expect(filterChipBarSource.includes('<ScrollView')).toBe(true);
    expect(filterChipBarSource.includes('horizontal')).toBe(true);
    expect(filterChipBarSource.includes('flexShrink: 0')).toBe(true);
    expect(filterChipBarSource.includes('variant="smallBold"')).toBe(true);
    expect(filterChipBarSource.includes("flexWrap: 'wrap'")).toBe(false);

    const pillBarSource = readApp('components/records/CategoryPillBar.tsx');
    expect(pillBarSource.includes('<FilterChipBar')).toBe(true);
    expect(pillBarSource.includes('badgeCount')).toBe(false);

    const notifWebSource = readApp('navigation/screens/Notification.screen.web.tsx');
    expect(notifWebSource.includes('<FilterChipBar')).toBe(true);
    expect(notifWebSource.includes('paddingTop: verticalRhythm')).toBe(true);
    expect(notifWebSource.includes('gap: verticalRhythm')).toBe(true);

    const notifNativeSource = readApp('navigation/screens/Notification.screen.tsx');
    expect(notifNativeSource.includes('<FilterChipBar')).toBe(true);

    const apptsWebSource = readApp('navigation/screens/Appointments.screen.web.tsx');
    expect(apptsWebSource.includes('<FilterChipBar')).toBe(true);

    const offlineBannerSource = readApp('components/appointments/OfflineBanner.tsx');
    expect(offlineBannerSource.includes('if (!rendered && !shouldShow)')).toBe(true);
    expect(offlineBannerSource.includes('return null;')).toBe(true);

    const uploadWebSource = readApp('navigation/screens/files/FilesUpload.screen.web.tsx');
    expect(uploadWebSource.includes('style={styles.typeScroll}')).toBe(true);
    expect(uploadWebSource.includes('contentContainerStyle={[styles.typeList')).toBe(true);

    const docsSource = readApp('navigation/screens/documents/Documents.screen.tsx');
    expect(docsSource.includes('style={styles.tabsScroll}')).toBe(true);
    expect(docsSource.includes('contentContainerStyle={[styles.tabs')).toBe(true);

    const exploreClinicsWeb = readApp('navigation/screens/ExploreClinics.screen.web.tsx');
    expect(exploreClinicsWeb.includes('style={styles.filterScroll}')).toBe(true);
    expect(exploreClinicsWeb.includes('gap: spacing.md, marginBottom: spacing.md')).toBe(true);

    const exploreOrgsWeb = readApp('navigation/screens/ExploreOrgs.screen.web.tsx');
    expect(exploreOrgsWeb.includes('style={styles.filterScroll}')).toBe(true);
    expect(exploreOrgsWeb.includes('gap: spacing.md, marginBottom: spacing.md')).toBe(true);
  });

  test('Appointments and Health Records trigger SearchModal popup dialog from header search icon button', () => {
    const webPageHeader = readApp('components/layout/WebPageHeader.web.tsx');
    expect(webPageHeader.includes('onOpenSearch')).toBe(true);
    expect(webPageHeader.includes('hasActiveSearch')).toBe(true);

    const webAppFrame = readApp('components/layout/WebAppFrame.web.tsx');
    expect(webAppFrame.includes('HeaderSearchProvider')).toBe(true);
    expect(webAppFrame.includes('useHeaderSearchEntry')).toBe(true);
    expect(webAppFrame.includes('onOpenSearch={activeSearch?.openSearch}')).toBe(true);

    const searchModalSource = readApp('components/ui/SearchModal.tsx');
    expect(searchModalSource.includes('<Modal')).toBe(true);
    expect(searchModalSource.includes('ActiveSearchBanner')).toBe(true);

    const apptsWebSource = readApp('navigation/screens/Appointments.screen.web.tsx');
    expect(apptsWebSource.includes("useRegisterHeaderSearch(\n    'AppointmentsScreen'")).toBe(true);
    expect(apptsWebSource.includes('<SearchModal')).toBe(true);
    expect(apptsWebSource.includes('searchRowWrap')).toBe(false);

    const filesWebSource = readApp('navigation/screens/files/Files.screen.web.tsx');
    expect(filesWebSource.includes("useRegisterHeaderSearch(\n    'FilesScreen'")).toBe(true);
    expect(filesWebSource.includes('<SearchModal')).toBe(true);
    expect(filesWebSource.includes('compactSearchRow')).toBe(false);

    const apptsNativeSource = readApp('navigation/screens/Appointments.screen.tsx');
    expect(apptsNativeSource.includes('onOpenSearch={openSearchDialog}')).toBe(true);
    expect(apptsNativeSource.includes('<SearchModal')).toBe(true);

    const filesNativeSource = readApp('navigation/screens/files/Files.screen.tsx');
    expect(filesNativeSource.includes('onOpenSearch={openSearchDialog}')).toBe(true);
    expect(filesNativeSource.includes('<SearchModal')).toBe(true);
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
