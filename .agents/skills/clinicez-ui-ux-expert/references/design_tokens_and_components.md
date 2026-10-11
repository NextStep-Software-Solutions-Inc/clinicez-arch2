# Design Tokens & UI/UX Component Reference

This reference document presents complete token tables, typography scales, light/dark mode pairings, accessibility standards, and UI/UX component patterns for ClinicEZ frontends.

---

## 1. Complete Semantic Token Reference (`semantic.ts`)

| Token Name | Light Mode Value | Dark Mode Value | UI/UX Usage & Intent |
|---|---|---|---|
| `primary` | `#0D6963` (Teal 600) | `#34C3A6` (Teal 400) | Primary CTA buttons, key active navigation, brand focal points |
| `primaryHover` | `#0A5651` (Teal 700) | `#6EDCC3` (Teal 300) | Hover/Active feedback on primary actions |
| `primarySubtle` | `#F0FDF9` (Teal 50) | `#031C1A` (Teal 950) | Table row hover, selected card background |
| `onPrimary` | `#FFFFFF` | `#0A1020` | High-contrast text on primary background |
| `background` | `#F8FAFC` (Slate 50) | `#0A1020` (Slate 950) | Main app viewport background |
| `surface` | `#FFFFFF` (Slate 0) | `#0F172A` (Slate 900) | Cards, modals, drawers, dropdown menus |
| `surfaceMuted` | `#F8FAFC` | `#1E293B` | Table headers, secondary toolbars |
| `border` | `#E2E8F0` (Slate 200) | `#1E293B` (Slate 800) | Input borders, card dividers |
| `text` | `#0F172A` (Slate 900) | `#F8FAFC` (Slate 50) | Primary body text and headers |
| `textSecondary` | `#475569` (Slate 600) | `#CBD5E1` (Slate 300) | Subtitles, secondary descriptions |
| `textMuted` | `#64748B` (Slate 500) | `#94A3B8` (Slate 400) | Field labels, timestamp metadata |

---

## 2. Typography Scale & Hierarchy

```typescript
export const fontSizes = {
  xs: 12,    // Badges, timestamps, subtle captions
  sm: 14,    // Table data, form input text, secondary buttons
  base: 16,  // Standard body text, primary button text
  lg: 18,    // Card titles, subheadings
  xl: 20,    // Page section headers
  '2xl': 24, // Page titles
  '3xl': 30, // Dashboard KPIs
  '4xl': 36, // Hero headers
};

export const fontWeights = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
};
```

---

## 3. Empty & Loading State UX Patterns

### Skeleton Loader Pattern (Web & Mobile)

```tsx
export function SkeletonCard() {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 animate-pulse">
      <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/3 mb-4" />
      <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-2" />
      <div className="h-3 bg-slate-100 dark:bg-slate-800 rounded w-2/3" />
    </div>
  );
}
```

### Actionable Empty State Pattern

```tsx
interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
      <h4 className="text-base font-semibold text-slate-900 dark:text-slate-50">{title}</h4>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="mt-4 inline-flex items-center px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md shadow-sm"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
```

---

## 4. Accessibility & Touch Guidelines

1. **Contrast Compliance**: Minimum contrast ratio of 4.5:1 for standard text (enforced by `tokens.test.ts`).
2. **Touch Target Size**: Minimum 44x44px touch targets on mobile (`clinic-app` / Expo).
3. **Focus States**: Interactive elements must include visible focus rings (`focusRing`: Teal 500).
