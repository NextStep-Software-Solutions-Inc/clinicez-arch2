using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;

namespace ClinicEz.Shared.Interop;

/// <summary>
/// Envelope signatures (ECDSA P-256, SHA-256, base64 of the IEEE P1363 r||s form). What is signed is a canonical text
/// form of the routing fields plus the SHA-256 of the canonical payload JSON, so re-serialising an envelope on its way
/// through hubs (whitespace, property order, escaping) never invalidates it, while any change to who/what/when does.
/// </summary>
public static class EnvelopeSigning
{
    private const string Version = "clinicez-envelope-v1";

    private static readonly JsonWriterOptions CanonicalWriterOptions = new()
    {
        Indented = false,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    /// <summary>The bytes that are signed. <see cref="InteropEnvelope.Signature"/> itself is not part of them.</summary>
    public static byte[] CanonicalBytes(InteropEnvelope envelope)
    {
        ArgumentNullException.ThrowIfNull(envelope);

        var text = new StringBuilder(256);
        text.Append(Version).Append('\n');
        text.Append(envelope.MessageId.ToString("D")).Append('\n');
        text.Append(envelope.CorrelationId.ToString("D")).Append('\n');
        Field(text, envelope.Type);
        text.Append(envelope.SchemaVersion.ToString(CultureInfo.InvariantCulture)).Append('\n');
        AppendParty(text, envelope.From);
        AppendParty(text, envelope.SignedTo ?? envelope.To);
        text.Append(Utc(envelope.SentAtUtc)).Append('\n');
        text.Append(envelope.ExpiresAtUtc is { } expires ? Utc(expires) : string.Empty).Append('\n');
        text.Append(Convert.ToBase64String(SHA256.HashData(CanonicalPayload(envelope.Payload)))).Append('\n');
        text.Append(envelope.SealedPayload is null
            ? string.Empty
            : Convert.ToBase64String(SHA256.HashData(Encoding.UTF8.GetBytes(envelope.SealedPayload)))).Append('\n');
        Field(text, envelope.SignerKeyId);
        return Encoding.UTF8.GetBytes(text.ToString());
    }

    public static string Sign(InteropEnvelope envelope, ECDsa privateKey)
    {
        ArgumentNullException.ThrowIfNull(privateKey);
        return Convert.ToBase64String(privateKey.SignData(CanonicalBytes(envelope), HashAlgorithmName.SHA256));
    }

    public static bool Verify(InteropEnvelope envelope, string signature, ECDsa publicKey)
    {
        ArgumentNullException.ThrowIfNull(publicKey);
        if (string.IsNullOrWhiteSpace(signature)) return false;

        try
        {
            return publicKey.VerifyData(CanonicalBytes(envelope), Convert.FromBase64String(signature), HashAlgorithmName.SHA256);
        }
        catch (FormatException)
        {
            return false;
        }
        catch (CryptographicException)
        {
            return false;
        }
    }

    /// <summary>Property names sorted ordinally, minimal whitespace, numbers normalised, strings escaped one fixed way.</summary>
    public static byte[] CanonicalPayload(JsonElement payload)
    {
        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream, CanonicalWriterOptions))
        {
            WriteCanonical(writer, payload);
        }

        return stream.ToArray();
    }

    private static void WriteCanonical(Utf8JsonWriter writer, JsonElement element)
    {
        switch (element.ValueKind)
        {
            case JsonValueKind.Object:
                writer.WriteStartObject();
                foreach (var property in element.EnumerateObject().OrderBy(p => p.Name, StringComparer.Ordinal))
                {
                    writer.WritePropertyName(property.Name);
                    WriteCanonical(writer, property.Value);
                }

                writer.WriteEndObject();
                break;
            case JsonValueKind.Array:
                writer.WriteStartArray();
                foreach (var item in element.EnumerateArray()) WriteCanonical(writer, item);
                writer.WriteEndArray();
                break;
            case JsonValueKind.String:
                writer.WriteStringValue(element.GetString());
                break;
            case JsonValueKind.Number:
                if (element.TryGetInt64(out var integer)) writer.WriteNumberValue(integer);
                else writer.WriteNumberValue(element.GetDouble());
                break;
            case JsonValueKind.True:
                writer.WriteBooleanValue(true);
                break;
            case JsonValueKind.False:
                writer.WriteBooleanValue(false);
                break;
            default:
                writer.WriteNullValue();
                break;
        }
    }

    private static void AppendParty(StringBuilder text, Party party)
    {
        Field(text, party.Kind.ToString());
        Field(text, party.TenantId);
        Field(text, party.FacilityId);
        Field(text, party.PatientId);
        Field(text, party.FacilityType?.ToString());
        Field(text, party.Service);
    }

    /// <summary>Length-prefixed so no field value can run into the next one.</summary>
    private static void Field(StringBuilder text, string? value)
    {
        value ??= string.Empty;
        text.Append(value.Length.ToString(CultureInfo.InvariantCulture)).Append(':').Append(value).Append('\n');
    }

    private static string Utc(DateTime value)
    {
        var utc = value.Kind == DateTimeKind.Unspecified ? DateTime.SpecifyKind(value, DateTimeKind.Utc) : value.ToUniversalTime();
        return utc.ToString("yyyy-MM-dd'T'HH:mm:ss.fffffff'Z'", CultureInfo.InvariantCulture);
    }
}
