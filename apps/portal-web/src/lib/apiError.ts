/**
 * Best-effort human message from an API failure (validation errors first, then the error message).
 * Typed without `any` so callers can use `catch (err: unknown)`.
 */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { errors?: { message?: string }[]; message?: string } }; message?: string } | undefined;
  return e?.response?.data?.errors?.[0]?.message || e?.response?.data?.message || e?.message || fallback;
}
