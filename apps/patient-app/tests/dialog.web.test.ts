import { describe, expect, test } from 'bun:test';
import { dialog, resolveDialog, subscribeDialogs } from '../utils/dialog.web';
import type { DialogRequest } from '../utils/dialogTypes';

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
  test('alert queues a request with a default OK button', () => {
    dialog.alert('Saved', 'Profile updated');
    const request = latest();
    expect(request.title).toBe('Saved');
    expect(request.buttons.map((b) => b.text)).toEqual(['OK']);
    resolveDialog(request.id);
  });

  test('confirm resolves true when the confirm button is pressed', async () => {
    const pending = dialog.confirm({ title: 'Delete?', confirmLabel: 'Delete', destructive: true });
    const request = latest();
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
