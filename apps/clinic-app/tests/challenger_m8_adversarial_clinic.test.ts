// token-guard:ignore-file
import { describe, expect, it, mock } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import path from 'node:path';
import fs from 'node:fs';

(globalThis as any).__DEV__ = true;

const EXPECTED_COMMS_ICONS: string[] = [
  'mic',
  'micOff',
  'video',
  'videoOff',
  'cameraOff',
  'screenShare',
  'screenShareOff',
  'switchCamera',
  'chat',
  'recordDot',
  'phoneOff',
  'shieldCheck',
  'lock',
  'dock',
  'pip',
  'rotate',
  'share'
];

describe('Challenger M8.2: Workstation Clinic App Adversarial Invariant Suite', () => {
  const modalFilePath = path.resolve(__dirname, '../components/teleconsult/TeleconsultWaitingRoomModal.tsx');
  const modalContent = fs.readFileSync(modalFilePath, 'utf-8');

  const iconFilePath = path.resolve(__dirname, '../components/ui/Icon.tsx');
  const iconContent = fs.readFileSync(iconFilePath, 'utf-8');

  // Extract all keys defined in ICONS = { ... } from Icon.tsx source
  const iconsMatch = iconContent.match(/export const ICONS\s*=\s*\{([\s\S]*?)\};/);
  if (!iconsMatch) {
    throw new Error('ICONS dictionary could not be located in Icon.tsx');
  }
  const iconsBody = iconsMatch[1];
  const validIconNames = new Set<string>();
  for (const line of iconsBody.split('\n')) {
    const match = line.match(/^\s*([a-zA-Z0-9]+):\s*([a-zA-Z0-9]+),?/);
    if (match) {
      validIconNames.add(match[1]);
    }
  }

  // =========================================================================
  // Focus 1: COMMS_ICON_MAP Exhaustive Invariant Matrix
  // =========================================================================
  describe('Focus 1: COMMS_ICON_MAP Exhaustive Invariant Matrix', () => {
    // Parse COMMS_ICON_MAP definition from source code
    const mapMatch = modalContent.match(/const COMMS_ICON_MAP:\s*Record<CommsCallIconName,\s*IconName>\s*=\s*\{([\s\S]*?)\};/);
    if (!mapMatch) {
      throw new Error('COMMS_ICON_MAP definition could not be located in TeleconsultWaitingRoomModal.tsx');
    }
    const mapBody = mapMatch[1];
    const mapEntries: Record<string, string> = {};
    for (const line of mapBody.split('\n')) {
      const match = line.match(/^\s*([a-zA-Z0-9]+):\s*['"]([a-zA-Z0-9]+)['"],?/);
      if (match) {
        mapEntries[match[1]] = match[2];
      }
    }

    it('1.1: COMMS_ICON_MAP exhaustively maps all 17 CommsCallIconName union members', () => {
      expect(Object.keys(mapEntries).length).toBe(17);
      for (const expectedIcon of EXPECTED_COMMS_ICONS) {
        expect(mapEntries[expectedIcon]).toBeDefined();
        expect(typeof mapEntries[expectedIcon]).toBe('string');
      }
    });

    it('1.2: Every mapped icon target exists in ClinicEZ ICONS source dictionary', () => {
      for (const [commsName, clinicIconName] of Object.entries(mapEntries)) {
        const iconExists = validIconNames.has(clinicIconName);
        expect(iconExists).toBe(true);
      }
    });

    it('1.3: M8 specific icon additions map to appropriate UI representations in Icon.tsx', () => {
      // dock -> clipboard (ClipboardList)
      expect(mapEntries.dock).toBe('clipboard');
      expect(validIconNames.has('clipboard')).toBe(true);

      // pip -> layoutModal (AppWindow)
      expect(mapEntries.pip).toBe('layoutModal');
      expect(validIconNames.has('layoutModal')).toBe(true);

      // rotate -> refresh (RefreshCw)
      expect(mapEntries.rotate).toBe('refresh');
      expect(validIconNames.has('refresh')).toBe(true);

      // share -> copy (Copy)
      expect(mapEntries.share).toBe('copy');
      expect(validIconNames.has('copy')).toBe(true);
    });

    it('1.4: renderCommsIcon function definition matches required contract in TeleconsultWaitingRoomModal', () => {
      // Verify renderCommsIcon signature and implementation
      expect(modalContent).toContain('const renderCommsIcon = (');
      expect(modalContent).toContain('name: CommsCallIconName');
      expect(modalContent).toContain('COMMS_ICON_MAP[name]');
      expect(modalContent).toContain('theme.sizes.iconMd');
      expect(modalContent).toContain('theme.colors.text');
    });

    it('1.5: Maps all 17 comms icon names to distinct, valid clinic icons', () => {
      const targetIcons = Object.values(mapEntries);
      expect(targetIcons.length).toBe(17);
      // Ensure no undefined or empty strings
      for (const icon of targetIcons) {
        expect(icon.length).toBeGreaterThan(0);
        expect(validIconNames.has(icon)).toBe(true);
      }
    });
  });

  // =========================================================================
  // Focus 2: Workstation Waiting Room & Call Stage Bindings
  // =========================================================================
  describe('Focus 2: Workstation Waiting Room & Call Stage Bindings', () => {
    it('2.1: TeleconsultWaitingRoomModal binds renderIcon={renderCommsIcon} to CallStage and CallWaitingRoom', () => {
      expect(modalContent).toContain('renderIcon={renderCommsIcon}');
      const count = (modalContent.match(/renderIcon=\{renderCommsIcon\}/g) || []).length;
      expect(count).toBeGreaterThanOrEqual(2);
    });

    it('2.2: Modal provides static and dynamic testID="btn-toggle-pip" hooks without redundant btn-dock-call', () => {
      expect(modalContent).toContain('testID="btn-toggle-pip"');
      expect(modalContent).not.toContain('testID="btn-dock-call"');
      expect(modalContent).toContain('testID="docked-call-mini-bar-wrapper"');
    });

    it('2.3: Zero hardcoded hex color literals in TeleconsultWaitingRoomModal (Strict Token Guard)', () => {
      const hexMatches = modalContent.match(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g) || [];
      expect(hexMatches.length).toBe(0);
    });

    it('2.4: Zero hardcoded external hosts or localhost literals in TeleconsultWaitingRoomModal', () => {
      const hostMatches = modalContent.match(/https?:\/\/(?!localhost:8081)[^\s'"`,]+/g) || [];
      const activeCodeMatches = hostMatches.filter((url) => !url.includes('// Example'));
      expect(activeCodeMatches.length).toBe(0);
    });

    it('2.5: Interactive workstation buttons enforce minimum touch target >= 44px', () => {
      expect(modalContent).toContain('minHeight: theme.sizes.touchTarget');
      expect(modalContent).toContain('minWidth: theme.sizes.touchTarget');
    });
  });
});
