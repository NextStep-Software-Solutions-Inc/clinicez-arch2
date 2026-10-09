using System.Security.Cryptography;
using System.Text;
using ClinicEz.Patient.Application.Common.Interfaces;
using Microsoft.Extensions.Options;

namespace ClinicEz.Patient.Application.Features.Sharing;

/// <summary>
/// Codes are eight characters from a 31-symbol alphabet (no 0/O, 1/I/L), about 40 bits, which is only safe because attempts
/// are throttled and a code lives for minutes and works once. Only an HMAC-SHA256 of the code is persisted.
/// </summary>
public sealed class ShareCodeService : IShareCodeService
{
    public const int CodeLength = 8;
    private const int GroupLength = 4;
    private const string Alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    private readonly byte[] _key;

    public ShareCodeService(IOptions<SharingOptions> options)
    {
        var configured = options.Value;
        if (configured.SigningKey.Length < SharingOptions.MinimumSigningKeyLength)
            throw new InvalidOperationException(
                $"{SharingOptions.SectionName}:{nameof(SharingOptions.SigningKey)} must be at least {SharingOptions.MinimumSigningKeyLength} characters.");

        _key = Encoding.UTF8.GetBytes(configured.SigningKey);
    }

    public string Generate()
    {
        Span<char> chars = stackalloc char[CodeLength];
        for (var i = 0; i < chars.Length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];

        return new string(chars);
    }

    public string? Normalize(string? typed)
    {
        if (string.IsNullOrWhiteSpace(typed))
            return null;

        var normalized = new string(typed.Where(char.IsLetterOrDigit).Select(char.ToUpperInvariant).ToArray());
        return normalized.Length == CodeLength && normalized.All(c => Alphabet.Contains(c)) ? normalized : null;
    }

    public string Hash(Guid patientId, string normalizedCode) =>
        Convert.ToHexString(HMACSHA256.HashData(_key, Encoding.UTF8.GetBytes($"{patientId:N}:{normalizedCode}"))).ToLowerInvariant();

    public string Format(string normalizedCode) => $"{normalizedCode[..GroupLength]}-{normalizedCode[GroupLength..]}";
}
