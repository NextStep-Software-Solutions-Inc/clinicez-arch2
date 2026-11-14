import { isUsableAccent, readableForeground } from "@/lib/color";

/**
 * Applies the workspace accent color to the dashboard by overriding the design-token CSS variables
 * (`--primary`, `--ring`, `--sidebar-primary`). Rendered server-side so there is no color flash, and
 * emitted as a global rule so portaled UI (dialogs, dropdowns) is themed too. The style element is
 * removed automatically when the user leaves the tenant dashboard.
 *
 * The value is validated against a strict `#RRGGBB` pattern *and* a contrast floor before being
 * interpolated into CSS, so a bad stored value can neither inject CSS nor make buttons unreadable.
 */
function hexAlpha(hex: string, alpha: number): string {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean.slice(0, 6);
    const num = parseInt(full, 16);
    if (Number.isNaN(num)) return `color-mix(in srgb, ${hex} ${Math.round(alpha * 100)}%, transparent)`;
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

export function BrandTheme({ accentColorHex }: { accentColorHex?: string | null }) {
    if (!isUsableAccent(accentColorHex)) return null;

    const foreground = readableForeground(accentColorHex);
    const css =
        `:root,.dark{` +
        `--primary:${accentColorHex};` +
        `--primary-foreground:${foreground};` +
        `--ring:${accentColorHex};` +
        `--sidebar-primary:${accentColorHex};` +
        `--sidebar-primary-foreground:${foreground};` +
        `--ez-primary:${accentColorHex};` +
        `--ez-on-primary:${foreground};` +
        `--ez-primary-shadow-subtle:${hexAlpha(accentColorHex, 0.22)};` +
        `--ez-primary-shadow-sm:${hexAlpha(accentColorHex, 0.34)};` +
        `--ez-primary-shadow-md:${hexAlpha(accentColorHex, 0.46)};` +
        `}`;

    return <style data-workspace-brand dangerouslySetInnerHTML={{ __html: css }} />;
}
