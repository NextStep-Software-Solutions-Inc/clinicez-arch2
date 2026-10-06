using System.Security.Cryptography;
using System.Text;
using ClinicEz.Patient.Api.Endpoints.Webhooks;
using FluentAssertions;

namespace ClinicEz.Patient.Api.Tests.Webhooks;

public sealed class ClerkWebhookEndpointTests
{
    [Fact]
    public void VerifySvixSignature_WithValidSignature_ReturnsTrue()
    {
        // Arrange
        // 32-byte secret in Base64 (similar to Clerk whsec_...)
        var rawKey = new byte[32];
        RandomNumberGenerator.Fill(rawKey);
        var base64Key = Convert.ToBase64String(rawKey);
        var secret = "whsec_" + base64Key;

        var svixId = "msg_2d6Gq8J3k0x1b5N7z";
        var svixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var payload = "{\"data\":{\"id\":\"user_test_123\"},\"type\":\"user.created\"}";

        var signedContent = $"{svixId}.{svixTimestamp}.{payload}";
        using var hmac = new HMACSHA256(rawKey);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedContent));
        var signature = "v1," + Convert.ToBase64String(hash);

        // Act
        var result = ClerkWebhookEndpoint.VerifySvixSignature(secret, svixId, svixTimestamp, payload, signature);

        // Assert
        result.Should().BeTrue();
    }

    [Fact]
    public void VerifySvixSignature_WithTamperedPayload_ReturnsFalse()
    {
        // Arrange
        var rawKey = new byte[32];
        RandomNumberGenerator.Fill(rawKey);
        var base64Key = Convert.ToBase64String(rawKey);
        var secret = "whsec_" + base64Key;

        var svixId = "msg_2d6Gq8J3k0x1b5N7z";
        var svixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var payload = "{\"data\":{\"id\":\"user_test_123\"},\"type\":\"user.created\"}";

        var signedContent = $"{svixId}.{svixTimestamp}.{payload}";
        using var hmac = new HMACSHA256(rawKey);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedContent));
        var signature = "v1," + Convert.ToBase64String(hash);

        // Act
        var result = ClerkWebhookEndpoint.VerifySvixSignature(secret, svixId, svixTimestamp, payload + "tampered", signature);

        // Assert
        result.Should().BeFalse();
    }

    [Fact]
    public void VerifySvixSignature_WithMultipleSignatures_WhereOneMatches_ReturnsTrue()
    {
        // Arrange
        var rawKey = new byte[32];
        RandomNumberGenerator.Fill(rawKey);
        var base64Key = Convert.ToBase64String(rawKey);
        var secret = "whsec_" + base64Key;

        var svixId = "msg_2d6Gq8J3k0x1b5N7z";
        var svixTimestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString();
        var payload = "{\"data\":{\"id\":\"user_test_123\"},\"type\":\"user.created\"}";

        var signedContent = $"{svixId}.{svixTimestamp}.{payload}";
        using var hmac = new HMACSHA256(rawKey);
        var hash = hmac.ComputeHash(Encoding.UTF8.GetBytes(signedContent));
        var validSignature = "v1," + Convert.ToBase64String(hash);
        var combinedSignatures = $"v1,invalidSig1 {validSignature} v1,invalidSig2";

        // Act
        var result = ClerkWebhookEndpoint.VerifySvixSignature(secret, svixId, svixTimestamp, payload, combinedSignatures);

        // Assert
        result.Should().BeTrue();
    }
}
