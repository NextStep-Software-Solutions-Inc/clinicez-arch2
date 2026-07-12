/**
 * Safely awaits a promise, returning a Go-style [data, error] tuple.
 * Prevents try-catch block nesting.
 */
export async function safeAwait<T, E = Error>(
  promise: Promise<T>
): Promise<[T | null, E | null]> {
  try {
    const data = await promise;
    return [data, null];
  } catch (err) {
    return [null, err as E];
  }
}

/**
 * Safely executes a synchronous function, returning a Go-style [data, error] tuple.
 * Prevents try-catch block nesting.
 */
export function safeRun<T, E = Error>(
  fn: () => T
): [T | null, E | null] {
  try {
    const data = fn();
    return [data, null];
  } catch (err) {
    return [null, err as E];
  }
}
