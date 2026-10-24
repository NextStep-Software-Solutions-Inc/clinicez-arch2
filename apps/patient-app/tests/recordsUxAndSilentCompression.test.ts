import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveFocusedScreenName, resolveWebHeaderState } from '../navigation/webSections';
import {
  IMAGE_UPLOAD_QUALITY,
  compressWebBlobForUpload,
  isCompressibleImageMime,
  resolveCompressionTargetMime,
} from '../services/files/fileCompression';
import {
  compactFileNameMiddle,
  formatCategoryTitleCase,
  formatRecordFileName,
  formatRecordSubtitle,
  formatRecordTimestamp,
  formatViewerHeaderTitle,
  getProvenanceIndicatorMeta,
  getSyncStatusDotMeta,
} from '../services/files/recordPresentation';

const APP_ROOT = join(import.meta.dir, '..');
const readApp = (rel: string): string => readFileSync(join(APP_ROOT, rel), 'utf8');

describe('1. SyncStatusDot — Color-coded dot without status text', () => {
  test('maps synced, failed, syncing, and local/queued states to semantic color tokens', () => {
    expect(getSyncStatusDotMeta('synced')).toEqual({
      dotColor: 'success',
      haloColor: 'successBg',
      accessibilityLabel: 'Backed up',
    });
    expect(getSyncStatusDotMeta('failed')).toEqual({
      dotColor: 'emergency',
      haloColor: 'emergencyBg',
      accessibilityLabel: 'Sync error',
    });
    expect(getSyncStatusDotMeta('syncing')).toEqual({
      dotColor: 'info',
      haloColor: 'infoBg',
      accessibilityLabel: 'Syncing',
    });
    expect(getSyncStatusDotMeta('queued')).toEqual({
      dotColor: 'warning',
      haloColor: 'warningBg',
      accessibilityLabel: 'On device',
    });
  });

  test('SyncStatusDot and FileRow render zero visible status text pills', () => {
    const dotSource = readApp('components/files/SyncStatusDot.tsx');
    expect(dotSource.includes('ThemedText')).toBe(false);

    const fileRowWeb = readApp('components/files/FileRow.web.tsx');
    const fileRowNative = readApp('components/files/FileRow.tsx');
    expect(fileRowWeb.includes('SyncStatusDot')).toBe(true);
    expect(fileRowNative.includes('SyncStatusDot')).toBe(true);
    expect(fileRowWeb.includes("'Backed up'")).toBe(false);
    expect(fileRowNative.includes("'Backed up'")).toBe(false);
  });
});

describe('2. WebSwipeableRow — Swipe-to-reveal row actions on Web', () => {
  test('FileRow.web.tsx wraps rows in WebSwipeableRow and removes desktop-only hover action buttons', () => {
    const fileRowWeb = readApp('components/files/FileRow.web.tsx');
    expect(fileRowWeb.includes('<WebSwipeableRow')).toBe(true);
    expect(fileRowWeb.includes('renderRightActions')).toBe(true);
    expect(fileRowWeb.includes('!isCompact && isHovered')).toBe(false);
    expect(fileRowWeb.includes('styles.quickActions')).toBe(false);

    const swipeSource = readApp('components/files/WebSwipeableRow.web.tsx');
    expect(swipeSource.includes("touchAction: 'pan-y'")).toBe(true);
    expect(swipeSource.includes('onPointerDown')).toBe(true);
    expect(swipeSource.includes('onPointerMove')).toBe(true);
    expect(swipeSource.includes('onPointerUp')).toBe(true);
  });
});

