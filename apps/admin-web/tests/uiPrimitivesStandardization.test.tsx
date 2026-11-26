import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button, Chip, Tabs, TabList, TabButton, Text } from '../src/components/ui';

const ADMIN_SRC_ROOT = path.resolve(__dirname, '../src');
const UI_PRIMITIVES_DIR = path.resolve(ADMIN_SRC_ROOT, 'components/ui');

function collectTsxFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Admin Web Unified Single-Line UI Primitives (Button, Chip, Tabs, Text)', () => {
  test('Button enforces single-line truncation, no-wrap, and automatic hover tooltip', () => {
    const html = renderToStaticMarkup(
      <Button variant="primary" size="md">
        Import All Clinic Records
      </Button>
    );

    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-ui-tooltip="Import All Clinic Records"');
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('truncate');
    expect(html).toContain('title="Import All Clinic Records"');
  });

  test('Button preserves explicit title override and falls back to aria-label for icon-only buttons', () => {
    const customTooltipHtml = renderToStaticMarkup(
      <Button title="Force reload directory" variant="secondary">
        Refresh
      </Button>
    );
    expect(customTooltipHtml).toContain('title="Force reload directory"');

    const iconOnlyHtml = renderToStaticMarkup(
      <Button variant="ghost" size="iconSm" aria-label="Close modal">
        <svg aria-hidden="true" />
      </Button>
    );
    expect(iconOnlyHtml).toContain('title="Close modal"');
    expect(iconOnlyHtml).toContain('aria-label="Close modal"');
  });

  test('Chip enforces single-line truncation, no-wrap, optional dot, and hover tooltip', () => {
    const html = renderToStaticMarkup(
      <Chip tone="warning" dot>
        Duplicate Email Needs Review
      </Chip>
    );

    expect(html).toContain('data-slot="chip"');
    expect(html).toContain('data-ui-tooltip="Duplicate Email Needs Review"');
    expect(html).toContain('data-tooltip-trigger="always"');
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('truncate');
    expect(html).toContain('title="Duplicate Email Needs Review"');
    expect(html).toContain('bg-amber-500');
  });

  test('Tabs, TabList, and TabButton enforce single-line no-wrap tabs with hover tooltips and responsive full-width', () => {
    const html = renderToStaticMarkup(
      <Tabs
        ariaLabel="Filter patient sign-in status"
        fullWidthUntil="xl"
        value="UNLINKED"
        onValueChange={() => {}}
        items={[
          { value: 'ALL', label: 'All' },
          { value: 'UNLINKED', label: 'Awaiting Sign-Up' },
        ]}
      />
    );

    expect(html).toContain('role="tablist"');
    expect(html).toContain('role="tab"');
    expect(html).toContain('data-slot="tab-list"');
    expect(html).toContain('data-slot="tab-button"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('whitespace-nowrap');
    expect(html).toContain('truncate');
    expect(html).toContain('title="Awaiting Sign-Up"');
    expect(html).toContain('flex-1 xl:flex-none');

    const composableHtml = renderToStaticMarkup(
      <TabList ariaLabel="Workspace tabs">
        <TabButton active badge={<Chip size="xs">4</Chip>}>
          Clinic Sync
        </TabButton>
      </TabList>
    );
    expect(composableHtml).toContain('title="Clinic Sync"');
    expect(composableHtml).toContain('data-slot="chip"');
  });

  test('Text enforces single-line truncation with automatic hover tooltip across span and label elements', () => {
    const labelHtml = renderToStaticMarkup(
      <Text as="label" htmlFor="clinic-slug" variant="label">
        Clinic Workspace Slug
      </Text>
    );

    expect(labelHtml).toContain('<label');
    expect(labelHtml).toContain('for="clinic-slug"');
    expect(labelHtml).toContain('truncate');
    expect(labelHtml).toContain('whitespace-nowrap');
    expect(labelHtml).toContain('title="Clinic Workspace Slug"');

    const spanHtml = renderToStaticMarkup(
      <Text variant="mono">very-long-patient-email@example-hospital.org</Text>
    );
    expect(spanHtml).toContain('title="very-long-patient-email@example-hospital.org"');
    expect(spanHtml).toContain('truncate');
  });

  test('zero raw <button> elements remain outside src/components/ui', () => {
    const files = collectTsxFiles(ADMIN_SRC_ROOT).filter(
      (f) => !f.startsWith(UI_PRIMITIVES_DIR + path.sep)
    );
    expect(files.length).toBeGreaterThan(25);

    const offenders: string[] = [];
    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf-8');
      if (/<button(?:\s|>|\n|$)/.test(source)) {
        offenders.push(path.relative(ADMIN_SRC_ROOT, filePath));
      }
    }

    expect(offenders).toEqual([]);
  });

  test('zero raw role="tab" or role="tablist" markup remains outside src/components/ui', () => {
    const files = collectTsxFiles(ADMIN_SRC_ROOT).filter(
      (f) => !f.startsWith(UI_PRIMITIVES_DIR + path.sep)
    );

    const offenders: string[] = [];
    for (const filePath of files) {
      const source = fs.readFileSync(filePath, 'utf-8');
      if (/role=["']tablist?["']/.test(source)) {
        offenders.push(path.relative(ADMIN_SRC_ROOT, filePath));
      }
    }

    expect(offenders).toEqual([]);
  });

  test('GlobalUiTooltip is mounted in root layout and zero <Chip> elements opt out of hover tooltips', () => {
    const rootSource = fs.readFileSync(path.resolve(ADMIN_SRC_ROOT, 'routes/__root.tsx'), 'utf-8');
    expect(rootSource).toContain('<GlobalUiTooltip');

    const files = collectTsxFiles(ADMIN_SRC_ROOT).filter(
      (f) => !f.startsWith(UI_PRIMITIVES_DIR + path.sep)
    );
    const chipOffenders: string[] = [];
    const truncateOffenders: string[] = [];

    for (const filePath of files) {
      const rel = path.relative(ADMIN_SRC_ROOT, filePath);
      const source = fs.readFileSync(filePath, 'utf-8');
      for (const match of source.matchAll(/<Chip\b[^>]*>/g)) {
        if (/tooltip=\{false\}/.test(match[0])) {
          chipOffenders.push(rel);
        }
      }
      for (const match of source.matchAll(/<([a-zA-Z0-9_]+)\b[^>]*\btruncate\b[^>]*>/g)) {
        const tag = match[1];
        if (!['Text', 'Button', 'Chip', 'TabButton'].includes(tag) && !/\btitle=/.test(match[0])) {
          truncateOffenders.push(`${rel}:<${tag}>`);
        }
      }
    }

    expect(chipOffenders).toEqual([]);
    expect(truncateOffenders).toEqual([]);
  });
});
