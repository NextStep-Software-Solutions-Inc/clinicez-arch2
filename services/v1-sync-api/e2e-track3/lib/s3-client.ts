import { createHash, createHmac } from "node:crypto";
import type { E2EConfig } from "./config.ts";
import { loadConfig } from "./config.ts";
import { assertNonProductionTargetUrl } from "./guardrails.ts";

function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmacSha256(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function encodeS3Path(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export interface HeadObjectMetadata {
  exists: boolean;
  status: number;
  contentLength: number | null;
  contentType: string | null;
  etag: string | null;
  encryption: string | null;
  keyScheme: string | null;
  rawHeaders: Record<string, string>;
}

export class Track3S3Harness {
  readonly endpoint: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly region = "auto";
  readonly clinicBucket: string;
  readonly patientBucket: string;
  private readonly clients = new Map<string, Bun.S3Client>();

  constructor(config: E2EConfig = loadConfig()) {
    assertNonProductionTargetUrl(config.minioEndpoint, "MINIO_ENDPOINT");
    this.endpoint = config.minioEndpoint;
    this.accessKeyId = config.minioAccessKey;
    this.secretAccessKey = config.minioSecretKey;
    this.clinicBucket = config.clinicR2Bucket;
    this.patientBucket = config.patientR2Bucket;
  }

  clientFor(bucket: string): Bun.S3Client {
    let client = this.clients.get(bucket);
    if (!client) {
      client = new Bun.S3Client({
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
        bucket,
        endpoint: this.endpoint,
        region: this.region,
      });
      this.clients.set(bucket, client);
    }
    return client;
  }

  async exists(bucket: string, key: string): Promise<boolean> {
    return this.clientFor(bucket).exists(key);
  }

  async stat(bucket: string, key: string): Promise<Bun.S3FileStat> {
    return this.clientFor(bucket).stat(key);
  }

  async getBytes(bucket: string, key: string): Promise<Buffer> {
    const arr = await this.clientFor(bucket).file(key).bytes();
    return Buffer.from(arr);
  }

  async putBytes(bucket: string, key: string, bytes: Uint8Array, contentType = "application/octet-stream"): Promise<number> {
    return this.clientFor(bucket).write(key, bytes, { type: contentType });
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    await this.clientFor(bucket).delete(key);
  }

  async listKeys(bucket: string, prefix = "", maxKeys = 1000): Promise<string[]> {
    const result = await this.clientFor(bucket).list({ prefix, maxKeys });
    return (result.contents ?? []).map((item) => item.key);
  }

  /**
   * Issues an AWS SigV4 signed request against path-style MinIO/S3 endpoint.
   * Used for bucket check/create and inspecting x-amz-meta-* headers directly.
   */
  async signedFetch(
    method: "HEAD" | "PUT" | "GET" | "DELETE",
    bucket: string,
    key = "",
    body: Uint8Array | string = "",
    extraHeaders: Record<string, string> = {},
  ): Promise<Response> {
    const base = new URL(this.endpoint);
    const objectPath = key ? `/${encodeS3Path(bucket)}/${encodeS3Path(key)}` : `/${encodeS3Path(bucket)}`;
    const targetUrl = `${base.origin}${objectPath}`;

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256Hex(body);

    const headersToSign: Record<string, string> = {
      host: base.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    for (const [k, v] of Object.entries(extraHeaders)) {
      headersToSign[k.toLowerCase()] = v.trim();
    }

    const sortedKeys = Object.keys(headersToSign).sort();
    const canonicalHeaders = sortedKeys.map((k) => `${k}:${headersToSign[k]}\n`).join("");
    const signedHeaders = sortedKeys.join(";");
    const canonicalRequest = [
      method,
      objectPath,
      "",
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join("\n");

    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

    const kDate = hmacSha256(`AWS4${this.secretAccessKey}`, dateStamp);
    const kRegion = hmacSha256(kDate, this.region);
    const kService = hmacSha256(kRegion, "s3");
    const kSigning = hmacSha256(kService, "aws4_request");
    const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

    const authorization = `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const fetchHeaders: Record<string, string> = {
      ...headersToSign,
      authorization,
    };
    delete fetchHeaders.host;

    return fetch(targetUrl, {
      method,
      headers: fetchHeaders,
      body: method === "PUT" ? (typeof body === "string" ? body : Buffer.from(body)) : undefined,
    });
  }

  async headObjectMetadata(bucket: string, key: string): Promise<HeadObjectMetadata> {
    const res = await this.signedFetch("HEAD", bucket, key);
    const rawHeaders: Record<string, string> = {};
    res.headers.forEach((value, name) => {
      rawHeaders[name.toLowerCase()] = value;
    });

    if (res.status === 404) {
      return {
        exists: false,
        status: 404,
        contentLength: null,
        contentType: null,
        etag: null,
        encryption: null,
        keyScheme: null,
        rawHeaders,
      };
    }

    const lenStr = rawHeaders["content-length"];
    return {
      exists: res.ok,
      status: res.status,
      contentLength: lenStr !== undefined ? Number.parseInt(lenStr, 10) : null,
      contentType: rawHeaders["content-type"] ?? null,
      etag: rawHeaders["etag"] ?? null,
      encryption: rawHeaders["x-amz-meta-encryption"] ?? null,
      keyScheme: rawHeaders["x-amz-meta-key-scheme"] ?? null,
      rawHeaders,
    };
  }

  async ensureBucketExists(bucket: string): Promise<void> {
    const head = await this.signedFetch("HEAD", bucket);
    if (head.ok) return;
    if (head.status === 404) {
      const createRes = await this.signedFetch("PUT", bucket);
      if (createRes.ok || createRes.status === 409) return;
      const errText = await createRes.text();
      throw new Error(`Failed to create MinIO bucket "${bucket}" (${createRes.status}): ${errText}`);
    }
    throw new Error(`Unexpected HEAD /${bucket} status ${head.status}`);
  }
}