describe('3 & 4. Record Filename, Timestamp Subtitle, Icon-Only Provenance, & Viewer Top Header', () => {
  test('formatRecordFileName preserves or appends file extension as Filename.ext', () => {
    expect(
      formatRecordFileName({
        name: 'Filename.png',
        title: 'Filename',
        extension: 'png',
      })
    ).toBe('Filename.png');

    expect(
      formatRecordFileName({
        name: 'Renamed_Certificate',
        extension: 'png',
        mimeType: 'image/png',
      })
    ).toBe('Renamed_Certificate.png');

    expect(
      formatRecordFileName({
        name: 'Lab_Report',
        mimeType: 'application/pdf',
      })
    ).toBe('Lab_Report.pdf');
  });

  test('formatViewerHeaderTitle formats Filename.png (Medical Certificate) and middle-compacts long camera names', () => {
    expect(
      formatViewerHeaderTitle(
        { name: 'Filename.png', extension: 'png' },
        'Medical certificate'
      )
    ).toBe('Filename.png (Medical Certificate)');

    expect(formatCategoryTitleCase('lab result')).toBe('Lab Result');
    expect(formatCategoryTitleCase('Government ID')).toBe('Government ID');

    const compacted = compactFileNameMiddle('179281773357818541546637373.jpg', 22);
    expect(compacted.endsWith('.jpg')).toBe(true);
    expect(compacted.includes('…')).toBe(true);
    expect(compacted.length).toBeLessThanOrEqual(22);

    const longHeader = formatViewerHeaderTitle(
      { name: '179281773357818541546637373.jpg', extension: 'jpg' },
      'Medical certificate'
    );
    expect(longHeader.endsWith('.jpg (Medical Certificate)')).toBe(true);
  });

  test('formatRecordTimestamp formats date + time from createdAt and falls back cleanly to documentDate', () => {
    const ts = formatRecordTimestamp({
      createdAt: new Date('2026-10-24T04:54:00.000Z'),
      documentDate: '2026-10-24',
    });
    expect(ts.length).toBeGreaterThan(0);
    expect(ts.includes('2026')).toBe(true);
    expect(ts.includes(',')).toBe(true); // date, time separator

    const fallback = formatRecordTimestamp({
      createdAt: null,
      documentDate: '2026-10-24',
    });
    expect(fallback.includes('2026')).toBe(true);
  });

  test('formatRecordSubtitle combines timestamp and formatted file size, gracefully omitting missing parts', () => {
    const withKb = formatRecordSubtitle({
      createdAt: new Date('2026-10-24T04:54:00.000Z'),
      sizeBytes: 250_880, // 245 KB
    });
    expect(withKb.includes('2026')).toBe(true);
    expect(withKb.endsWith(' · 245 KB')).toBe(true);

    const withMb = formatRecordSubtitle({
      createdAt: new Date('2026-10-24T04:54:00.000Z'),
      sizeBytes: Math.round(1.5 * 1024 * 1024),
    });
    expect(withMb.endsWith(' · 1.5 MB')).toBe(true);

    const unknownSize = formatRecordSubtitle({
      createdAt: new Date('2026-10-24T04:54:00.000Z'),
      sizeBytes: 0,
    });
    expect(unknownSize.includes('2026')).toBe(true);
    expect(unknownSize.includes(' · ')).toBe(false);
    expect(unknownSize.includes('0 B')).toBe(false);

    const sizeOnly = formatRecordSubtitle({
      createdAt: null,
      sizeBytes: 512,
    });
    expect(sizeOnly).toBe('512 B');
  });

  test('getProvenanceIndicatorMeta returns icon-only upload indicator for patient-uploaded records', () => {
    expect(getProvenanceIndicatorMeta({ provenance: 'patient_uploaded' })).toEqual({
      icon: 'upload',
      colorToken: 'textMuted',
      accessibilityLabel: 'Uploaded by You',
    });

    expect(getProvenanceIndicatorMeta({ provenance: 'clinicez_verified', clinicId: 'c1' })).toEqual({
      icon: 'checkCircle',
      colorToken: 'primary',
      accessibilityLabel: 'ClinicEZ Verified',
    });
  });

  test('FileRow removes redundant document type Badge and ProvenanceBadge text pill on Web and Native', () => {
    const fileRowWeb = readApp('components/files/FileRow.web.tsx');
    const fileRowNative = readApp('components/files/FileRow.tsx');

    expect(fileRowWeb.includes('item.typeLabel')).toBe(false);
    expect(fileRowNative.includes('item.typeLabel')).toBe(false);
    expect(fileRowWeb.includes('ProvenanceBadge')).toBe(false);
    expect(fileRowNative.includes('ProvenanceBadge')).toBe(false);
    expect(fileRowWeb.includes('formatRecordFileName')).toBe(true);
    expect(fileRowNative.includes('formatRecordFileName')).toBe(true);
    expect(fileRowWeb.includes('formatRecordSubtitle')).toBe(true);
    expect(fileRowNative.includes('formatRecordSubtitle')).toBe(true);

    const filesScreenWeb = readApp('navigation/screens/files/Files.screen.web.tsx');
    expect(filesScreenWeb.includes('formatRecordSubtitle')).toBe(true);
  });

  test('FileViewer removes redundant clinicalHeaderCard and Uploaded by You badge, wiring title + timestamp/size subtitle into top header', () => {
    const viewerWeb = readApp('navigation/screens/files/FileViewer.screen.web.tsx');
    const viewerNative = readApp('navigation/screens/files/FileViewer.screen.tsx');

    expect(viewerWeb.includes('clinicalHeaderCard')).toBe(false);
    expect(viewerNative.includes('clinicalHeaderCard')).toBe(false);
    expect(viewerWeb.includes('ProvenanceBadge')).toBe(false);
    expect(viewerNative.includes('ProvenanceBadge')).toBe(false);
    expect(viewerWeb.includes('useRegisterWebHeaderOverride')).toBe(true);
    expect(viewerWeb.includes('formatViewerHeaderTitle')).toBe(true);
    expect(viewerNative.includes('formatViewerHeaderTitle')).toBe(true);
    expect(viewerWeb.includes('formatRecordSubtitle')).toBe(true);
    expect(viewerNative.includes('formatRecordSubtitle')).toBe(true);

    const webAppFrame = readApp('components/layout/WebAppFrame.web.tsx');
    expect(webAppFrame.includes('useWebHeaderOverride')).toBe(true);
    expect(webAppFrame.includes('subtitle={headerOverride?.subtitle ?? headerInfo.subtitle}')).toBe(true);

    const viewerNavState: any = {
      index: 0,
      routes: [
        {
          key: 'bottom-tabs',
          name: 'BottomTabs',
          state: {
            index: 2,
            routes: [
              { key: 'tab-home', name: 'HomeScreen' },
              { key: 'tab-appts', name: 'AppointmentsScreen' },
              {
                key: 'tab-files',
                name: 'FilesScreen',
                state: {
                  index: 1,
                  routes: [
                    { key: 'files-root', name: 'FilesBrowserScreen' },
                    { key: 'files-viewer', name: 'FileViewerScreen' },
                  ],
                },
              },
            ],
          },
        },
      ],
    };

    expect(resolveFocusedScreenName(viewerNavState)).toBe('FileViewerScreen');
    expect(resolveWebHeaderState(viewerNavState)).toEqual({
      isRootTab: false,
      isNestedTabPush: true,
      tabKey: 'FilesScreen',
      title: 'Preview',
    });
  });
});

