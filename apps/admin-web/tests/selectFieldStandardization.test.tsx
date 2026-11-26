import { describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SelectField } from '../src/components/ui/SelectField';

const ADMIN_SRC_ROOT = path.resolve(__dirname, '../src');

function collectSourceFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

describe('Admin Web SelectField Cross-Browser Standardization', () => {
  test('renders custom accessible combobox trigger with selected label and badge', () => {
    const html = renderToString(
      React.createElement(SelectField, {
        id: 'tenant-status-filter',
        ariaLabel: 'Filter tenants by status',
        value: 'ACTIVE',
        onValueChange: () => {},
        options: [
          { value: 'ALL', label: 'All Statuses' },
          { value: 'ACTIVE', label: 'Active', badge: 'Live' },
        ],
      })
    );

    expect(html).toContain('role="combobox"');
    expect(html).not.toContain('<select');
    expect(html).toContain('id="tenant-status-filter"');
    expect(html).toContain('aria-label="Filter tenants by status"');
    expect(html).toContain('data-slot="select-trigger"');
    expect(html).toContain('data-slot="select-value"');
    expect(html).toContain('Active');
    expect(html).toContain('Live');
    expect(html).not.toContain('data-placeholder');
  });

  test('renders placeholder with data-placeholder when value is unset and no empty option exists', () => {
    const html = renderToString(
      React.createElement(SelectField, {
        ariaLabel: 'Target Tenant',
        value: '',
        onValueChange: () => {},
        placeholder: 'Select a tenant...',
        options: [
          { value: 'ustp-cdo', label: 'USTP Medical Clinic' },
          { value: 'cebu-doc', label: 'Cebu Doctors Clinic' },
        ],
      })
    );

    expect(html).toContain('data-placeholder=""');
    expect(html).toContain('Select a tenant...');
  });

  test('maps empty-string options cleanly and displays the matching label', () => {
    const html = renderToString(
      React.createElement(SelectField, {
        ariaLabel: 'Billing Cadence',
        value: '',
        onValueChange: () => {},
        options: [
          { value: '', label: 'Select cadence...' },
          { value: 'monthly', label: 'Monthly' },
        ],
      })
    );

    expect(html).toContain('Select cadence...');
    expect(html).not.toContain('data-placeholder');
  });

  test('supports disabled state, size variants, and deduplicates repeated values', () => {
    const html = renderToString(
      React.createElement(SelectField, {
        ariaLabel: 'Conflict Status',
        value: 'OPEN',
        onValueChange: () => {},
        disabled: true,
        size: 'sm',
        options: [
          { value: 'OPEN', label: 'Needs review' },
          { value: 'OPEN', label: 'Duplicate Open' },
        ],
      })
    );

    expect(html).toContain('disabled');
    expect(html).toContain('data-size="sm"');
    expect(html).toContain('Needs review');
    expect(html).not.toContain('Duplicate Open');
  });

  test('zero raw HTML <select> elements remain anywhere under apps/admin-web/src', () => {
    const sourceFiles = collectSourceFiles(ADMIN_SRC_ROOT);
    expect(sourceFiles.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const filePath of sourceFiles) {
      const source = fs.readFileSync(filePath, 'utf-8');
      if (/<select(?:\s|>|\n|$)/.test(source)) {
        offenders.push(path.relative(ADMIN_SRC_ROOT, filePath));
      }
    }

    expect(offenders).toEqual([]);
  });
});
