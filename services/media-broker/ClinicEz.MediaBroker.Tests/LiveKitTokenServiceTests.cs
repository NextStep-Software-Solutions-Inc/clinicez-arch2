using System;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Text.Json;
using ClinicEz.MediaBroker.Application.Common.Options;
using ClinicEz.MediaBroker.Application.Services;
using FluentAssertions;
using Microsoft.Extensions.Options;
using Xunit;

namespace ClinicEz.MediaBroker.Tests;

public class LiveKitTokenServiceTests
{
    private readonly LiveKitTokenService _service;
    private readonly LiveKitOptions _options = new()
    {
        ApiKey = "test-api-key",
        ApiSecret = "0123456789abcdef0123456789abcdef",
        RelayUrl = "wss://media.clinicez.internal"
    };

    public LiveKitTokenServiceTests()
    {
        _service = new LiveKitTokenService(Options.Create(_options));
    }

    [Fact]
    public void CreateRoomToken_GeneratesValidJwt_WithZeroPhi()
    {
        var callId = Guid.NewGuid();
        var roomName = $"call-{callId:N}";
        var participantId = "staff:user-123";
        var ttl = TimeSpan.FromHours(1);

        var tokenString = _service.CreateRoomToken(roomName, participantId, ttl);

        tokenString.Should().NotBeNullOrWhiteSpace();

        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(tokenString);

        // Claims verification
        jwt.Issuer.Should().Be(_options.ApiKey);
        jwt.Subject.Should().Be(participantId);

        var videoClaim = jwt.Claims.FirstOrDefault(c => c.Type == "video");
        videoClaim.Should().NotBeNull();

        using var doc = JsonDocument.Parse(videoClaim!.Value);
        var root = doc.RootElement;
        root.GetProperty("room").GetString().Should().Be(roomName);
        root.GetProperty("roomJoin").GetBoolean().Should().BeTrue();
        root.GetProperty("canPublish").GetBoolean().Should().BeTrue();
        root.GetProperty("canSubscribe").GetBoolean().Should().BeTrue();
        root.GetProperty("canPublishData").GetBoolean().Should().BeTrue();

        // Strict Zero-PHI: metadata must not be present, patient names or diagnoses must not appear
        jwt.Claims.Should().NotContain(c => c.Type == "metadata");
        jwt.Claims.Should().NotContain(c => c.Type == "name");
        jwt.Claims.Should().NotContain(c => c.Type == "email");
        jwt.Claims.Should().NotContain(c => c.Type == "diagnosis");
    }

    [Theory]
    [InlineData("staff:doctor-smith")]
    [InlineData("patient:pat-98765")]
    [InlineData("guest:invite-abcde")]
    public void CreateRoomToken_AllowsValidOpaqueIdentities(string identity)
    {
        var roomName = $"call-{Guid.NewGuid():N}";
        var token = _service.CreateRoomToken(roomName, identity, TimeSpan.FromMinutes(30));
        token.Should().NotBeNullOrWhiteSpace();
    }

    [Theory]
    [InlineData("Juan Dela Cruz")] // Real patient name is prohibited
    [InlineData("patient:Juan Dela Cruz")] // Spaces or unescaped PHI prohibited
    [InlineData("admin")] // Must follow opaque prefix
    [InlineData("")]
    public void CreateRoomToken_RejectsNonOpaqueIdentities(string invalidIdentity)
    {
        var roomName = $"call-{Guid.NewGuid():N}";
        var act = () => _service.CreateRoomToken(roomName, invalidIdentity, TimeSpan.FromMinutes(30));
        act.Should().Throw<ArgumentException>();
    }

    [Theory]
    [InlineData("consultation-with-juan")] // Clinical hint in room name prohibited
    [InlineData("room_123")] // Must start with call- or room- followed by dash
    [InlineData("general-chat")]
    [InlineData("")]
    public void CreateRoomToken_RejectsInvalidRoomNames(string invalidRoomName)
    {
        var identity = "staff:user-1";
        var act = () => _service.CreateRoomToken(invalidRoomName, identity, TimeSpan.FromMinutes(30));
        act.Should().Throw<ArgumentException>();
    }
}
