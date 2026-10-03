using System.Text.Json.Serialization;

namespace ClinicEz.PhilHealthProxy.Domain.Models;

/// <summary>
/// Represents the JSON payload envelope mandated by PhilHealth PKA v1.1 Annex D
/// for AES-256-CBC encrypted XML transmissions.
/// </summary>
public sealed record PhilHealthEncryptedPayload
{
    [JsonPropertyName("docMimeType")]
    public string DocMimeType { get; init; } = "<text/xml>";

    /// <summary>
    /// Hex-encoded SHA-256 hash of the unencrypted raw XML payload.
    /// </summary>
    [JsonPropertyName("hash")]
    public string Hash { get; init; } = string.Empty;

    [JsonPropertyName("key1")]
    public string Key1 { get; init; } = string.Empty;

    [JsonPropertyName("key2")]
    public string Key2 { get; init; } = string.Empty;

    /// <summary>
    /// Base64-encoded Initialization Vector (16 bytes for AES-256-CBC).
    /// </summary>
    [JsonPropertyName("iv")]
    public string Iv { get; init; } = string.Empty;

    /// <summary>
    /// Base64-encoded AES-256-CBC ciphertext of the XML payload.
    /// </summary>
    [JsonPropertyName("doc")]
    public string Doc { get; init; } = string.Empty;
}
