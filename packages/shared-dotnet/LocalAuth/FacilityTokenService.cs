using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ClinicEz.Shared.LocalAuth;

public sealed record IssuedAccessToken(string Token, DateTime ExpiresAtUtc);

public interface IFacilityTokenService
{
    IssuedAccessToken CreateAccessToken(IEnumerable<Claim> claims);

    /// <summary>Generates a cryptographically random opaque refresh token (URL-safe).</summary>
    string GenerateRefreshToken();

    /// <summary>SHA-256 hex hash used to store refresh tokens at rest.</summary>
    string HashRefreshToken(string token);

    FacilityJwtOptions Options { get; }

    SecurityKey SecurityKey { get; }
}

public sealed class FacilityTokenService : IFacilityTokenService
{
    private readonly SigningCredentials _credentials;

    public FacilityJwtOptions Options { get; }

    public SecurityKey SecurityKey => _credentials.Key;

    public FacilityTokenService(IOptions<FacilityJwtOptions> options, ILogger<FacilityTokenService> logger)
    {
        Options = options.Value;
        _credentials = new SigningCredentials(
            new SymmetricSecurityKey(SigningKeyProvider.Resolve(Options, logger)),
            SecurityAlgorithms.HmacSha256);
    }

    public IssuedAccessToken CreateAccessToken(IEnumerable<Claim> claims)
    {
        var now = DateTime.UtcNow;
        var expires = now.AddMinutes(Options.AccessTokenMinutes);
        var token = new JwtSecurityToken(
            issuer: Options.Issuer,
            audience: Options.Audience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: _credentials);
        return new IssuedAccessToken(new JwtSecurityTokenHandler().WriteToken(token), expires);
    }

    public string GenerateRefreshToken()
    {
        var bytes = RandomNumberGenerator.GetBytes(48);
        return Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public string HashRefreshToken(string token)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(hash);
    }
}
