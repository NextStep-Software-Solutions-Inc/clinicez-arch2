import { createHash } from "node:crypto";

export interface MockOriginHandle {
  server: Bun.Server;
  port: number;
  baseUrl: string;
  getHitCount: (path: string) => number;
  resetState: () => void;
  stop: () => void;
}

export function canonicalAzureBlob1Url(subPath: string): string {
  const clean = subPath.replace(/^\/+/, "");
  return `https://clinicezstorage.blob.core.windows.net/prod/e2e-synthetic/${clean}`;
}

export function canonicalAzureBlob2Url(subPath: string): string {
  const clean = subPath.replace(/^\/+/, "");
  return `https://clinicez.blob.core.windows.net/clinicez/e2e-synthetic/${clean}`;
}

export function canonicalGoogleDriveUrl(fileId: string, variant: "file" | "open" = "file"): string {
  if (variant === "open") {
    return `https://drive.google.com/open?id=${encodeURIComponent(fileId)}`;
  }
  return `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/view`;
}

/**
 * Produces deterministic non-PHI synthetic file payloads based on path & extension.
 */
export function deterministicPayloadForPath(pathname: string, exactSizeBytes?: number): Uint8Array {
  const digest = createHash("sha256").update(pathname).digest("hex");
  const lower = pathname.toLowerCase();

  let header: Uint8Array;
  if (lower.endsWith(".png")) {
    header = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  } else if (lower.endsWith(".txt")) {
    header = Buffer.from(`E2E-SYNTHETIC-TEXT:${pathname}:${digest}\n`, "utf8");
  } else {
    header = Buffer.from(`%PDF-1.4\n%E2E-SYNTHETIC:${pathname}:${digest}\n%%EOF\n`, "utf8");
  }

  if (exactSizeBytes === undefined || exactSizeBytes <= header.length) {
    return exactSizeBytes !== undefined ? header.subarray(0, Math.max(0, exactSizeBytes)) : header;
  }

  const out = new Uint8Array(exactSizeBytes);
  out.set(header, 0);
  const filler = Buffer.from(`|SYNTHETIC-FILL-${digest.slice(0, 16)}`, "utf8");
  let offset = header.length;
  while (offset < exactSizeBytes) {
    const remaining = exactSizeBytes - offset;
    if (remaining >= filler.length) {
      out.set(filler, offset);
      offset += filler.length;
    } else {
      out.set(filler.subarray(0, remaining), offset);
      offset += remaining;
    }
  }
  return out;
}

function contentTypeForPath(pathname: string): string {
  const lower = pathname.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".txt")) return "text/plain; charset=utf-8";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

