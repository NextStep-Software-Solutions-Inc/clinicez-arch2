import React from 'react';
import { describe, it, expect } from 'bun:test';
import { renderToString } from 'react-dom/server';
import {
  parseClerkLoadError,
  ClerkLoadFailureScreen,
  ClerkBootGuard,
} from '../src/components/ClerkLoadFailureScreen';

describe('ClerkBootGuard & ClerkLoadFailureScreen', () => {
  describe('parseClerkLoadError', () => {
    it('extracts code and sanitized scriptOrigin from Clerk error object with failed_to_load_clerk_js', () => {
      const parsed = parseClerkLoadError({
        code: 'failed_to_load_clerk_js',
        message:
          'Clerk: Failed to load Clerk, failed to load script: https://clerk.example.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js?v=123',
      });

      expect(parsed).toEqual({
        code: 'failed_to_load_clerk_js',
        message:
          'Clerk: Failed to load Clerk, failed to load script: https://clerk.example.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js?v=123',
        scriptOrigin: 'https://clerk.example.com',
      });
    });

    it('detects message-only Clerk load failure errors without a code property', () => {
      const err = new Error(
        'Clerk: Failed to load Clerk, failed to load script: https://clerk.example.com/npm/@clerk/clerk-js@5/dist/clerk.browser.js'
      );
      const parsed = parseClerkLoadError(err);

      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe('failed_to_load_clerk_js');
      expect(parsed?.scriptOrigin).toBe('https://clerk.example.com');
    });

    it('detects string rejections mentioning failed to load script and clerk', () => {
      const parsed = parseClerkLoadError(
        'Failed to load script https://clerk.example.com/clerk.browser.js'
      );

      expect(parsed).not.toBeNull();
      expect(parsed?.code).toBe('failed_to_load_clerk_js');
      expect(parsed?.scriptOrigin).toBe('https://clerk.example.com');
    });

    it('returns null for non-Clerk errors and empty values', () => {
      expect(parseClerkLoadError(new Error('timeout'))).toBeNull();
      expect(parseClerkLoadError(null)).toBeNull();
      expect(parseClerkLoadError(undefined)).toBeNull();
      expect(parseClerkLoadError({ code: 'other' })).toBeNull();
      expect(parseClerkLoadError('Network request failed')).toBeNull();
    });
  });

  describe('SSR rendering', () => {
    it('renders ClerkLoadFailureScreen cleanly with diagnostic details and retry action', () => {
      let html = '';
      expect(() => {
        html = renderToString(
          <ClerkLoadFailureScreen
            error={{
              code: 'failed_to_load_clerk_js',
              message: 'Failed to load script',
              scriptOrigin: 'https://clerk.example.com',
            }}
          />
        );
      }).not.toThrow();

      expect(html).toContain('Authentication Service Unavailable');
      expect(html).toContain('https://clerk.example.com');
      expect(html).toContain('failed_to_load_clerk_js');
      expect(html).toContain('Reload Workstation');
    });

    it('renders ClerkBootGuard children cleanly in SSR/headless environments', () => {
      let html = '';
      expect(() => {
        html = renderToString(
          <ClerkBootGuard>
            <div data-testid="workstation-root">Workstation Child</div>
          </ClerkBootGuard>
        );
      }).not.toThrow();

      expect(html).toContain('Workstation Child');
    });
  });
});
