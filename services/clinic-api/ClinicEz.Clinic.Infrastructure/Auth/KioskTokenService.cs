using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Context;
using ClinicEz.Shared.LocalAuth;
using Microsoft.IdentityModel.Tokens;

namespace ClinicEz.Clinic.Infrastructure.Auth;

public sealed class KioskTokenService : IKioskTokenService
{
    private readonly IFacilityTokenService _tokens;

    public KioskTokenService(IFacilityTokenService tokens)
    {
        _tokens = tokens;
    }

    public (string Token, DateTime ExpiresAtUtc) MintToken(
        string tenantId,
        Guid clinicId,
        int tokenVersion,
        string? deviceLabel = null,
        int? expiryDays = null)
    {
        var now = DateTime.UtcNow;
        var days = expiryDays is > 0 and <= 365 ? expiryDays.Value : 90;
        var expires = now.AddDays(days);

        var claims = new List<Claim>
        {
            new(ClinicClaimTypes.Subject, $"kiosk:{clinicId}:{Guid.NewGuid():N}"),
            new(ClinicClaimTypes.TokenType, "kiosk"),
            new(ClinicClaimTypes.TenantId, tenantId),
            new(ClinicClaimTypes.ClinicId, clinicId.ToString()),
            new(ClinicClaimTypes.TokenVersion, tokenVersion.ToString()),
            new(ClinicClaimTypes.Name, string.IsNullOrWhiteSpace(deviceLabel) ? "Self-Service Kiosk" : deviceLabel.Trim()),
            new("jti", Guid.NewGuid().ToString("N"))
        };

        var creds = new SigningCredentials(_tokens.SecurityKey, SecurityAlgorithms.HmacSha256);
        var jwt = new JwtSecurityToken(
            issuer: _tokens.Options.Issuer,
            audience: _tokens.Options.Audience,
            claims: claims,
            notBefore: now,
            expires: expires,
            signingCredentials: creds);

        var tokenString = new JwtSecurityTokenHandler().WriteToken(jwt);
        return (tokenString, expires);
    }
}
