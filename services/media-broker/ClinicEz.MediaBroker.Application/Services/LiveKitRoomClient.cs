using System;
using System.Collections.Generic;
using System.IdentityModel.Tokens.Jwt;
using System.Net.Http;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.MediaBroker.Application.Common.Interfaces;
using ClinicEz.MediaBroker.Application.Common.Options;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace ClinicEz.MediaBroker.Application.Services;

public sealed class LiveKitRoomClient : ILiveKitRoomClient
{
    private readonly HttpClient _httpClient;
    private readonly LiveKitOptions _options;
    private readonly ILogger<LiveKitRoomClient> _logger;

    public LiveKitRoomClient(HttpClient httpClient, IOptions<LiveKitOptions> options, ILogger<LiveKitRoomClient> logger)
    {
        _httpClient = httpClient;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<bool> DeleteRoomAsync(string roomName, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(_options.ApiKey) || string.IsNullOrWhiteSpace(_options.ApiSecret))
        {
            _logger.LogWarning("[LiveKitRoomClient] Credentials not configured; skipping DeleteRoom for {RoomName}", roomName);
            return false;
        }

        try
        {
            var baseHttpUrl = _options.RelayUrl.Replace("wss://", "https://").Replace("ws://", "http://").TrimEnd('/');
            var token = CreateAdminToken(roomName);

            using var request = new HttpRequestMessage(HttpMethod.Post, $"{baseHttpUrl}/twirp/livekit.RoomService/DeleteRoom");
            request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
            request.Content = new StringContent(JsonSerializer.Serialize(new { room = roomName }), Encoding.UTF8, "application/json");

            var response = await _httpClient.SendAsync(request, ct);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning("[LiveKitRoomClient] DeleteRoom returned status {StatusCode} for room {RoomName}", response.StatusCode, roomName);
                return false;
            }

            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "[LiveKitRoomClient] DeleteRoom failed for room {RoomName} (non-blocking fallback)", roomName);
            return false;
        }
    }

    private string CreateAdminToken(string roomName)
    {
        var now = DateTime.UtcNow;
        var expires = now.AddMinutes(5);
        var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_options.ApiSecret));
        var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

        var videoGrant = new Dictionary<string, object>
        {
            ["room"] = roomName,
            ["roomAdmin"] = true
        };

        var claims = new List<Claim>
        {
            new("sub", "media-broker-admin"),
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
}
