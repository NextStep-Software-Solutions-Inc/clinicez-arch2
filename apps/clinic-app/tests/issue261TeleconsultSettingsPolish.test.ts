// token-guard:ignore-file
/**
 * Issue #261 Verification Suite: TeleconsultSettingsCard Copy, Labels, and State Polish
 *
 * Covers:
 * 1. Human-readable Recording Policy pill labels ("Workspace Vault Only", "Clinic Vault & Patient")
 *    while preserving raw API enum persistence ("WorkspaceVaultOnly", "Both", "Disabled").
 * 2. Plain clinical/admin copy ("Controls encrypted video recording storage during teleconsultations",
 *    contextual active-policy helper copy, and "Changes save automatically").
 * 3. Immediate subtle save-status indicator ("Saving changes..." -> "Saved at ...") when editing
 *    numeric fields (fee / retention days) and clean reversion if reverted before debounce fires.
 * 4. Conditional visual & interactive muting of Retention Policy (Days) and Dual Informed Consent
 *    Requirement when Recording Policy is "Disabled", without double-dimming when master switch is off.
 * 5. Design-token compliance (zero raw hex color literals in TeleconsultSettingsCard.tsx).
 */

import { describe, expect, test, mock, beforeEach } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';

(globalThis as any).__DEV__ = true;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// =============================================================================
// Lightweight Virtual DOM for Interactive React 19 Component Testing
// =============================================================================

class MiniNode {
  nodeType: number;
  tagName: string;
  nodeName: string;
  parentNode: MiniNode | null = null;
  childNodes: MiniNode[] = [];
  attrs: Record<string, any> = {};
  style: Record<string, any> = {};
  dataset: Record<string, string> = {};
  listeners: Record<string, Set<Function>> = {};
  value: string = '';
  nodeValue: string = '';
  ownerDocument: any = null;

  constructor(nodeType: number, tagName: string, text = '', ownerDocument: any = null) {
    this.nodeType = nodeType;
    this.tagName = tagName.toUpperCase();
    this.nodeName = nodeType === 3 ? '#text' : nodeType === 8 ? '#comment' : this.tagName;
    this.nodeValue = text;
    this.ownerDocument = ownerDocument;
  }

  get children(): MiniNode[] {
    return this.childNodes.filter((c) => c.nodeType === 1);
  }

  get firstChild(): MiniNode | null {
    return this.childNodes[0] ?? null;
  }

  get textContent(): string {
    if (this.nodeType === 3) return this.nodeValue;
    if (this.nodeType === 8) return '';
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(val: string) {
    this.childNodes = [];
    if (val) {
      this.appendChild(new MiniNode(3, '', String(val), this.ownerDocument));
    }
  }

  appendChild(child: MiniNode): MiniNode {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(newNode: MiniNode, refNode: MiniNode | null): MiniNode {
    if (!refNode) return this.appendChild(newNode);
    if (newNode.parentNode) newNode.parentNode.removeChild(newNode);
    const idx = this.childNodes.indexOf(refNode);
    newNode.parentNode = this;
    newNode.ownerDocument = this.ownerDocument;
    if (idx === -1) this.childNodes.push(newNode);
    else this.childNodes.splice(idx, 0, newNode);
    return newNode;
  }

  removeChild(child: MiniNode): MiniNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  setAttribute(name: string, val: any) {
    this.attrs[name] = String(val);
    if (name === 'value') this.value = String(val);
    if (name.startsWith('data-')) {
      const camel = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      this.dataset[camel] = String(val);
    }
  }

  removeAttribute(name: string) {
    delete this.attrs[name];
  }

  getAttribute(name: string): string | null {
    return this.attrs[name] ?? null;
  }

  addEventListener(type: string, fn: Function) {
    if (!this.listeners[type]) this.listeners[type] = new Set();
    this.listeners[type].add(fn);
  }

  removeEventListener(type: string, fn: Function) {
    this.listeners[type]?.delete(fn);
  }

  dispatchEvent(evt: any): boolean {
    const eventObj = {
      ...evt,
      target: evt.target ?? this,
      currentTarget: this,
      stopPropagation: () => {},
      preventDefault: () => {},
    };
    const set = this.listeners[evt.type];
    if (set) {
      for (const fn of Array.from(set)) fn(eventObj);
    }
    if (evt.bubbles !== false && this.parentNode) {
      this.parentNode.dispatchEvent({ ...eventObj, currentTarget: this.parentNode });
    } else if (evt.bubbles !== false && this.ownerDocument && this.parentNode === null) {
      this.ownerDocument.dispatchEvent(eventObj);
    }
    return true;
  }

  querySelector(selector: string): MiniNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector: string): MiniNode[] {
    const out: MiniNode[] = [];
    const attrMatch = selector.match(/^\[([^=\]]+)=["']?([^"'\]]+)["']?\]$/);
    const visit = (node: MiniNode) => {
      for (const child of node.childNodes) {
        if (child.nodeType === 1) {
          if (attrMatch) {
            if (child.getAttribute(attrMatch[1]) === attrMatch[2]) out.push(child);
          } else if (child.tagName.toLowerCase() === selector.toLowerCase()) {
            out.push(child);
          }
          visit(child);
        }
      }
    };
    visit(this);
    return out;
  }
}

