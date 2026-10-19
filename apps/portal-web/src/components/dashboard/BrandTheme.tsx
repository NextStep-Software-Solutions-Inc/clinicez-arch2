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
        `}`;

    return <style data-workspace-brand dangerouslySetInnerHTML={{ __html: css }} />;
}
