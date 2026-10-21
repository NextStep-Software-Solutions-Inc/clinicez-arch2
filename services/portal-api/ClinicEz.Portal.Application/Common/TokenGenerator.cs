using System;
using System.Security.Cryptography;

namespace ClinicEz.Portal.Application.Common;

public static class TokenGenerator
{
    /// <summary>
    /// Generates a cryptographically secure 256-bit (32-byte) hex token.
    /// </summary>
    public static string GenerateSecureToken(int byteLength = 32)
    {
        var bytes = RandomNumberGenerator.GetBytes(byteLength);
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
