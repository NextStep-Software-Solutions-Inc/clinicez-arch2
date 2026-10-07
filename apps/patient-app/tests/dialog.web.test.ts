import { describe, expect, test } from 'bun:test';
import { dialog, resolveDialog, subscribeDialogs } from '../utils/dialog.web';
import type { DialogRequest } from '../utils/dialogTypes';
import { resolveDialogTone } from '../utils/dialogTone';

function latest(): DialogRequest {
  let snapshot: DialogRequest[] = [];
  const unsubscribe = subscribeDialogs((q) => {
    snapshot = q;
  });
  unsubscribe();
  return snapshot[snapshot.length - 1];
}

/** Simulates <DialogHost/> pressing a button and removing the request. */
async function press(request: DialogRequest, text: string) {
  const button = request.buttons.find((b) => b.text === text)!;
  await button.onPress?.();
  resolveDialog(request.id);
}

describe('dialog.web', () => {
  test('alert queues a request with a default OK button and auto-detects success tone', () => {
    dialog.alert('Saved', 'Profile updated');
    const request = latest();
    expect(request.title).toBe('Saved');
    expect(request.tone).toBe('success');
    expect(request.buttons.map((b) => b.text)).toEqual(['OK']);
    resolveDialog(request.id);
  });

  test('alert detects error tone from error keywords', () => {
    dialog.alert('Error', 'Unable to reach backend server');
    const request = latest();
    expect(request.tone).toBe('error');
    resolveDialog(request.id);

    dialog.alert('Upload Failed', 'The file could not be encrypted');
    const request2 = latest();
    expect(request2.tone).toBe('error');
    resolveDialog(request2.id);
  });

  test('alert detects warning tone from warning keywords or destructive styles', () => {
    dialog.alert('Internet Required', 'Please reconnect to continue');
    const request = latest();
    expect(request.tone).toBe('warning');
    resolveDialog(request.id);

    dialog.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive' },
    ]);
    const request2 = latest();
    expect(request2.tone).toBe('warning');
    resolveDialog(request2.id);
  });

  test('explicit type option overrides keyword auto-detection', () => {
    dialog.alert('Attention', 'Notice has been acknowledged', undefined, { type: 'success' });
    const request = latest();
    expect(request.tone).toBe('success');
    resolveDialog(request.id);
  });

  test('confirm resolves true when the confirm button is pressed', async () => {
    const pending = dialog.confirm({ title: 'Delete?', confirmLabel: 'Delete', destructive: true });
    const request = latest();
    expect(request.tone).toBe('warning');
    expect(request.buttons.find((b) => b.text === 'Delete')?.style).toBe('destructive');
    await press(request, 'Delete');
    expect(await pending).toBe(true);
  });

  test('confirm resolves false on cancel', async () => {
    const pending = dialog.confirm({ title: 'Sign out?' });
    await press(latest(), 'Cancel');
    expect(await pending).toBe(false);
  });

  test('queue is FIFO and resolved dialogs are removed', () => {
    dialog.alert('first');
    dialog.alert('second');
    let queue: DialogRequest[] = [];
    subscribeDialogs((q) => {
      queue = q;
    })();
    expect(queue.map((q) => q.title)).toEqual(['first', 'second']);
    resolveDialog(queue[0].id);
    subscribeDialogs((q) => {
      queue = q;
    })();
    expect(queue.map((q) => q.title)).toEqual(['second']);
    resolveDialog(queue[0].id);
  });
});

describe('resolveDialogTone', () => {
  test('classifies error titles and messages', () => {
    expect(resolveDialogTone('Error', 'Something went wrong')).toBe('error');
    expect(resolveDialogTone('Operation Failed')).toBe('error');
    expect(resolveDialogTone('Permission Denied')).toBe('error');
    expect(resolveDialogTone('Notice', 'Unable to connect to host')).toBe('error');
  });

  test('classifies warning titles and messages', () => {
    expect(resolveDialogTone('Warning', 'Check your settings')).toBe('warning');
    expect(resolveDialogTone('Caution')).toBe('warning');
    expect(resolveDialogTone('Internet Required')).toBe('warning');
    expect(resolveDialogTone('Delete Account', undefined, undefined, undefined, true)).toBe('warning');
  });

  test('classifies success titles and messages', () => {
    expect(resolveDialogTone('Success', 'Profile saved')).toBe('success');
    expect(resolveDialogTone('Saved')).toBe('success');
    expect(resolveDialogTone('Link Copied')).toBe('success');
    expect(resolveDialogTone('PIN Changed')).toBe('success');
  });

  test('defaults to info for neutral titles', () => {
    expect(resolveDialogTone('Information', 'Office hours are 9-5')).toBe('info');
    expect(resolveDialogTone('Details')).toBe('info');
  });
});
