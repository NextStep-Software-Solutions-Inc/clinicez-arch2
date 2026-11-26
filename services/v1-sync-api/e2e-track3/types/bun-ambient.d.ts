declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>, options?: number | { timeout?: number }): void;
  export function it(name: string, fn: () => void | Promise<void>, options?: number | { timeout?: number }): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;

  export interface Matchers<T = unknown> {
    toBe(expected: T): void;
    toEqual(expected: unknown): void;
    toStrictEqual(expected: unknown): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toMatch(expected: string | RegExp): void;
    toThrow(expected?: string | RegExp | Error | (new (...args: never[]) => Error)): void;
    not: Matchers<T>;
  }

  export function expect<T = unknown>(actual: T): Matchers<T>;
}

interface ImportMeta {
  readonly dir: string;
}

declare namespace Bun {
  export interface ServeOptions {
    port?: number;
    hostname?: string;
    fetch: (request: Request) => Response | Promise<Response>;
  }

  export interface Server {
    port: number;
    hostname: string;
    url: URL;
    stop(closeActiveConnections?: boolean): void;
  }

  export function serve(options: ServeOptions): Server;
  export function sleep(ms: number): Promise<void>;

  export interface SpawnSyncOptions {
    cmd: string[];
    cwd?: string;
    env?: Record<string, string | undefined>;
    stdout?: "pipe" | "inherit" | "ignore";
    stderr?: "pipe" | "inherit" | "ignore";
  }

  export interface SpawnSyncResult {
    exitCode: number;
    stdout: Uint8Array;
    stderr: Uint8Array;
    success: boolean;
  }

  export function spawnSync(options: SpawnSyncOptions): SpawnSyncResult;

  export interface SQL {
    <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T[]>;
    unsafe<T = Record<string, unknown>>(query: string, params?: unknown[]): Promise<T[]>;
    close(): Promise<void>;
  }

  export const SQL: {
    new (url: string): SQL;
  };

  export interface S3Options {
    accessKeyId: string;
    secretAccessKey: string;
    bucket?: string;
    endpoint?: string;
    region?: string;
  }

  export interface S3FileStat {
    size: number;
    etag?: string;
    lastModified?: Date;
    type?: string;
  }

  export interface S3File {
    exists(): Promise<boolean>;
    stat(): Promise<S3FileStat>;
    arrayBuffer(): Promise<ArrayBuffer>;
    bytes(): Promise<Uint8Array>;
    text(): Promise<string>;
    write(data: string | Uint8Array | ArrayBuffer, options?: { type?: string }): Promise<number>;
    delete(): Promise<void>;
  }

  export interface S3ListItem {
    key: string;
    size?: number;
    eTag?: string;
    lastModified?: string;
  }

  export interface S3ListResult {
    contents?: S3ListItem[];
    isTruncated?: boolean;
    nextContinuationToken?: string;
  }

  export class S3Client {
    constructor(options: S3Options);
    file(key: string): S3File;
    write(key: string, data: string | Uint8Array | ArrayBuffer, options?: { type?: string }): Promise<number>;
    exists(key: string): Promise<boolean>;
    stat(key: string): Promise<S3FileStat>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; maxKeys?: number; continuationToken?: string }): Promise<S3ListResult>;
    presign(key: string, options?: { expiresIn?: number; method?: string }): string;
  }
}
