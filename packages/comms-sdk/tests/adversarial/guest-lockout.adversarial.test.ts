import { describe, expect, it } from 'bun:test';
import React from 'react';
import { GuestJoinPage } from '../../src/web-ui/GuestJoinPage';
import { createHookHarness, act } from '../react/hook-test-harness';

// Helper to recursively find elements by type or predicate in JSX tree
function findElement(element: any, predicate: (el: any) => boolean): any {
  if (!element) return null;
  if (predicate(element)) return element;
  if (element.props && element.props.children) {
    const children = Array.isArray(element.props.children)
      ? element.props.children
      : [element.props.children];
    for (const child of children) {
      const found = findElement(child, predicate);
      if (found) return found;
    }
  }
  return null;
}

// Helper to extract text content recursively from JSX tree
function extractText(element: any): string {
  if (element == null || typeof element === 'boolean') return '';
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (Array.isArray(element)) return element.map(extractText).join(' ');
  if (element.props && element.props.children) {
    return extractText(element.props.children);
  }
  return '';
}

async function enterOtp(harness: any, otpString: string) {
  for (let i = 0; i < otpString.length && i < 6; i++) {
    const input = findElement(
      harness.result.current,
      (el) => el.props?.['aria-label'] === `OTP digit ${i + 1}`
    );
    if (input) {
      await act(() => {
        input.props.onChange({ target: { value: otpString[i] } });
      });
    }
  }
}

