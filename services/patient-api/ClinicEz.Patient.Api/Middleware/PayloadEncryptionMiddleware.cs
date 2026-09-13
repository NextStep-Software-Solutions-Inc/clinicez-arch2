using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ClinicEz.Patient.Infrastructure.Options;

namespace ClinicEz.Patient.Api.Middleware;

/// <summary>
/// AES-256-GCM End-to-End payload encryption middleware.
///
/// <b>Production:</b> Encrypts every API response and decrypts encrypted request bodies.
/// The mobile client is expected to:
///   - Send <c>X-Encrypted: 1</c> header when the request body is encrypted.
///   - Decrypt the <c>{"payload":"..."}</c> response envelope.
///
/// <b>Development:</b> When <c>Encryption:Enabled = false</c>, this middleware is a no-op.
///
/// Wire format (both directions):
///   <c>{"payload":"&lt;base64(nonce[12] + ciphertext[n] + tag[16])&gt;"}</c>
/// </summary>
public sealed class PayloadEncryptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly bool _enabled;
    private readonly byte[] _key;

    public PayloadEncryptionMiddleware(RequestDelegate next, IOptions<EncryptionOptions> options)
    {
        _next = next;
        var opts = options.Value;
        _enabled = opts.Enabled;

        if (_enabled)
        {
            if (string.IsNullOrWhiteSpace(opts.Base64Key))
                throw new InvalidOperationException(
                    "Encryption:Base64Key must be configured when Encryption:Enabled is true. " +
                    "Set it via user-secrets or the ENCRYPTION__BASE64KEY environment variable.");

            _key = Convert.FromBase64String(opts.Base64Key);

            if (_key.Length != 32)
                throw new InvalidOperationException(
                    "Encryption:Base64Key must decode to exactly 32 bytes (AES-256). " +
                    "Generate one with: openssl rand -base64 32");
        }
        else
        {
            _key = [];
        }
    }

    public async Task InvokeAsync(HttpContext context)
    {
        if (!_enabled)
        {
            await _next(context);
            return;
        }

        // ── Decrypt incoming request body if the client signals it is encrypted ──
        if (context.Request.Headers.TryGetValue("X-Encrypted", out var encHeader)
            && encHeader == "1"
            && context.Request.ContentLength > 0)
        {
            context.Request.EnableBuffering();
            var requestJson = await new StreamReader(context.Request.Body, Encoding.UTF8).ReadToEndAsync();
            context.Request.Body.Seek(0, SeekOrigin.Begin);

            var plainBytes = DecryptPayload(requestJson);
            context.Request.Body = new MemoryStream(plainBytes);
            context.Request.ContentLength = plainBytes.Length;
            context.Request.ContentType = "application/json; charset=utf-8";
        }

        // ── Capture response body for encryption ─────────────────────────────────
        var originalResponseBody = context.Response.Body;
        using var capturedResponse = new MemoryStream();
        context.Response.Body = capturedResponse;

        await _next(context);

        capturedResponse.Seek(0, SeekOrigin.Begin);
        var plainResponseBytes = capturedResponse.ToArray();

        var encrypted = EncryptBytes(plainResponseBytes);
        var envelope = JsonSerializer.Serialize(new { payload = encrypted });
        var envelopeBytes = Encoding.UTF8.GetBytes(envelope);

        context.Response.Body = originalResponseBody;
        context.Response.ContentType = "application/json; charset=utf-8";
        context.Response.ContentLength = envelopeBytes.Length;

        await context.Response.Body.WriteAsync(envelopeBytes, context.RequestAborted);
    }

    private string EncryptBytes(byte[] plaintext)
    {
        var nonce = new byte[AesGcm.NonceByteSizes.MaxSize];   // 12 bytes
        RandomNumberGenerator.Fill(nonce);

        var tag = new byte[AesGcm.TagByteSizes.MaxSize];       // 16 bytes
        var ciphertext = new byte[plaintext.Length];

        using var aesGcm = new AesGcm(_key, tagSizeInBytes: 16);
        aesGcm.Encrypt(nonce, plaintext, ciphertext, tag);

        // Combine: nonce(12) + ciphertext(n) + tag(16)
        var combined = new byte[nonce.Length + ciphertext.Length + tag.Length];
        nonce.CopyTo(combined, 0);
        ciphertext.CopyTo(combined, nonce.Length);
        tag.CopyTo(combined, nonce.Length + ciphertext.Length);

        return Convert.ToBase64String(combined);
    }

    private byte[] DecryptPayload(string envelopeJson)
    {
        using var doc = JsonDocument.Parse(envelopeJson);
        if (!doc.RootElement.TryGetProperty("payload", out var payloadElement))
            throw new InvalidDataException("Encrypted request body must contain a 'payload' field.");

        var combined = Convert.FromBase64String(payloadElement.GetString()!);

        const int nonceSize = 12;
        const int tagSize = 16;

        if (combined.Length < nonceSize + tagSize)
            throw new InvalidDataException("Encrypted payload is malformed: too short.");

        var nonce = combined[..nonceSize];
        var tag = combined[^tagSize..];
        var ciphertext = combined[nonceSize..^tagSize];
        var plaintext = new byte[ciphertext.Length];

        using var aesGcm = new AesGcm(_key, tagSizeInBytes: 16);
        aesGcm.Decrypt(nonce, ciphertext, tag, plaintext);

        return plaintext;
    }
}