function createMiniDom() {
  const docListeners: Record<string, Set<Function>> = {};
  const doc: any = {
    nodeType: 9,
    nodeName: '#document',
    activeElement: null,
    body: null as any,
    documentElement: null as any,
    addEventListener(type: string, fn: Function) {
      if (!docListeners[type]) docListeners[type] = new Set();
      docListeners[type].add(fn);
    },
    removeEventListener(type: string, fn: Function) {
      docListeners[type]?.delete(fn);
    },
    dispatchEvent(evt: any) {
      const set = docListeners[evt.type];
      if (set) {
        for (const fn of Array.from(set)) fn(evt);
      }
      return true;
    },
    createElement(tag: string) {
      return new MiniNode(1, tag, '', doc);
    },
    createTextNode(text: string) {
      return new MiniNode(3, '', text, doc);
    },
    createComment(text: string) {
      return new MiniNode(8, '', text, doc);
    },
    querySelectorAll(selector: string) {
      return doc.body.querySelectorAll(selector);
    },
    querySelector(selector: string) {
      return doc.body.querySelector(selector);
    },
  };
  doc.documentElement = new MiniNode(1, 'html', '', doc);
  doc.body = new MiniNode(1, 'body', '', doc);
  doc.documentElement.appendChild(doc.body);
  return doc;
}

const flushMicrotasks = () => new Promise<void>((r) => setTimeout(r, 0));