export function startMockOrigin(port = 5199, hostname = "0.0.0.0"): MockOriginHandle {
  const hits = new Map<string, number>();

  const recordHit = (pathname: string): number => {
    const next = (hits.get(pathname) ?? 0) + 1;
    hits.set(pathname, next);
    return next;
  };

  const server = Bun.serve({
    port,
    hostname,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const pathname = url.pathname;
      const isHead = req.method === "HEAD";

      if (pathname === "/healthz") {
        return new Response(JSON.stringify({ status: "ok", synthetic: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const hitCount = recordHit(pathname);

      const delayMs = Number.parseInt(url.searchParams.get("delayMs") ?? "0", 10);
      if (Number.isFinite(delayMs) && delayMs > 0) {
        await Bun.sleep(Math.min(delayMs, 15_000));
      }

      // Prefix expected from canonical Azure Blob #1 rewrite: /prod/e2e-synthetic/...
      const prefix = "/prod/e2e-synthetic/";
      if (!pathname.startsWith(prefix)) {
        return new Response("Not Found (outside e2e-synthetic)", { status: 404 });
      }

      const rel = pathname.slice(prefix.length);

      if (rel.startsWith("dead-404/")) {
        return new Response("BlobNotFound", { status: 404 });
      }

      if (rel.startsWith("dead-410/")) {
        return new Response("Gone", { status: 410 });
      }

      if (rel.startsWith("empty-0/")) {
        return new Response(new Uint8Array(0), {
          status: 200,
          headers: {
            "Content-Type": contentTypeForPath(pathname),
            "Content-Length": "0",
          },
        });
      }

      if (rel.startsWith("auth-401/")) {
        return new Response("AuthenticationFailed", { status: 401 });
      }

      if (rel.startsWith("auth-403/")) {
        return new Response("AuthorizationFailure", { status: 403 });
      }

      if (rel.startsWith("html-wall/")) {
        const html =
          "<!DOCTYPE html><html><head><title>Sign In</title></head><body><h1>Sign in required</h1></body></html>";
        return new Response(isHead ? null : html, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Content-Length": String(Buffer.byteLength(html, "utf8")),
          },
        });
      }

      if (rel.startsWith("html-body-only/")) {
        const html = "<html><body>Sign in to continue</body></html>";
        return new Response(isHead ? null : html, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(Buffer.byteLength(html, "utf8")),
          },
        });
      }

      if (rel.startsWith("transient-503/")) {
        const failTimes = Number.parseInt(url.searchParams.get("fail") ?? "1", 10);
        if (hitCount <= failTimes) {
          return new Response("ServiceUnavailable", {
            status: 503,
            headers: { "Retry-After": "0" },
          });
        }
        const payload = deterministicPayloadForPath(pathname);
        return new Response(isHead ? null : Buffer.from(payload), {
          status: 200,
          headers: {
            "Content-Type": contentTypeForPath(pathname),
            "Content-Length": String(payload.byteLength),
          },
        });
      }

      if (rel.startsWith("transient-429/")) {
        const failTimes = Number.parseInt(url.searchParams.get("fail") ?? "1", 10);
        if (hitCount <= failTimes) {
          return new Response("TooManyRequests", {
            status: 429,
            headers: { "Retry-After": "0" },
          });
        }
        const payload = deterministicPayloadForPath(pathname);
        return new Response(isHead ? null : Buffer.from(payload), {
          status: 200,
          headers: {
            "Content-Type": contentTypeForPath(pathname),
            "Content-Length": String(payload.byteLength),
          },
        });
      }

      if (rel.startsWith("oversized/")) {
        const totalSize = 52 * 1024 * 1024; // 52 MiB (> 50 MB limit)
        if (isHead) {
          return new Response(null, {
            status: 200,
            headers: {
              "Content-Type": "application/octet-stream",
              "Content-Length": String(totalSize),
            },
          });
        }
        const chunkSize = 256 * 1024;
        const chunk = new Uint8Array(chunkSize);
        chunk.fill(0x41);
        let sent = 0;
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent >= totalSize) {
              controller.close();
              return;
            }
            const remaining = totalSize - sent;
            const slice = remaining >= chunkSize ? chunk : chunk.subarray(0, remaining);
            sent += slice.byteLength;
            controller.enqueue(slice);
          },
        });
        return new Response(stream, {
          status: 200,
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Length": String(totalSize),
          },
        });
      }

      if (rel.startsWith("custom-size/")) {
        const parts = rel.split("/");
        const requestedBytes = Number.parseInt(parts[1] ?? "64", 10);
        const safeBytes = Number.isFinite(requestedBytes)
          ? Math.max(0, Math.min(requestedBytes, 1024 * 1024))
          : 64;
        const payload = deterministicPayloadForPath(pathname, safeBytes);
        return new Response(isHead ? null : Buffer.from(payload), {
          status: 200,
          headers: {
            "Content-Type": contentTypeForPath(pathname),
            "Content-Length": String(payload.byteLength),
          },
        });
      }

      // Default for healthy/* and shared/*
      const payload = deterministicPayloadForPath(pathname);
      return new Response(isHead ? null : Buffer.from(payload), {
        status: 200,
        headers: {
          "Content-Type": contentTypeForPath(pathname),
          "Content-Length": String(payload.byteLength),
        },
      });
    },
  });

  return {
    server,
    port: server.port,
    baseUrl: `http://127.0.0.1:${server.port}`,
    getHitCount: (pathname: string) => hits.get(pathname) ?? 0,
    resetState: () => hits.clear(),
    stop: () => server.stop(true),
  };
}
