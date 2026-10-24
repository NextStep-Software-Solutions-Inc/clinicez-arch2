// token-guard:ignore-file
import { describe, expect, test, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

(globalThis as any).__DEV__ = true;

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    testID,
    style,
    onPress,
    ...rest
  }: any) => {
    const resolvedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
    return React.createElement(
      'div',
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole, 'data-accessibility-role': accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(onPress ? { 'data-pressable': 'true' } : {}),
        'data-style': resolvedStyle ? JSON.stringify(resolvedStyle) : undefined,
        ...rest,
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('react-native', () => ({
  StyleSheet: { create: (s: any) => s, flatten: (s: any) => s, absoluteFillObject: {} },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
}));

mock.module('react-native-svg', () => ({
  Svg: 'Svg',
  Path: 'Path',
  Circle: 'Circle',
  Rect: 'Rect',
  Line: 'Line',
  default: 'Svg',
  Polyline: 'Polyline',
  Polygon: 'Polygon',
  Defs: ({ children }: any) => children,
  LinearGradient: ({ children }: any) => children,
  Stop: () => null,
  G: ({ children }: any) => children,
  Text: ({ children }: any) => children,
}));

mock.module('@expo-google-fonts/geist', () => ({
  useFonts: () => [true],
}));

mock.module('@expo-google-fonts/geist-mono', () => ({
  useFonts: () => [true],
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

// Import genuine Button from components/common/Button (and re-register mock on ../components/ui/Button
// to prevent upstream mock pollution from other suites like patientDirectoryUi)
const { default: Button } = await import('../components/common/Button');
mock.module('../components/ui/Button', () => ({
  default: Button,
}));

describe('Button — UI Component & Title Normalization Suite', () => {
  test('1. Normalizes title by stripping leading "+ " when icon="plus"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+ Order Procedure',
        icon: 'plus',
      })
    );

    expect(html).toContain('Order Procedure');
    expect(html).not.toContain('+ Order Procedure');
    expect(html).not.toContain('+ +');
  });

  test('2. Normalizes title by stripping leading "+" (no space) when icon="plus"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+Add procedure',
        icon: 'plus',
      })
    );

    expect(html).toContain('Add procedure');
    expect(html).not.toContain('+Add procedure');
  });

  test('3. Leaves clean title intact without stripping characters when icon="plus"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: 'Order Procedure for Tooth #16',
        icon: 'plus',
      })
    );

    expect(html).toContain('Order Procedure for Tooth #16');
    expect(html).not.toContain('+ Order Procedure');
  });

  test('4. Does NOT strip leading "+" when icon is not plus', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+ Add Notes',
        icon: 'edit',
      })
    );

    expect(html).toContain('+ Add Notes');
  });

  test('5. Does NOT strip leading "+" when no icon is provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+ Increment',
      })
    );

    expect(html).toContain('+ Increment');
  });

  test('6. Accessibility label receives normalized title when not explicitly provided', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+ Order Procedure',
        icon: 'plus',
      })
    );

    expect(html).toContain('aria-label="Order Procedure"');
  });

  test('7. Explicit accessibilityLabel overrides normalized title in accessibility props', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+ Order Procedure',
        icon: 'plus',
        accessibilityLabel: 'Custom Action Label',
      })
    );

    expect(html).toContain('aria-label="Custom Action Label"');
  });

  test('8. Renders loading indicator and disables pressable when loading=true', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: 'Saving...',
        loading: true,
      })
    );

    expect(html).toContain('ActivityIndicator');
    expect(html).toContain('&quot;busy&quot;:true');
    expect(html).toContain('&quot;disabled&quot;:true');
  });

  test('9. Supports multiple variants (primary, secondary, outline, danger, success, ghost)', () => {
    const variants = ['primary', 'secondary', 'outline', 'danger', 'success', 'ghost'] as const;
    for (const v of variants) {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: `Action ${v}`,
          variant: v,
        })
      );
      expect(html).toContain(`Action ${v}`);
    }
  });

  test('10. iconOnly renders container without title text element', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: 'Should Be Hidden In Text',
        icon: 'close',
        iconOnly: true,
      })
    );

    // Text child should not be rendered, but aria-label is preserved for screen readers
    expect(html).not.toContain('>Should Be Hidden In Text<');
    expect(html).toContain('aria-label="Should Be Hidden In Text"');
  });

  test('11. Normalizes title with leading whitespace before plus sign when icon="plus"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '   + Add',
        icon: 'plus',
      })
    );

    expect(html).toContain('Add');
    expect(html).not.toContain('+ Add');
    expect(html).not.toContain('+ +');
    expect(html).toContain('aria-label="Add"');
  });

  test('12. Provides fallback accessibility label "Add" when title="+" and icon="plus"', () => {
    const html = renderToStaticMarkup(
      React.createElement(Button, {
        title: '+',
        icon: 'plus',
      })
    );

    expect(html).not.toContain('<div data-component="Text"');
    expect(html).toContain('aria-label="Add"');
  });
});