describe('Adversarial Stress Test: Guest Verification Edge Cases & 5-Attempt Lockout', () => {
  // --- Edge Case 1: Malformed OTP Validation ---
  it('rejects incomplete 5-digit OTP client-side without sending network request', async () => {
    let networkCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      networkCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    try {
      const harness = createHookHarness(() =>
        GuestJoinPage({
          inviteToken: 'test-token-123',
          apiBaseUrl: 'https://comms.example.com'
        })
      );

      const dobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');
      expect(dobInput).toBeDefined();

      // Set valid DOB
      await act(() => {
        dobInput.props.onChange({ target: { value: '1990-05-15' } });
      });

      // Enter only 5 digits (leaving 6th empty)
      await enterOtp(harness, '12345');

      // Submit form
      const form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      expect(networkCalled).toBe(false);
      const text = extractText(harness.result.current);
      expect(text).toContain('Please enter a valid Date of Birth (YYYY-MM-DD) and 6-digit OTP code.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects non-numeric alphabetic characters in OTP', async () => {
    let networkCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      networkCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    try {
      const harness = createHookHarness(() =>
        GuestJoinPage({
          inviteToken: 'test-token-123',
          apiBaseUrl: 'https://comms.example.com'
        })
      );

      const dobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');
      await act(() => {
        dobInput.props.onChange({ target: { value: '1990-05-15' } });
      });

      const otpInputs = [0, 1, 2, 3, 4, 5].map((idx) =>
        findElement(harness.result.current, (el) => el.props?.['aria-label'] === `OTP digit ${idx + 1}`)
      );

      // Pass alphabetic characters 'a','b','c','d','e','f'
      await act(() => {
        otpInputs.forEach((input) => input.props.onChange({ target: { value: 'x' } }));
      });

      const form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      expect(networkCalled).toBe(false);
      const text = extractText(harness.result.current);
      expect(text).toContain('Please enter a valid Date of Birth (YYYY-MM-DD) and 6-digit OTP code.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- Edge Case 2: Malformed Date of Birth (DOB) Validation ---
  it('verifies malformed DOB (2026-13-45) is intercepted client-side', async () => {
    let networkCalled = false;
    let submittedPayload: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: any) => {
      networkCalled = true;
      submittedPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    try {
      const harness = createHookHarness(() =>
        GuestJoinPage({
          inviteToken: 'test-token-123',
          apiBaseUrl: 'https://comms.example.com'
        })
      );

      const dobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');

      // Set malformed date: month 13, day 45
      await act(() => {
        dobInput.props.onChange({ target: { value: '2026-13-45' } });
      });

      await enterOtp(harness, '123456');

      const form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      // Verified: malformed DOB (month 13, day 45) is intercepted client-side
      expect(networkCalled).toBe(false);
      const text = extractText(harness.result.current);
      expect(text).toContain('Please enter a valid Date of Birth (YYYY-MM-DD) and 6-digit OTP code.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('verifies non-ISO DOB (26-10-1990) is intercepted client-side in JS', async () => {
    let networkCalled = false;
    let submittedPayload: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: any) => {
      networkCalled = true;
      submittedPayload = JSON.parse(init.body);
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as any;

    try {
      const harness = createHookHarness(() =>
        GuestJoinPage({
          inviteToken: 'test-token-123',
          apiBaseUrl: 'https://comms.example.com'
        })
      );

      const dobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');

      // Set DD-MM-YYYY format instead of YYYY-MM-DD
      await act(() => {
        dobInput.props.onChange({ target: { value: '26-10-1990' } });
      });

      await enterOtp(harness, '987654');

      const form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      // Verified: non-ISO DOB (26-10-1990) is intercepted client-side
      expect(networkCalled).toBe(false);
      const text = extractText(harness.result.current);
      expect(text).toContain('Please enter a valid Date of Birth (YYYY-MM-DD) and 6-digit OTP code.');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- Edge Case 3: 5-Attempt Countdown Progression ---
  it('displays accurate countdown from 5 down to 1 attempt on consecutive verification failures', async () => {
    let callCount = 0;
    const originalFetch = globalThis.fetch;
    // Always return HTTP 401 Unauthorized for invalid verification
    globalThis.fetch = (async () => {
      callCount++;
      return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 });
    }) as any;

    try {
      const harness = createHookHarness(() =>
        GuestJoinPage({
          inviteToken: 'test-token-countdown',
          apiBaseUrl: 'https://comms.example.com',
          clinicName: 'Metro General Clinic'
        })
      );

      // Initial state: 5 attempts remaining
      expect(extractText(harness.result.current)).toContain('5  attempts remaining before permanent lockout.');

      // Setup valid form fields
      const dobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');
      await act(() => {
        dobInput.props.onChange({ target: { value: '1990-01-01' } });
      });

      await enterOtp(harness, '111111');

      // Attempt 1 Failure -> 4 remaining
      let form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });
      expect(extractText(harness.result.current)).toContain('4 attempts remaining');

      // Attempt 2 Failure -> 3 remaining
      form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });
      expect(extractText(harness.result.current)).toContain('3 attempts remaining');

      // Attempt 3 Failure -> 2 remaining
      form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });
      expect(extractText(harness.result.current)).toContain('2 attempts remaining');

      // Attempt 4 Failure -> 1 remaining
      form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });
      expect(extractText(harness.result.current)).toContain('1 attempts remaining');

      // Attempt 5 Failure -> Permanent Lockout (State 1)
      form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      const lockedOutText = extractText(harness.result.current);
      expect(lockedOutText).toContain('Teleconsultation Link Locked');
      expect(lockedOutText).toContain('permanently locked after 5 failed verification attempts');
      expect(lockedOutText).toContain('Metro General Clinic');
      expect(lockedOutText).toContain('(02) 8123-4567');

      // Form must be removed from the DOM
      expect(findElement(harness.result.current, (el) => el.type === 'form')).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // --- Edge Case 4: Server HTTP 423 Permanent Lockout ---
  it('immediately triggers permanent lockout when server returns HTTP 423 Locked', async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: 'Lockout active' }), { status: 423 });
    }) as any;

    try {
      const harness = createHookHarness(() =>
        GuestJoinPage({
          inviteToken: 'test-locked-token',
          apiBaseUrl: 'https://comms.example.com',
          clinicName: 'St. Luke Healthcare',
          clinicSupportPhone: '0917-123-4567'
        })
      );

      const dobInput = findElement(harness.result.current, (el) => el.props?.id === 'dob-input');
      await act(() => {
        dobInput.props.onChange({ target: { value: '1995-12-25' } });
      });

      await enterOtp(harness, '234567');

      const form = findElement(harness.result.current, (el) => el.type === 'form');
      await act(async () => {
        await form.props.onSubmit({ preventDefault: () => {} });
      });

      const text = extractText(harness.result.current);
      expect(text).toContain('Teleconsultation Link Locked');
      expect(text).toContain('St. Luke Healthcare');
      expect(text).toContain('0917-123-4567');
      expect(findElement(harness.result.current, (el) => el.type === 'form')).toBeNull();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
