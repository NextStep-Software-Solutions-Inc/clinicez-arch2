using System.Security.Cryptography;

namespace ClinicEz.Patient.Domain.Common;

/// <summary>
/// Generates the human-friendly <c>ClinicEzId</c> (<c>CE-XXXX-XXXX</c>). The alphabet drops I, L, O and U so an id read
/// aloud or typed from a card cannot be confused; 32^8 combinations make collisions negligible (a unique index guards them).
/// </summary>
public static class ClinicEzIdGenerator
{
    private const string Alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private const int GroupLength = 4;

    public static string Generate()
    {
        Span<char> chars = stackalloc char[GroupLength * 2];
        for (var i = 0; i < chars.Length; i++)
            chars[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];

        return $"CE-{new string(chars[..GroupLength])}-{new string(chars[GroupLength..])}";
    }
}