using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Application.Common.Options;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ClinicEz.MediaBroker.Application.Services;

public sealed partial class LiveKitTokenService : ILiveKitTokenService
{
    private readonly LiveKitOptions _options;

    public LiveKitTokenService(IOptions<LiveKitOptions> options)
    {
        _options = options.Value;
    }

    public string CreateRoomToken(string roomName, string participantIdentity, TimeSpan ttl)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(roomName);
        ArgumentException.ThrowIfNullOrWhiteSpace(participantIdentity);

        // Room name must follow call-{id} strictly, with no clinical details or patient names
        if (!RoomNameRegex().IsMatch(roomName))
        {
            throw new ArgumentException(
                $"Invalid room name '{roomName}'. Room name must start with 'call-' and contain only opaque alphanumeric identifiers.",
                nameof(roomName));
        }

        // Participant identity must strictly be opaque: staff:{id}, patient:{id}, guest:{id}, or participant-{id}
        if (!ParticipantIdentityRegex().IsMatch(participantIdentity))
        {
            throw new ArgumentException(
                $"Invalid participant identity '{participantIdentity}'. Identity must follow opaque format (e.g., 'staff:<id>', 'patient:<id>', 'guest:<id>', or 'participant-<id>') with zero PHI.",
                nameof(participantIdentity));
        }

        var now = DateTime.UtcNow;
        var expires = now.Add(ttl);
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.ApiSecret));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        // Strict Zero-PHI video grant
        var videoGrant = new Dictionary<string, object>
        {
            ["room"] = roomName,
            ["roomJoin"] = true,
            ["canPublish"] = true,
            ["canSubscribe"] = true,
            ["canPublishData"] = true
        };

        var claims = new List<Claim>
        {
            new("sub", participantIdentity),
            new("video", JsonSerializer.Serialize(videoGrant), JsonClaimValueTypes.Json)
        };

        var token = new JwtSecurityToken(
            issuer: _options.ApiKey,
            notBefore: now,
            expires: expires,
            claims: claims,
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    [GeneratedRegex(@"^call-[0-9a-fA-F\-]{32,36}$", RegexOptions.Compiled)]
    private static partial Regex RoomNameRegex();

    [GeneratedRegex(@"^(staff|patient|guest|participant)(:|-)[0-9a-zA-Z\-_]{1,64}$", RegexOptions.Compiled)]
    private static partial Regex ParticipantIdentityRegex();
}
