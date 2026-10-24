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
        ...(accessibilityLabel !== undefined ? { 'aria-label': accessibilityLabel } : {}),
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

const { default: Button } = await import('../components/common/Button');
mock.module('../components/ui/Button', () => ({
  default: Button,
}));

describe('Empirical Challenger: Button Title Normalization & Edge Cases Suite', () => {
  // Case 1: "+ Order Procedure"
  describe('Case 1: "+ Order Procedure"', () => {
    test('with icon="plus": title normalized to "Order Procedure", no double "+ +", accessibilityLabel normalized', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+ Order Procedure',
          icon: 'plus',
        })
      );
      expect(html).toContain('Order Procedure');
      expect(html).not.toContain('+ Order Procedure');
      expect(html).not.toContain('+ +');
      expect(html).toContain('aria-label="Order Procedure"');
    });

    test('without icon="plus": title preserved as "+ Order Procedure", accessibilityLabel intact', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+ Order Procedure',
        })
      );
      expect(html).toContain('+ Order Procedure');
      expect(html).toContain('aria-label="+ Order Procedure"');
    });
  });

  // Case 2: "+Order Procedure"
  describe('Case 2: "+Order Procedure"', () => {
    test('with icon="plus": title normalized to "Order Procedure", accessibilityLabel normalized', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+Order Procedure',
          icon: 'plus',
        })
      );
      expect(html).toContain('Order Procedure');
      expect(html).not.toContain('+Order Procedure');
      expect(html).toContain('aria-label="Order Procedure"');
    });

    test('without icon="plus": title preserved as "+Order Procedure"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+Order Procedure',
        })
      );
      expect(html).toContain('+Order Procedure');
      expect(html).toContain('aria-label="+Order Procedure"');
    });
  });

  // Case 3: "Order Procedure"
  describe('Case 3: "Order Procedure"', () => {
    test('with icon="plus": title untouched as "Order Procedure"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: 'Order Procedure',
          icon: 'plus',
        })
      );
      expect(html).toContain('Order Procedure');
      expect(html).toContain('aria-label="Order Procedure"');
    });

    test('without icon="plus": title untouched as "Order Procedure"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: 'Order Procedure',
        })
      );
      expect(html).toContain('Order Procedure');
      expect(html).toContain('aria-label="Order Procedure"');
    });
  });

  // Case 4: "+"
  describe('Case 4: "+"', () => {
    test('with icon="plus": strips "+" leaving empty text, with fallback aria-label="Add"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+',
          icon: 'plus',
        })
      );
      // Normalized title is "" so ThemedText is not rendered
      expect(html).not.toContain('<div data-component="Text"');
      // aria-label provides fallback 'Add' for icon-only plus button
      expect(html).toContain('aria-label="Add"');
    });

    test('without icon="plus": title preserved as "+", aria-label="+"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: '+',
        })
      );
      expect(html).toContain('aria-label="+"');
      expect(html).toContain('>+</div');
    });
  });

  // Case 5: " + Add" (leading whitespace before +)
  describe('Case 5: " + Add" (leading whitespace before +)', () => {
    test('with icon="plus": normalizes title to "Add", renders without "+", and has aria-label="Add"', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: ' + Add',
          icon: 'plus',
        })
      );
      // Svg icon is rendered
      expect(html).toContain('lucide-plus');
      // Leading whitespace and plus are stripped: renders "Add", no "+ +"
      expect(html).toContain('Add');
      expect(html).not.toContain('+ Add');
      expect(html).not.toContain('+ +');
      expect(html).toContain('aria-label="Add"');
    });

    test('without icon="plus": preserves " + Add" cleanly without icon', () => {
      const html = renderToStaticMarkup(
        React.createElement(Button, {
          title: ' + Add',
        })
      );
      expect(html).not.toContain('lucide-plus');
      expect(html).toContain('> + Add</div>');
      expect(html).toContain('aria-label=" + Add"');
    });
  });
});
