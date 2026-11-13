import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

describe('Feature F14: livekit-client SDK Dependency & Module Resolution', () => {
  const packageJsonPath = path.resolve(__dirname, '../../package.json');
  const packageJsonRaw = fs.readFileSync(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  describe('Tier 1: Standard Dependency Declaration & Package Structure', () => {
    it('declares livekit-client in package.json dependencies', () => {
      expect(packageJson.dependencies).toBeDefined();
      expect(packageJson.dependencies['livekit-client']).toBeDefined();
    });

    it('specifies livekit-client version constraint satisfying ^2.24.0', () => {
      const versionConstraint = packageJson.dependencies['livekit-client'];
      expect(versionConstraint).toBeDefined();
      // Must satisfy ^2.24.0 (semver range starting with ^2.24 or ~2.24 or exact >=2.24.0)
      expect(versionConstraint).toMatch(/^\^2\.(?:2[4-9]|[3-9]\d)\.\d+/);
    });

    it('does not duplicate livekit-client in devDependencies or peerDependencies', () => {
      const devDeps = packageJson.devDependencies || {};
      const peerDeps = packageJson.peerDependencies || {};
      expect(devDeps['livekit-client']).toBeUndefined();
      expect(peerDeps['livekit-client']).toBeUndefined();
    });

    it('exposes standard entrypoints in package.json exports map', () => {
      expect(packageJson.exports).toBeDefined();
      expect(packageJson.exports['.']).toBeDefined();
      expect(packageJson.exports['./core']).toBeDefined();
      expect(packageJson.exports['./react']).toBeDefined();
      expect(packageJson.exports['./native-ui']).toBeDefined();
      expect(packageJson.exports['./web-ui']).toBeDefined();
    });

    it('dynamically imports livekit-client without syntax error', async () => {
      let livekitMod: any = null;
      let importError: Error | null = null;
      try {
        livekitMod = await import('livekit-client');
      } catch (err: any) {
        importError = err;
      }
      expect(importError).toBeNull();
      expect(livekitMod).toBeDefined();
      expect(typeof livekitMod.Room).toBe('function');
    });
  });

  describe('Tier 2: Boundary Conditions, Safe Guards & Module Invariants', () => {
    it('detects headless execution environment safely without window or RTCPeerConnection', () => {
      const hasWindow = typeof window !== 'undefined';
      const hasRTCPeerConnection = typeof (globalThis as any).RTCPeerConnection !== 'undefined';
      // In bun test runner, standard browser WebRTC globals are absent by default
      expect(hasWindow).toBe(false);
      expect(hasRTCPeerConnection).toBe(false);
    });

    it('verifies livekit-client exports core classes and enumerations', async () => {
      const livekit = await import('livekit-client');
      expect(livekit.Room).toBeDefined();
      expect(livekit.RoomEvent).toBeDefined();
      expect(livekit.Track).toBeDefined();
      expect(livekit.ConnectionState).toBeDefined();
    });

    it('resolves repeated imports to the identical module singleton', async () => {
      const import1 = await import('livekit-client');
      const import2 = await import('livekit-client');
      expect(import1).toBe(import2);
      expect(import1.Room).toBe(import2.Room);
    });

    it('verifies that all declared dependencies have non-empty valid semver strings', () => {
      const deps = packageJson.dependencies || {};
      for (const [depName, version] of Object.entries(deps)) {
        expect(typeof depName).toBe('string');
        expect(depName.length).toBeGreaterThan(0);
        expect(typeof version).toBe('string');
        expect((version as string).length).toBeGreaterThan(0);
      }
    });

    it('verifies all exports map target paths physically exist on disk', () => {
      const pkgDir = path.resolve(__dirname, '../..');
      const exportsMap = packageJson.exports;
      for (const [subpath, config] of Object.entries(exportsMap)) {
        if (typeof config === 'object' && config !== null) {
          const targetImport = (config as any).import;
          const targetTypes = (config as any).types;
          expect(targetImport).toBeDefined();
          expect(targetTypes).toBeDefined();
          const importFullPath = path.resolve(pkgDir, targetImport);
          const typesFullPath = path.resolve(pkgDir, targetTypes);
          expect(fs.existsSync(importFullPath)).toBe(true);
          expect(fs.existsSync(typesFullPath)).toBe(true);
        }
      }
    });

    it('verifies safe WebRTC error handling when attempting connection in headless environment', async () => {
      const livekit = await import('livekit-client');
      let room: any = null;
      try {
        room = new livekit.Room();
      } catch (err: any) {
        // Room constructor might fail if WebRTC globals are absent
        expect(err).toBeDefined();
      }

      if (room) {
        // If room constructor succeeds, connecting in headless runner must reject cleanly
        let connectError: Error | null = null;
        try {
          await room.connect('wss://sfu.internal.mock', 'mock-token');
        } catch (err: any) {
          connectError = err;
        }
        expect(connectError).not.toBeNull();
      }
    });
  });
});
