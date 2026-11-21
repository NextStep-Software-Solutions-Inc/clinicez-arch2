import { describe, expect, test } from "bun:test";
import * as fs from "fs";
import * as path from "path";
import React from "react";
import { renderToString } from "react-dom/server";
import { SelectField } from "../src/components/ui/select";

const PORTAL_SRC_ROOT = path.resolve(__dirname, "../src");

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

describe("Portal SelectField Cross-Browser Standardization", () => {
  test("renders a Radix combobox trigger with selected label during SSR", () => {
    const html = renderToString(
      React.createElement(SelectField, {
        id: "currency-select",
        ariaLabel: "Workspace Currency",
        value: "PHP",
        onValueChange: () => {},
        options: [
          { value: "PHP", label: "Philippine Peso (PHP)" },
          { value: "USD", label: "US Dollar (USD)" },
        ],
      })
    );

    expect(html).toContain('<button type="button" role="combobox"');
    expect(html).not.toContain('<select id="currency-select"');
    expect(html).toContain('id="currency-select"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-label="Workspace Currency"');
    expect(html).toContain('data-slot="select-trigger"');
    expect(html).toContain('data-slot="select-value"');
    expect(html).toContain("Philippine Peso (PHP)");
    expect(html).not.toContain("data-placeholder");
  });

  test("maps empty-string filter options cleanly without throwing and displays the empty option label", () => {
    const html = renderToString(
      React.createElement(SelectField, {
        id: "facility-filter",
        value: "",
        onValueChange: () => {},
        options: [
          { value: "", label: "All facilities" },
          { value: "fac-1", label: "Nextstep CDO" },
        ],
      })
    );

    expect(html).toContain('id="facility-filter"');
    expect(html).toContain("All facilities");
    expect(html).not.toContain("data-placeholder");
  });

  test("renders placeholder with data-placeholder when value is unset and no empty option exists", () => {
    const html = renderToString(
      React.createElement(SelectField, {
        id: "member-select",
        value: "",
        onValueChange: () => {},
        placeholder: "Choose a member",
        options: [
          { value: "user-1", label: "Dr. Ana Reyes" },
          { value: "user-2", label: "Dr. Carlo Santos" },
        ],
      })
    );

    expect(html).toContain('data-placeholder=""');
    expect(html).toContain("Choose a member");
  });

  test("supports disabled state, size variants, and custom height class overrides via tailwind-merge", () => {
    const disabledHtml = renderToString(
      React.createElement(SelectField, {
        value: "active",
        onValueChange: () => {},
        disabled: true,
        size: "sm",
        options: [{ value: "active", label: "Active" }],
      })
    );

    expect(disabledHtml).toContain("disabled");
    expect(disabledHtml).toContain('data-size="sm"');
    expect(disabledHtml).toContain("h-8");

    const customHeightHtml = renderToString(
      React.createElement(SelectField, {
        value: "opt-1",
        onValueChange: () => {},
        size: "default",
        className: "h-11 bg-slate-50",
        options: [{ value: "opt-1", label: "Option 1" }],
      })
    );

    expect(customHeightHtml).toContain("h-11");
    expect(customHeightHtml).not.toContain("data-[size=default]:h-9");
    expect(customHeightHtml).not.toContain(" h-9 ");
  });

  test("deduplicates repeated option values cleanly during rendering", () => {
    const html = renderToString(
      React.createElement(SelectField, {
        value: "CLINIC",
        onValueChange: () => {},
        options: [
          { value: "CLINIC", label: "Outpatient Clinic" },
          { value: "CLINIC", label: "Duplicate Clinic Label" },
          { value: "PHARMACY", label: "Pharmacy" },
        ],
      })
    );

    expect(html).toContain("Outpatient Clinic");
    expect(html).not.toContain("Duplicate Clinic Label");
  });

  test("zero raw HTML <select> elements remain anywhere under apps/portal-web/src", () => {
    const sourceFiles = collectSourceFiles(PORTAL_SRC_ROOT);
    expect(sourceFiles.length).toBeGreaterThan(20);

    const offenders: string[] = [];
    for (const filePath of sourceFiles) {
      const source = fs.readFileSync(filePath, "utf-8");
      if (/<select(?:\s|>|\n|$)/.test(source)) {
        offenders.push(path.relative(PORTAL_SRC_ROOT, filePath));
      }
    }

    expect(offenders).toEqual([]);
  });
});
