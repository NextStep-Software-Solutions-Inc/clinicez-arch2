# Patient app restyle guide (design tokens)

The patient app (mobile **and** web) uses the shared `@clinicez/design-tokens` package so it matches
the portal and clinic-app. **No screen or component may hard-code colours, font sizes or radii.**
Enforced by `bun run lint:patient-tokens` (script: `apps/patient-app/scripts/check-tokens.mjs`).

## Getting the theme

```tsx
import { useAppTheme } from '../../contexts/ThemeContext';   // relative import (never bare `constants/...`)
const { colors, spacing, radii, sizes, shadows, typography, dark } = useAppTheme();
```

Do **not** use `useTheme()` from `@react-navigation/native` for colours any more, and do not write
`isDark ? '#...' : '#...'` ternaries - semantic tokens already switch between light and dark.

## Replace hard-coded values

| Instead of | Use |
| --- | --- |
| blue `#3B82F6` / `#2563EB` / `#1D4ED8` (brand) | `colors.primary` / `primaryHover` / `primaryDark` (teal) |
| light blue tints (`#EFF6FF`, `#DBEAFE`, `rgba(59,130,246,.1)`) | `primarySubtle`, `primaryLight`, `primaryBorder` |
| `#FFFFFF` card/panel | `colors.card` / `surface` ; text on a primary button: `colors.onPrimary` |
| page background `#F8FAFC`/`#F1F5F9`, dark `#0F172A` | `colors.background` / `surfaceMuted` / `surfaceSubtle` |
| body text `#0F172A`/`#1E293B` | `colors.text` ; secondary `#475569`/`#64748B` -> `textSecondary` ; muted `#94A3B8` -> `textMuted` / `textLight` |
| borders `#E2E8F0`/`#CBD5E1` | `colors.border` / `borderLight` / `borderDark` |
| red `#EF4444`/`#DC2626` (+ bg `#FEE2E2`, text `#991B1B`) | `emergency`, `emergencyBg`, `emergencyBorder`, `emergencyText` |
| orange `#F97316`/`#EA580C` | `urgent`, `urgentBg`, `urgentBorder`, `urgentText` |
| green `#10B981`/`#22C55E`/`#16A34A` | `success`, `successBg`, `successBorder`, `successText` |
| amber/yellow `#F59E0B`/`#EAB308` | `warning`, `warningBg`, `warningBorder`, `warningText` |
| other blue (informational) | `info`, `infoBg`, `infoBorder`, `infoText` |
| violet/purple | `purple`, `purpleBg`, `purpleBorder`, `purpleText` |
| `rgba(0,0,0,.5)` backdrops | `colors.overlay` |
| `shadowColor/shadowOffset/shadowOpacity/shadowRadius/elevation` | spread `...shadows.sm \| md \| lg` |
| `fontSize: 12..36`, `fontWeight`, `lineHeight` | `<ThemedText variant="display\|h1\|h2\|title\|h3\|bodyLarge\|body\|bodyBold\|small\|smallBold\|caption\|captionBold\|badge">` (or `...typography.body` in styles) |
| `borderRadius: 4/6/8/10/12/14/16/20/24/999` | `radii.xs/sm/md/lg/xl/2xl/full` (8->sm or md, 12->md/lg, 16->lg, 20->xl, 999->full) |
| `padding/margin/gap: 4..56` | `spacing.xs(4) sm(8) md(12) lg(16) xl(20) 2xl(24) 3xl(32) 4xl(40) 5xl(56)` |
| icon `size={18}` etc. | `sizes.iconSm(16) iconMd(20) iconLg(24) iconXl(32)` |
| min tap target `44` | `sizes.touchTarget` |

`<ThemedText color="textMuted">` accepts a **token name**; an explicit style colour is also fine as long as it
comes from `colors.*`.

