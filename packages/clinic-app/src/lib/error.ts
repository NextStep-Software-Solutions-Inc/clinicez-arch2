
type ConstraintSubtype =
  | "unique"
  | "primaryKey"
  | "foreignKey"
  | "notNull"
  | "check"
  | "general";

export type DatabaseErrorKind =
  | { type: "constraint"; constraint: ConstraintSubtype; table?: string; columns?: string[] }
  | { type: "busy"; reason: "busy" | "locked" }
  | { type: "readonly" }
  | { type: "io" }
  | { type: "notFound"; entity?: string }
  | { type: "syntax" }
  | { type: "unknown" };

export interface NormalizedDatabaseError {
  kind: DatabaseErrorKind;
  code?: number;
  message: string;
  userMessage: string;
  meta?: Record<string, unknown>;
  original: unknown;
}

export type DbActionResult<TResult> =
  | { ok: true; data: TResult; message?: string }
  | { ok: false; error: NormalizedDatabaseError };

export interface WithErrorHandlingOptions<TResult> {
  logger?: (error: NormalizedDatabaseError) => void;
  rethrow?: boolean;
  message?: string | ((result: TResult) => string | undefined);
}

const SQLITE_CODES = {
  CONSTRAINT: 19,
  CONSTRAINT_UNIQUE: 2067,
  CONSTRAINT_PRIMARYKEY: 1555,
  CONSTRAINT_FOREIGNKEY: 787,
  CONSTRAINT_NOTNULL: 1299,
  CONSTRAINT_CHECK: 275,
  BUSY: 5,
  LOCKED: 6,
  READONLY: 8,
  IOERR: 10,
  IOERR_WRITE: 778,
  IOERR_READ: 266,
  NOTFOUND: 12,
  SYNTAX: 1,
} as const;

const FALLBACK_USER_MESSAGE = "Something went wrong while processing your request.";

const defaultLogger = (error: NormalizedDatabaseError) => {
  console.error("[db] action failed", {
    code: error.code,
    kind: error.kind,
    message: error.message,
    meta: error.meta,
  });
};

export function withErrorHandling<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
  options: WithErrorHandlingOptions<TResult> = {}
): (...args: TArgs) => Promise<DbActionResult<TResult>> {
  const logger = options.logger ?? defaultLogger;

  return async (...args: TArgs): Promise<DbActionResult<TResult>> => {
    try {
      const data = await fn(...args);
      const message = resolveSuccessMessage(options.message, data);
      return message ? { ok: true, data, message } : { ok: true, data };
    } catch (caughtError) {
      const normalized = normalizeDatabaseError(caughtError);
      logger(normalized);

      if (options.rethrow) {
        throw normalized;
      }

      return { ok: false, error: normalized };
    }
  };
}

function resolveSuccessMessage<TResult>(
  successMessage: WithErrorHandlingOptions<TResult>["message"],
  data: TResult,
): string | undefined {
  if (typeof successMessage === "function") {
    return successMessage(data);
  }
  return successMessage;
}

function normalizeDatabaseError(error: unknown): NormalizedDatabaseError {
  const message = extractMessage(error);
  const code = extractSQLiteCode(error, message);
  const normalized: NormalizedDatabaseError = {
    kind: { type: "unknown" },
    code,
    message,
    userMessage: FALLBACK_USER_MESSAGE,
    original: error,
  };

  const constraint = deriveConstraintSubtype(code, message);
  if (constraint) {
    const meta = parseConstraintMeta(constraint, message);
    normalized.kind = { type: "constraint", constraint, ...meta };
    normalized.meta = meta.columns ? { columns: meta.columns, table: meta.table } : meta.table ? { table: meta.table } : undefined;
    normalized.userMessage = constraintUserMessage(constraint);
    return normalized;
  }

  if (code === SQLITE_CODES.BUSY || message.toLowerCase().includes("database is busy")) {
    normalized.kind = { type: "busy", reason: "busy" };
    normalized.userMessage = "The database is busy. Please try again in a moment.";
    return normalized;
  }

  if (code === SQLITE_CODES.LOCKED || message.toLowerCase().includes("database is locked")) {
    normalized.kind = { type: "busy", reason: "locked" };
    normalized.userMessage = "Another operation is still running. Please try again.";
    return normalized;
  }

  if (code === SQLITE_CODES.READONLY || message.toLowerCase().includes("readonly")) {
    normalized.kind = { type: "readonly" };
    normalized.userMessage = "Cannot save changes because the database is read-only.";
    return normalized;
  }

  if (code === SQLITE_CODES.IOERR || code === SQLITE_CODES.IOERR_WRITE || code === SQLITE_CODES.IOERR_READ) {
    normalized.kind = { type: "io" };
    normalized.userMessage = "Unable to access the database. Please retry.";
    return normalized;
  }

  if (code === SQLITE_CODES.NOTFOUND || /no such table/i.test(message)) {
    normalized.kind = { type: "notFound" };
    normalized.userMessage = "A required resource was not found.";
    return normalized;
  }

  if (code === SQLITE_CODES.SYNTAX || /syntax error/i.test(message)) {
    normalized.kind = { type: "syntax" };
    normalized.userMessage = FALLBACK_USER_MESSAGE;
    return normalized;
  }

  return normalized;
}

