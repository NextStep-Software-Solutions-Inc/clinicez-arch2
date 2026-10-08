using System.Security.Cryptography;
using System.Text;

namespace ClinicEz.Shared.Security;

/// <summary>
/// HTTP Basic credential check used to guard operational dashboards (Hangfire). Secure by default: when no password is
/// configured nothing matches, so a missing secret can never leave a dashboard open or fall back to a known default.
/// </summary>
public static class BasicAuth
{
    /// <summary>
    /// True when <paramref name="authorizationHeader"/> is a Basic header carrying exactly the expected user name and password.
    /// Compared in constant time. A blank expected password or user name never matches.
    /// </summary>
    public static bool Matches(string? authorizationHeader, string? expectedUser, string? expectedPassword)
    {
        if (string.IsNullOrEmpty(expectedUser) || string.IsNullOrEmpty(expectedPassword)) return false;
        if (string.IsNullOrWhiteSpace(authorizationHeader) ||
            !authorizationHeader.StartsWith("Basic ", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        string decoded;
        try
        {
            decoded = Encoding.UTF8.GetString(Convert.FromBase64String(authorizationHeader["Basic ".Length..].Trim()));
        }
        catch (FormatException)
        {
            return false;
        }

        var colon = decoded.IndexOf(':');
        if (colon <= 0) return false;

        var userMatches = FixedTimeEquals(decoded[..colon], expectedUser);
        var passwordMatches = FixedTimeEquals(decoded[(colon + 1)..], expectedPassword);
        return userMatches & passwordMatches;
    }

    private static bool FixedTimeEquals(string a, string b) =>
        CryptographicOperations.FixedTimeEquals(
            SHA256.HashData(Encoding.UTF8.GetBytes(a)),
            SHA256.HashData(Encoding.UTF8.GetBytes(b)));
}