Keep numbers that are *layout*, not design tokens (flex, width/height of images, percentages, zIndex,
opacity, aspect ratios). The guard only flags colours, fontSize, borderRadius, emoji, `Alert.alert` and raw
`MaterialSymbol`/`SFSymbol`.

## Icons

* Never use emoji as icons (e.g. `'📅'`, `'❌'`, `'✓'`) - use `<AppIcon name="calendar" size={sizes.iconMd} color="textMuted" />`.
* `AppIcon` (`components/ui/Icon.tsx`, `Icon.web.tsx`) takes a **semantic `name`** (see `components/ui/iconNames.ts`) and works
  on iOS (SF Symbols), Android (Material Symbols) and web (Lucide). Add a new name to `iconNames.ts`, `iconRegistry.ts`
  (native) **and** `Icon.web.tsx` (Lucide) together if you need one that does not exist.
* Replace `Platform.select({ ios: <SFSymbol .../>, android: <MaterialSymbol .../> })` blocks with `<AppIcon name=... />`
  (Platform.select returns `undefined` on web, which silently hides the icon).

## Dialogs

`Alert.alert(...)` is a no-op on web. Use `import { dialog } from '@utils/dialog'`:
`dialog.alert(title, message?, buttons?)` and `await dialog.confirm({ title, message, confirmLabel, destructive })`.

## Primitives (use these instead of re-styling)

| Need | Component |
| --- | --- |
| Text | `@ui/ThemedText` (`variant`, `color`), `@ui/Text` for raw Text/TextInput replacements |
| Buttons | `@ui/Button` (variant `primary/secondary/outline/ghost/danger`, `size`, `icon`, `loading`), `@ui/IconButton` |
| Cards | `@ui/Card` (`padding`, `elevation`) |
| Badges / status chips | `@ui/Badge` (`tone`) |
| Text fields | `@ui/Input` (label, hint, error, leftIcon, right) |
| Rows, section titles, avatars, progress, stat tiles, dividers | `@ui/Primitives` (`ListRow`, `SectionHeader`, `Avatar`, `ProgressBar`, `StatTile`, `Divider`) |
| Screen scaffold (themed bg, padding, centered max width, pull-to-refresh) | `components/layout/Screen` |
| Dialog / alerts | `@utils/dialog` |
| Bottom padding above tab bar | `useContentInsets()` from `hooks/useContentInsets` (`.bottom`) - replaces `useBottomTabBarHeight` (throws outside tabs; web has no tab bar >= 768px) |

## Platform files

* Keep one shared screen where the layout is the same; add `Name.web.tsx` only when the **layout** differs on web
  (desktop multi-column, hover actions, `<input>` elements, etc.). The sidebar, page header and max-width column are
  provided by the navigator (`navigation/navigators/MainStack.web.tsx` -> `components/layout/WebAppFrame.web.tsx`), so screens
  must **not** draw their own sidebar/top nav on web.
* Web has no `@gorhom/bottom-sheet` scroll view (use `@ui/ThemedBottomSheetScrollView`), no `expo-file-system`,
  no haptics/biometrics/native push. Guard native-only modules with `Platform.OS !== 'web'` or a `.web` file.
* Responsive: use `useBreakpoint()` (`hooks/useBreakpoint.ts`) -> `isCompact` (<768), `isWorkstation` (>=768), `isDesktop` (>=1024), `isWide` (>=1280).
  Wide pages should switch to two columns (`flexDirection: 'row'`, `gap: spacing.lg`) instead of stretching.
* Web interactions: give pressables hover styles (`Pressable` style callback `{ hovered }`), visible keyboard focus
  (never remove outlines without replacement), `accessibilityRole`/`accessibilityLabel` on icon-only buttons.

## Verify every slice

```
cd apps/patient-app
bunx tsc --noEmit                      # must stay clean
node scripts/check-tokens.mjs --report # violations should go down (never up)
node scripts/check-tokens.mjs --update-baseline   # ratchet baseline after a slice is done
```