function deriveConstraintSubtype(code: number | undefined, message: string): ConstraintSubtype | undefined {
  switch (code) {
    case SQLITE_CODES.CONSTRAINT_UNIQUE:
      return "unique";
    case SQLITE_CODES.CONSTRAINT_PRIMARYKEY:
      return "primaryKey";
    case SQLITE_CODES.CONSTRAINT_FOREIGNKEY:
      return "foreignKey";
    case SQLITE_CODES.CONSTRAINT_NOTNULL:
      return "notNull";
    case SQLITE_CODES.CONSTRAINT_CHECK:
      return "check";
    case SQLITE_CODES.CONSTRAINT:
      return "general";
    default:
      break;
  }

  if (/unique constraint failed/i.test(message)) {
    return "unique";
  }
  if (/primary key constraint failed/i.test(message)) {
    return "primaryKey";
  }
  if (/foreign key constraint failed/i.test(message)) {
    return "foreignKey";
  }
  if (/not null constraint failed/i.test(message)) {
    return "notNull";
  }
  if (/check constraint failed/i.test(message)) {
    return "check";
  }
  if (/constraint failed/i.test(message)) {
    return "general";
  }

  return undefined;
}

function parseConstraintMeta(constraint: ConstraintSubtype, message: string): { table?: string; columns?: string[] } {
  const columnMatch = message.match(/constraint failed: ([^\n]+)/i);
  if (!columnMatch) {
    return {};
  }

  const paths = columnMatch[1]
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (paths.length === 0) {
    return {};
  }

  const table = paths[0].includes(".") ? paths[0].split(".")[0] : undefined;
  const columns = paths.map((path) => (path.includes(".") ? path.split(".")[1] : path));

  return constraint === "foreignKey" && paths.length === 1 && !paths[0].includes(".")
    ? { table: paths[0] }
    : { table, columns };
}

function constraintUserMessage(constraint: ConstraintSubtype): string {
  switch (constraint) {
    case "unique":
    case "primaryKey":
      return "A record with the same information already exists.";
    case "foreignKey":
      return "Related data is missing. Please create or select the linked record first.";
    case "notNull":
      return "Required information is missing. Please fill out all mandatory fields.";
    case "check":
      return "One or more fields contain invalid values.";
    case "general":
    default:
      return FALLBACK_USER_MESSAGE;
  }
}

function extractSQLiteCode(error: unknown, message: string): number | undefined {
  if (isObject(error)) {
    const possible = [error.code, error.errno];
    for (const value of possible) {
      const asNumber = typeof value === "string" ? Number(value) : value;
      if (typeof asNumber === "number" && Number.isFinite(asNumber)) {
        return asNumber;
      }
    }
  }

  const match = message.match(/\(code\s*(\d+)\)/i);
  if (match) {
    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  const symbolicMatch = message.match(/SQLITE_(\w+)(?:\((\d+)\))?/i);
  if (symbolicMatch) {
    const symbolicCode = symbolicMatch[2] ? Number(symbolicMatch[2]) : undefined;
    if (symbolicCode && Number.isFinite(symbolicCode)) {
      return symbolicCode;
    }
  }

  return undefined;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