async function mountCard(
  element: React.ReactElement,
  fn: (ctx: { container: MiniNode; doc: any }) => Promise<void>
) {
  const originalDoc = (globalThis as any).document;
  const originalWin = (globalThis as any).window;
  const doc = createMiniDom();
  const win: any = {
    document: doc,
    event: undefined,
    navigator: { userAgent: 'bun-test' },
    location: { pathname: '/', search: '' },
    HTMLElement: MiniNode,
    HTMLInputElement: MiniNode,
    HTMLButtonElement: MiniNode,
    HTMLIFrameElement: class HTMLIFrameElement {},
    Element: MiniNode,
    Node: MiniNode,
    SVGElement: MiniNode,
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  doc.defaultView = win;
  (globalThis as any).document = doc;
  (globalThis as any).window = win;
  const container = doc.createElement('div');
  doc.body.appendChild(container);
  const root = createRoot(container);

  await React.act(async () => {
    root.render(element);
    await flushMicrotasks();
  });

  try {
    await fn({ container, doc });
  } finally {
    await React.act(async () => {
      root.unmount();
      await flushMicrotasks();
    });
    (globalThis as any).document = originalDoc;
    (globalThis as any).window = originalWin;
  }
}

// =============================================================================
// React Native & Component Mocks
// =============================================================================

const flattenStyle = (style: any): Record<string, any> | undefined => {
  if (!style) return undefined;
  const resolved = typeof style === 'function' ? style({ pressed: false, hovered: false }) : style;
  if (!Array.isArray(resolved)) return resolved;
  return Object.assign({}, ...resolved.flat(Infinity).filter(Boolean));
};

const createMockComponent = (name: string) => {
  const Comp = ({
    children,
    accessibilityLabel,
    accessibilityRole,
    accessibilityState,
    placeholder,
    testID,
    style,
    disabled,
    editable,
    pointerEvents,
    onPress,
    onClick,
    value,
    onChangeText,
    allowFontScaling: _allowFontScaling,
    keyboardType: _keyboardType,
    placeholderTextColor: _placeholderTextColor,
    numberOfLines: _numberOfLines,
    ellipsizeMode: _ellipsizeMode,
    ...props
  }: any) => {
    const resolvedStyle = flattenStyle(style);
    const clickHandler = onPress || onClick;
    const tag = name === 'TextInput' ? 'input' : name === 'Pressable' ? 'button' : 'div';
    return React.createElement(
      tag,
      {
        'data-component': name,
        ...(testID ? { 'data-testid': testID, id: testID } : {}),
        ...(accessibilityLabel ? { 'aria-label': accessibilityLabel } : {}),
        ...(accessibilityRole ? { role: accessibilityRole } : {}),
        ...(accessibilityState ? { 'data-accessibility-state': JSON.stringify(accessibilityState) } : {}),
        ...(placeholder ? { placeholder } : {}),
        ...(disabled !== undefined ? { 'data-disabled': String(disabled), disabled } : {}),
        ...(editable !== undefined ? { 'data-editable': String(editable) } : {}),
        ...(pointerEvents !== undefined ? { 'data-pointer-events': String(pointerEvents) } : {}),
        ...(resolvedStyle ? { 'data-style': JSON.stringify(resolvedStyle) } : {}),
        ...(tag === 'input'
          ? {
              value: value ?? '',
              'data-value': String(value ?? ''),
              ref: (el: any) => {
                if (el) el._onChangeText = onChangeText;
              },
              onChange: (e: any) => onChangeText?.(e?.target?.value ?? ''),
            }
          : clickHandler && !disabled
          ? {
              'data-pressable': 'true',
              ref: (el: any) => {
                if (el) el._onPress = clickHandler;
              },
              onClick: clickHandler,
            }
          : {}),
        ...props,
      },
      children
    );
  };
  Comp.displayName = name;
  return Comp;
};

mock.module('../components/settings/cards/SettingsSplitCard', () => ({
  default: ({ children, title, subtitle, badgeLabel, testID }: any) =>
    React.createElement(
      'div',
      { 'data-testid': testID },
      React.createElement('div', null, title),
      React.createElement('div', null, subtitle),
      badgeLabel ? React.createElement('div', null, badgeLabel) : null,
      children
    ),
}));

mock.module('react-native', () => ({
  StyleSheet: {
    create: (s: any) => s,
    flatten: (s: any) => flattenStyle(s) || {},
  },
  View: createMockComponent('View'),
  Pressable: createMockComponent('Pressable'),
  ScrollView: createMockComponent('ScrollView'),
  TextInput: createMockComponent('TextInput'),
  Text: createMockComponent('Text'),
  ActivityIndicator: createMockComponent('ActivityIndicator'),
  Modal: createMockComponent('Modal'),
  Dimensions: {
    get: () => ({ width: 1280, height: 800 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  useWindowDimensions: () => ({ width: 1280, height: 800 }),
  Platform: { OS: 'web', select: (obj: any) => obj.web ?? obj.default },
  Animated: {
    Value: class {
      constructor(public val: any) {}
      setValue(val: any) {
        this.val = val;
      }
      interpolate() {
        return this;
      }
    },
    timing: () => ({ start: (cb?: any) => cb && cb() }),
    sequence: () => ({ start: (cb?: any) => cb && cb() }),
    loop: () => ({ start: (cb?: any) => cb && cb() }),
    spring: () => ({ start: (cb?: any) => cb && cb() }),
    View: createMockComponent('Animated.View'),
    Text: createMockComponent('Animated.Text'),
  },
  Alert: { alert: () => {} },
  Linking: { openURL: () => Promise.resolve(), canOpenURL: () => Promise.resolve(true) },
}));

mock.module('expo-crypto', () => ({
  randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 9),
}));

mock.module('react-native-svg', () => ({
  Svg: createMockComponent('svg'),
  Path: createMockComponent('path'),
  Circle: createMockComponent('circle'),
  Rect: createMockComponent('rect'),
  Line: createMockComponent('line'),
  default: createMockComponent('svg'),
}));

mock.module('../constants/fonts', () => ({
  applyFontFamily: (s: any) => s,
  fontAssets: {},
}));

mock.module('../utils/feedback', () => ({
  notify: {
    success: () => {},
    error: () => {},
    warning: () => {},
    info: () => {},
  },
}));

mock.module('../context/ClinicContext', () => ({
  useClinic: () => ({
    license: { clinicId: 'clinic-test-1' },
    refresh: async () => {},
  }),
}));

const mod = require('../components/settings/cards/TeleconsultSettingsCard');
const TeleconsultSettingsCard = mod.default;
const { RECORDING_POLICY_OPTIONS, getRecordingPolicyDescription } = mod;
const { clinicService } = require('../services/clinicService');

// =============================================================================
// Test Suite
// =============================================================================

describe('Issue #261: TeleconsultSettingsCard Polish & Recording-Disabled State', () => {
  const baseSettings = {
    clinicId: 'clinic-test-1',
    clinicName: 'Metro Health Clinic',
    isWorkspaceTeleconsultEntitled: true,
    enableTeleconsultation: true,
    teleconsultPaymentPolicy: 'Prepaid',
    teleconsultDefaultFee: 400,
    teleconsultRecordingPolicy: 'WorkspaceVaultOnly',
    teleconsultRecordingRetentionDays: 90,
    teleconsultRecordingConsentRequired: true,
  };

  let originalUpdateSettings: any;

  beforeEach(() => {
    originalUpdateSettings = clinicService.updateSettings;
  });

  test('1. Recording Policy option metadata formats WorkspaceVaultOnly and Both cleanly while preserving API enum IDs', () => {
    expect(RECORDING_POLICY_OPTIONS.map((o: any) => ({ id: o.id, label: o.label }))).toEqual([
      { id: 'Disabled', label: 'Disabled' },
      { id: 'WorkspaceVaultOnly', label: 'Workspace Vault Only' },
      { id: 'Both', label: 'Clinic Vault & Patient' },
    ]);

    expect(getRecordingPolicyDescription('Disabled')).toContain('not recorded');
    expect(getRecordingPolicyDescription('WorkspaceVaultOnly')).toContain('workspace vault');
    expect(getRecordingPolicyDescription('Both')).toContain('patient');
  });

  test('2. Renders human-readable labels, plain clinical copy, and non-redundant idle footer copy', () => {
    const markup = renderToStaticMarkup(
      React.createElement(TeleconsultSettingsCard, { settings: baseSettings })
    );

    // Human-readable pill buttons inside setting-recording-policy (while hidden accessibilityValue retains enum)
    const recordingPolicyPills = markup.match(/<button[^>]*aria-label="Recording policy [^"]+"[\s\S]*?<\/button>/g) || [];
    expect(recordingPolicyPills.length).toBe(3);
    const pillsMarkup = recordingPolicyPills.join('\n');
    expect(pillsMarkup).toContain('>Disabled<');
    expect(pillsMarkup).toContain('>Workspace Vault Only<');
    expect(pillsMarkup).toContain('>Clinic Vault &amp; Patient<');
    expect(pillsMarkup).not.toContain('>WorkspaceVaultOnly<');
    expect(pillsMarkup).not.toContain('>Both<');

    // Plain-language Recording Policy description & active helper copy
    expect(markup).toContain('Controls encrypted video recording storage during teleconsultations');
    expect(markup).not.toContain('CMK AES-256-GCM');
    expect(markup).toContain('data-testid="recording-policy-helper"');

    // Footer uses clean wording
    expect(markup).toContain('Changes save automatically');
    expect(markup).not.toContain('Changes auto-save automatically');
  });

  test('3. Mutes and disables Retention Policy and Dual Consent when Recording Policy is Disabled', () => {
    const disabledRecordingMarkup = renderToStaticMarkup(
      React.createElement(TeleconsultSettingsCard, {
        settings: {
          ...baseSettings,
          teleconsultRecordingPolicy: 'Disabled',
        },
      })
    );

    // Recording-dependent container is muted and blocks pointer events
    expect(disabledRecordingMarkup).toContain('data-testid="teleconsult-recording-dependent-settings"');
    expect(disabledRecordingMarkup).toContain('data-pointer-events="none"');
    expect(disabledRecordingMarkup).toContain('data-testid="recording-dependent-disabled-note"');
    expect(disabledRecordingMarkup).toContain('Applies only when Recording Policy is enabled.');

    // Retention input is non-editable & disabled
    const retentionSectionMatch = disabledRecordingMarkup.match(
      /data-testid="setting-retention-days"[\s\S]*?<input[^>]*>/
    );
    expect(retentionSectionMatch).not.toBeNull();
    expect(retentionSectionMatch![0]).toContain('data-editable="false"');

    // Dual consent switch is disabled
    const consentSwitchMatch = disabledRecordingMarkup.match(
      /aria-label="Require Dual-Party Consent"[^>]*>/
    );
    expect(consentSwitchMatch).not.toBeNull();
    expect(consentSwitchMatch![0]).toContain('data-disabled="true"');
    expect(consentSwitchMatch![0]).toContain('&quot;disabled&quot;:true');

    // No double opacity when master switch is also off
    const masterOffMarkup = renderToStaticMarkup(
      React.createElement(TeleconsultSettingsCard, {
        settings: {
          ...baseSettings,
          enableTeleconsultation: false,
          teleconsultRecordingPolicy: 'Disabled',
        },
      })
    );
    const recordingGroupTag = masterOffMarkup.match(
      /<div[^>]*data-testid="teleconsult-recording-dependent-settings"[^>]*>/
    );
    expect(recordingGroupTag).not.toBeNull();
    expect(recordingGroupTag![0]).not.toContain('&quot;opacity&quot;:0.5');
  });

  test('4. Activates Retention Policy and Dual Consent when Recording Policy is WorkspaceVaultOnly or Both', () => {
    for (const policy of ['WorkspaceVaultOnly', 'Both'] as const) {
      const markup = renderToStaticMarkup(
        React.createElement(TeleconsultSettingsCard, {
          settings: {
            ...baseSettings,
            teleconsultRecordingPolicy: policy,
          },
        })
      );

      const recordingGroupTag = markup.match(
        /<div[^>]*data-testid="teleconsult-recording-dependent-settings"[^>]*>/
      );
      expect(recordingGroupTag).not.toBeNull();
      expect(recordingGroupTag![0]).toContain('data-pointer-events="auto"');
      expect(recordingGroupTag![0]).not.toContain('&quot;opacity&quot;:0.5');
      expect(markup).not.toContain('data-testid="recording-dependent-disabled-note"');

      const retentionInput = markup.match(/data-testid="setting-retention-days"[\s\S]*?<input[^>]*>/);
      expect(retentionInput).not.toBeNull();
      expect(retentionInput![0]).toContain('data-editable="true"');

      const consentSwitch = markup.match(/aria-label="Require Dual-Party Consent"[^>]*>/);
      expect(consentSwitch).not.toBeNull();
      expect(consentSwitch![0]).toContain('data-disabled="false"');
    }
  });

  test('5. Clicking "Workspace Vault Only" persists WorkspaceVaultOnly enum and toggling Disabled live-mutes dependent controls', async () => {
    const savedPayloads: any[] = [];
    (clinicService as any).updateSettings = async (payload: any) => {
      savedPayloads.push(payload);
      return [{ ...baseSettings, ...payload }, null];
    };

    try {
      await mountCard(
        React.createElement(TeleconsultSettingsCard, {
          settings: { ...baseSettings, teleconsultRecordingPolicy: 'Disabled' },
        }),
        async ({ container }) => {
          // Initially Disabled: Retention & Consent are muted/disabled
          const recGroupBefore = container.querySelector('[data-testid="teleconsult-recording-dependent-settings"]');
          expect(recGroupBefore?.getAttribute('data-pointer-events')).toBe('none');
          expect(container.querySelector('[data-testid="recording-dependent-disabled-note"]')).not.toBeNull();

          // Click "Workspace Vault Only" pill
          const vaultPill = container.querySelector('[aria-label="Recording policy Workspace Vault Only"]');
          expect(vaultPill).not.toBeNull();

          await React.act(async () => {
            (vaultPill as any)._onPress?.();
            await flushMicrotasks();
          });

          // Dependent controls immediately un-mute
          const recGroupAfter = container.querySelector('[data-testid="teleconsult-recording-dependent-settings"]');
          expect(recGroupAfter?.getAttribute('data-pointer-events')).toBe('auto');
          expect(container.querySelector('[data-testid="recording-dependent-disabled-note"]')).toBeNull();

          // Footer immediately shows subtle "Saving changes..." during 600ms debounce
          const statusNode = container.querySelector('[data-testid="teleconsult-autosave-status"]');
          expect(statusNode?.textContent).toContain('Saving changes...');

          // Wait for 600ms debounce + save resolution
          await React.act(async () => {
            await new Promise((r) => setTimeout(r, 700));
          });

          expect(savedPayloads.length).toBe(1);
          expect(savedPayloads[0].teleconsultRecordingPolicy).toBe('WorkspaceVaultOnly');
          expect(statusNode?.textContent).toContain('Saved at ');
        }
      );
    } finally {
      clinicService.updateSettings = originalUpdateSettings;
    }
  });

  test('6. Editing numeric fields (400 / 90) immediately displays Saving indicator, reverts cleanly if undone, and saves on debounce', async () => {
    const savedPayloads: any[] = [];
    (clinicService as any).updateSettings = async (payload: any) => {
      savedPayloads.push(payload);
      return [{ ...baseSettings, ...payload }, null];
    };

    try {
      await mountCard(
        React.createElement(TeleconsultSettingsCard, { settings: baseSettings }),
        async ({ container }) => {
          const statusNode = container.querySelector('[data-testid="teleconsult-autosave-status"]');
          expect(statusNode?.textContent).toContain('Changes save automatically');

          const feeInput = container.querySelector('[aria-label="Default Consultation Fee in Philippine Pesos"]');
          expect(feeInput).not.toBeNull();

          // Edit 400 -> 450: immediately shows Saving changes...
          await React.act(async () => {
            (feeInput as any)._onChangeText?.('450');
            await flushMicrotasks();
          });
          expect(statusNode?.textContent).toContain('Saving changes...');

          // Revert 450 -> 400 before debounce fires: returns to idle copy without saving
          await React.act(async () => {
            (feeInput as any)._onChangeText?.('400');
            await flushMicrotasks();
          });
          expect(statusNode?.textContent).toContain('Changes save automatically');
          expect(savedPayloads.length).toBe(0);

          // Edit Retention Policy (Days) 90 -> 60 and let debounce complete
          const retentionInput = container.querySelector('[aria-label="Recording Retention Policy in Days"]');
          expect(retentionInput).not.toBeNull();

          await React.act(async () => {
            (retentionInput as any)._onChangeText?.('60');
            await flushMicrotasks();
          });
          expect(statusNode?.textContent).toContain('Saving changes...');

          await React.act(async () => {
            await new Promise((r) => setTimeout(r, 700));
          });

          expect(savedPayloads.length).toBe(1);
          expect(savedPayloads[0].teleconsultRecordingRetentionDays).toBe(60);
          expect(statusNode?.textContent).toContain('Saved at ');
        }
      );
    } finally {
      clinicService.updateSettings = originalUpdateSettings;
    }
  });

  test('7. Design-token compliance: zero hardcoded hex color literals in TeleconsultSettingsCard.tsx', () => {
    const source = fs.readFileSync(
      path.resolve(__dirname, '../components/settings/cards/TeleconsultSettingsCard.tsx'),
      'utf8'
    );
    const hexMatches = source.match(/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g) || [];
    expect(hexMatches).toEqual([]);
  });
});
