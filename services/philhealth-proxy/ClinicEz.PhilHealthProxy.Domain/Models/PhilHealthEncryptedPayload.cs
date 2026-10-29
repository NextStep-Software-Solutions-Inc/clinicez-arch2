using System.Text.Json.Serialization;

namespace ClinicEz.PhilHealthProxy.Domain.Models;

/// <summary>
/// Encrypted data envelope mandated by PhilHealth PCAPI v2.0 Annex C.
/// </summary>
public sealed record PhilHealthEncryptedPayload
{
    [JsonPropertyName("docMimeType")]
    public string DocMimeType { get; init; } = "application/json";

    /// <summary>
    /// Hex-encoded SHA-256 hash of the unencrypted payload (lowercase, 64 characters).
    /// </summary>
    [JsonPropertyName("hash")]
    public string Hash { get; init; } = string.Empty;

    [JsonPropertyName("key1")]
    public string Key1 { get; init; } = string.Empty;

    [JsonPropertyName("key2")]
    public string Key2 { get; init; } = string.Empty;

    /// <summary>
    /// Base64-encoded 16-byte Initialization Vector (AES-256-CBC).
    /// </summary>
    [JsonPropertyName("iv")]
    public string Iv { get; init; } = string.Empty;

    /// <summary>
    /// Base64-encoded AES-256-CBC ciphertext.
    /// </summary>
    [JsonPropertyName("doc")]
    public string Doc { get; init; } = string.Empty;
}