describe('5. Silent 80% File Compression Before Uploading', () => {
  test('IMAGE_UPLOAD_QUALITY is strictly 0.8 (80%) across native and web upload pipelines', () => {
    expect(IMAGE_UPLOAD_QUALITY).toBe(0.8);

    const nativeUpload = readApp('navigation/screens/files/FilesUpload.screen.tsx');
    expect(nativeUpload.includes('quality: IMAGE_UPLOAD_QUALITY')).toBe(true);
    expect(nativeUpload.includes('quality: 0.85')).toBe(false);

    const docPicker = readApp('services/documents/filePicker.ts');
    expect(docPicker.includes('quality: IMAGE_UPLOAD_QUALITY')).toBe(true);
    expect(docPicker.includes('quality: 0.85')).toBe(false);
  });

  test('compressWebBlobForUpload compresses images at 0.8 quality, preserves original filename, skips PDFs, and never inflates smaller files', async () => {
    expect(isCompressibleImageMime('image/png')).toBe(true);
    expect(isCompressibleImageMime('image/jpeg')).toBe(true);
    expect(isCompressibleImageMime('image/webp')).toBe(true);
    expect(isCompressibleImageMime('application/pdf')).toBe(false);

    expect(resolveCompressionTargetMime('image/jpeg')).toBe('image/jpeg');
    expect(resolveCompressionTargetMime('image/png')).toBe('image/webp');

    // 1. Compressible PNG shrinks via 0.8 encoder while preserving Filename.png
    const rawPng = new Blob([new Uint8Array(100_000)], { type: 'image/png' });
    let capturedQuality = 0;
    let capturedMime = '';
    const compressed = await compressWebBlobForUpload({
      blob: rawPng,
      fileName: 'Filename.png',
      mimeType: 'image/png',
      encodeFn: async (_blob, targetMime, quality) => {
        capturedMime = targetMime;
        capturedQuality = quality;
        return {
          blob: new Blob([new Uint8Array(24_000)], { type: 'image/webp' }),
          mimeType: 'image/webp',
        };
      },
    });

    expect(capturedQuality).toBe(0.8);
    expect(capturedMime).toBe('image/webp');
    expect(compressed.fileName).toBe('Filename.png');
    expect(compressed.mimeType).toBe('image/webp');
    expect(compressed.sizeBytes).toBe(24_000);

    // 2. Never inflates if compressed output >= original size
    const tinyJpg = new Blob([new Uint8Array(4_000)], { type: 'image/jpeg' });
    const keptOriginal = await compressWebBlobForUpload({
      blob: tinyJpg,
      fileName: 'tiny.jpg',
      mimeType: 'image/jpeg',
      encodeFn: async () => ({
        blob: new Blob([new Uint8Array(5_500)], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg',
      }),
    });
    expect(keptOriginal.blob).toBe(tinyJpg);
    expect(keptOriginal.sizeBytes).toBe(4_000);
    expect(keptOriginal.mimeType).toBe('image/jpeg');

    // 3. PDFs bypass image compression untouched
    const pdfBlob = new Blob([new Uint8Array(50_000)], { type: 'application/pdf' });
    let encoderCalledForPdf = false;
    const pdfResult = await compressWebBlobForUpload({
      blob: pdfBlob,
      fileName: 'LabResult.pdf',
      mimeType: 'application/pdf',
      encodeFn: async () => {
        encoderCalledForPdf = true;
        return null;
      },
    });
    expect(encoderCalledForPdf).toBe(false);
    expect(pdfResult.blob).toBe(pdfBlob);
    expect(pdfResult.sizeBytes).toBe(50_000);
  });

  test('upload screens contain zero user-facing copy mentioning compression', () => {
    const webUpload = readApp('navigation/screens/files/FilesUpload.screen.web.tsx');
    const nativeUpload = readApp('navigation/screens/files/FilesUpload.screen.tsx');

    // Strip import statements before checking UI source for any 'compress' wording
    const stripImports = (s: string) =>
      s
        .split('\n')
        .filter((line) => !line.trim().startsWith('import '))
        .join('\n');

    expect(/compressing|compressed/i.test(stripImports(webUpload))).toBe(false);
    expect(/compressing|compressed/i.test(stripImports(nativeUpload))).toBe(false);
  });
});
