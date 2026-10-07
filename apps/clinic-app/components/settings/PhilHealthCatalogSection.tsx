import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import ThemedText from '../ui/ThemedText';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { theme } from '../../constants/theme';
import { PERMISSIONS } from '../../constants/permissions';
import { usePermission } from '../../context/AuthContext';
import { notify } from '../../utils/feedback';
import {
  PhilHealthCatalogImportLog,
  PhilHealthCatalogImportResult,
  PhilHealthCatalogLibrary,
  philHealthCatalogService,
} from '../../services/philHealthCatalogService';

interface PickedFile {
  name: string;
  /** A browser `File` on web, `{ uri, name, type }` on native. */
  body: Blob | { uri: string; name: string; type: string };
}

const formatDate = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
};

function summarise(result: PhilHealthCatalogImportResult): string {
  return (
    `${result.library} (kit ${result.kitVersion}): ${result.added} added, ${result.updated} updated, ` +
    `${result.unchanged} unchanged, ${result.deactivated} deactivated` +
    (result.duplicatesIgnored > 0 ? `, ${result.duplicatesIgnored} duplicates ignored` : '') +
    '.'
  );
}

/**
 * Settings -> PhilHealth Catalog. The official libraries ship with the app and load on every boot; this lets an
 * administrator bring in a newer kit (`lib_*.xlsx` or the JSON equivalent) without a release. Imports are idempotent,
 * and a dry run previews the effect first.
 */
export default function PhilHealthCatalogSection() {
  const canImport = usePermission(PERMISSIONS.philHealthCatalogImport);
  const [libraries, setLibraries] = useState<PhilHealthCatalogLibrary[] | null>(null);
  const [log, setLog] = useState<PhilHealthCatalogImportLog[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [file, setFile] = useState<PickedFile | null>(null);
  const [kitVersion, setKitVersion] = useState('');
  const [busy, setBusy] = useState<'preview' | 'import' | null>(null);
  const [result, setResult] = useState<{ text: string; preview: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [libs, libsErr] = await philHealthCatalogService.getLibraries();
    if (libsErr) {
      setLoadError(libsErr.message || 'Could not load the PhilHealth catalog.');
      return;
    }
    setLoadError(null);
    setLibraries(libs ?? []);
    const [entries] = await philHealthCatalogService.getImportStatus(10);
    setLog(entries ?? []);
  }, []);

  useEffect(() => {
    if (canImport) refresh();
  }, [canImport, refresh]);

  if (!canImport) return null;

  const pick = async () => {
    const picked = await DocumentPicker.getDocumentAsync({
      type: [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/json',
        '*/*',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];
    setResult(null);
    setError(null);
    setFile({
      name: asset.name,
      body: asset.file ?? { uri: asset.uri, name: asset.name, type: asset.mimeType ?? 'application/octet-stream' },
    });
  };

  const run = async (dryRun: boolean) => {
    if (!file) return;
    const isSpreadsheet = /\.xlsx$/i.test(file.name);
    if (isSpreadsheet && !kitVersion.trim()) {
      setError('Enter the PhilHealth kit version for this spreadsheet (for example 2025.01).');
      return;
    }
    setBusy(dryRun ? 'preview' : 'import');
    setError(null);
    const [res, err] = await philHealthCatalogService.importLibrary({
      file: file.body,
      fileName: file.name,
      kitVersion: kitVersion.trim() || undefined,
      dryRun,
    });
    setBusy(null);
    if (err || !res) {
      setError(err?.message || 'The import failed.');
      return;
    }
    setResult({ text: summarise(res), preview: dryRun });
    if (!dryRun) {
      notify.success('PhilHealth catalog updated.');
      setFile(null);
      await refresh();
    }
  };

  return (
    <Card>
      <CardHeader
        title="PhilHealth Catalog"
        subtitle="Official PhilHealth libraries used for diagnoses, medicines, symptoms and the member profile."
        rightAction={<Badge label={libraries ? `${libraries.length} libraries` : 'Loading'} variant="neutral" />}
      />
      <CardContent>
        <View style={styles.stack}>
          {loadError ? (
            <View style={styles.row}>
              <ThemedText variant="small" color={theme.colors.emergencyText}>
                {loadError}
              </ThemedText>
              <Button title="Retry" variant="secondary" size="sm" icon="refresh" onPress={refresh} />
            </View>
          ) : null}

          {libraries?.map((lib) => (
            <View key={lib.library} style={styles.libraryRow}>
              <View style={styles.libraryName}>
                <ThemedText variant="bodyBold">{lib.library}</ThemedText>
                <ThemedText variant="small" color={theme.colors.textMuted}>
                  Kit {lib.kitVersion} · loaded {formatDate(lib.loadedAt)}
                </ThemedText>
              </View>
              <Badge label={`${lib.activeCount} active`} variant="success" />
              <Badge label={String(lib.source)} variant="outline" />
            </View>
          ))}

          <View style={styles.divider} />

          <ThemedText variant="bodyBold">Import a newer kit</ThemedText>
          <ThemedText variant="small" color={theme.colors.textMuted}>
            Choose an official lib_*.xlsx file or the JSON equivalent. Run a preview first; importing the same file twice
            changes nothing.
          </ThemedText>
          <View style={styles.row}>
            <Button title={file ? 'Choose a different file' : 'Choose file'} variant="secondary" icon="upload" onPress={pick} />
            {file ? <ThemedText variant="small">{file.name}</ThemedText> : null}
          </View>
          <Input label="Kit version" value={kitVersion} onChangeText={setKitVersion} placeholder="Required for spreadsheets" />
          {error ? (
            <ThemedText variant="small" color={theme.colors.emergencyText}>
              {error}
            </ThemedText>
          ) : null}
          {result ? (
            <ThemedText variant="small" color={result.preview ? theme.colors.infoText : theme.colors.successText}>
              {result.preview ? 'Preview only, nothing was changed. ' : ''}
              {result.text}
            </ThemedText>
          ) : null}
          <View style={styles.row}>
            <Button
              title="Preview"
              variant="secondary"
              disabled={!file || busy !== null}
              loading={busy === 'preview'}
              onPress={() => run(true)}
            />
            <Button title="Import" disabled={!file || busy !== null} loading={busy === 'import'} onPress={() => run(false)} />
          </View>

          {log.length > 0 ? (
            <>
              <View style={styles.divider} />
              <ThemedText variant="bodyBold">Recent imports</ThemedText>
              {log.map((entry, index) => (
                <ThemedText key={`${entry.at}-${entry.library}-${index}`} variant="small" color={theme.colors.textMuted}>
                  {formatDate(entry.at)} · {entry.library} kit {entry.kitVersion} · {String(entry.status)} · +{entry.added} ~
                  {entry.updated} -{entry.deactivated} · {entry.by}
                </ThemedText>
              ))}
            </>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  libraryName: {
    flex: 1,
    minWidth: 200,
  },
  divider: {
    height: theme.sizes.borderWidth,
    backgroundColor: theme.colors.border,
  },
});
