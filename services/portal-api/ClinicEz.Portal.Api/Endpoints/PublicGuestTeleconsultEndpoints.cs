using System;
using System.Text.Json.Serialization;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Portal.Api.Abstractions;
using ClinicEz.Portal.Application.Interfaces;
using ClinicEz.Shared.Common;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Portal.Api.Endpoints;

public sealed record GuestTeleconsultVerifyRequest(
    [property: JsonPropertyName("inviteToken")] string InviteToken,
    [property: JsonPropertyName("dateOfBirth")] string DateOfBirth,
    [property: JsonPropertyName("otp")] string Otp);

public sealed record GuestTeleconsultVerifyResponse(
    [property: JsonPropertyName("success")] bool Success,
    [property: JsonPropertyName("callId")] Guid? CallId,
    [property: JsonPropertyName("roomName")] string? RoomName,
    [property: JsonPropertyName("relayUrl")] string? RelayUrl,
    [property: JsonPropertyName("guestToken")] string? GuestToken,
    [property: JsonPropertyName("remainingAttempts")] int RemainingAttempts,
    [property: JsonPropertyName("message")] string? Message,
    [property: JsonPropertyName("errorCode")] string? ErrorCode,
    [property: JsonPropertyName("guestDisplayName")] string? GuestDisplayName = null,
    [property: JsonPropertyName("clinicName")] string? ClinicName = null,
    [property: JsonPropertyName("clinicSupportPhone")] string? ClinicSupportPhone = null,
    [property: JsonPropertyName("clinicianName")] string? ClinicianName = null,
    [property: JsonPropertyName("scheduledAtUtc")] DateTime? ScheduledAtUtc = null);

public sealed record GuestTeleconsultStatusResponse(
    [property: JsonPropertyName("status")] string Status,
    [property: JsonPropertyName("isEnded")] bool IsEnded,
    [property: JsonPropertyName("isExpired")] bool IsExpired,
    [property: JsonPropertyName("isLockedOut")] bool IsLockedOut,
    [property: JsonPropertyName("expiresAtUtc")] DateTime? ExpiresAtUtc,
    [property: JsonPropertyName("clinicName")] string? ClinicName = null,
    [property: JsonPropertyName("clinicSupportPhone")] string? ClinicSupportPhone = null,
    [property: JsonPropertyName("clinicianName")] string? ClinicianName = null,
    [property: JsonPropertyName("scheduledAtUtc")] DateTime? ScheduledAtUtc = null);

public sealed class PublicGuestTeleconsultEndpoints : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        (string Route, string Name)[] verifyRoutes =
        [
            ("/portal/guest/teleconsult/verify", "VerifyGuestTeleconsultAccess"),
            ("/public/guest/teleconsult/verify", "VerifyPublicGuestTeleconsultAccess"),
            ("/guest/verify", "VerifyGuestAccess")
        ];

        foreach (var (route, name) in verifyRoutes)
        {
            app.MapPost(route, HandleAsync)
                .AllowAnonymous()
                .DisableAntiforgery()
                .RequireRateLimiting("GuestVerifyRateLimiter")
                .WithName(name)
                .WithSummary("Dual-factor guest teleconsultation verification (OTP + Date of Birth)")
                .WithDescription("Verifies guest teleconsultation invite token, patient DOB, and 6-digit OTP code. Enforces 5-attempt permanent lockout and Zero-PHI LiveKit room token minting.")
                .WithTags("GuestTeleconsult")
                .Produces<ApiResponse<GuestTeleconsultVerifyResponse>>(StatusCodes.Status200OK)
                .Produces<ApiResponse<GuestTeleconsultVerifyResponse>>(StatusCodes.Status400BadRequest)
                .Produces<ApiResponse<GuestTeleconsultVerifyResponse>>(StatusCodes.Status401Unauthorized)
                .Produces<ApiResponse<GuestTeleconsultVerifyResponse>>(StatusCodes.Status410Gone)
                .Produces<ApiResponse<GuestTeleconsultVerifyResponse>>(StatusCodes.Status423Locked);
        }

        (string Route, string Name)[] statusRoutes =
        [
            ("/portal/guest/teleconsult/status", "GetGuestTeleconsultStatus"),
            ("/public/guest/teleconsult/status", "GetPublicGuestTeleconsultStatus"),
            ("/guest/status", "GetGuestStatus")
        ];

        foreach (var (route, name) in statusRoutes)
        {
            app.MapGet(route, HandleStatusAsync)
                .AllowAnonymous()
                .WithName(name)
                .WithSummary("Check zero-PHI teleconsultation guest status")
                .WithDescription("Preflight zero-PHI status check for guest teleconsultation invite links.")
                .WithTags("GuestTeleconsult")
                .Produces<ApiResponse<GuestTeleconsultStatusResponse>>(StatusCodes.Status200OK)
                .Produces<ApiResponse<GuestTeleconsultStatusResponse>>(StatusCodes.Status400BadRequest)
                .Produces<ApiResponse<GuestTeleconsultStatusResponse>>(StatusCodes.Status404NotFound)
                .Produces<ApiResponse<GuestTeleconsultStatusResponse>>(StatusCodes.Status410Gone)
                .Produces<ApiResponse<GuestTeleconsultStatusResponse>>(StatusCodes.Status423Locked);
        }
    }

    public static IResult HandleStatusAsync(
        [FromQuery(Name = "inviteToken")] string? inviteToken,
        IGuestVerificationService verificationService,
        [FromQuery(Name = "token")] string? token = null)
    {
        var effectiveToken = string.IsNullOrWhiteSpace(inviteToken) ? token : inviteToken;
        if (string.IsNullOrWhiteSpace(effectiveToken))
        {
            return Results.BadRequest(
                ApiResponse<GuestTeleconsultStatusResponse>.Fail("Invite token is required.", [], "EMPTY_TOKEN"));
        }

        var cleanToken = effectiveToken.Trim().ToLowerInvariant();
        if (cleanToken.StartsWith("rx-") || cleanToken.StartsWith("mc-") || cleanToken.StartsWith("ref-") || cleanToken.StartsWith("lab-") || cleanToken.StartsWith("sec-sha256-") ||
            (cleanToken.Length == 65 && cleanToken[32] == '.') ||
            (cleanToken.Length >= 50 && cleanToken.Length <= 60 && cleanToken.IndexOf('.') == 32))
        {
            return Results.BadRequest(
                ApiResponse<GuestTeleconsultStatusResponse>.Fail("The provided token is for a clinical document, not a teleconsultation invitation.", [], "DOCUMENT_KIND_MISMATCH"));
        }

        var invite = verificationService.GetInviteByToken(effectiveToken);
        if (invite is null)
        {
            return Results.NotFound(
                ApiResponse<GuestTeleconsultStatusResponse>.Fail("No teleconsultation found for this link.", [], "GUEST_INVITE_NOT_FOUND"));
        }

        if (invite.IsRevoked)
        {
            return Results.Json(
                ApiResponse<GuestTeleconsultStatusResponse>.Fail("This teleconsultation has been ended by the attending clinician.", [], "GUEST_CONSULTATION_ENDED"),
                statusCode: StatusCodes.Status410Gone);
        }

        if (invite.IsLockedOut || invite.AttemptCount >= 5)
        {
            return Results.Json(
                ApiResponse<GuestTeleconsultStatusResponse>.Fail("This link is permanently locked after 5 failed verification attempts.", [], "GUEST_INVITE_LOCKED_OUT"),
                statusCode: StatusCodes.Status423Locked);
        }

        if (DateTime.UtcNow > invite.ExpiresAtUtc)
        {
            return Results.Json(
                ApiResponse<GuestTeleconsultStatusResponse>.Fail("This teleconsultation link has expired.", [], "GUEST_INVITE_EXPIRED"),
                statusCode: StatusCodes.Status410Gone);
        }

        var response = new GuestTeleconsultStatusResponse(
            Status: "Active",
            IsEnded: false,
            IsExpired: false,
            IsLockedOut: false,
            ExpiresAtUtc: invite.ExpiresAtUtc,
            ClinicName: invite.ClinicName,
            ClinicSupportPhone: invite.ClinicSupportPhone,
            ClinicianName: invite.ClinicianName,
            ScheduledAtUtc: invite.ScheduledAtUtc);

        return Results.Ok(ApiResponse<GuestTeleconsultStatusResponse>.Success(response));
    }

    public static async Task<IResult> HandleAsync(
        [FromBody] GuestTeleconsultVerifyRequest request,
        IGuestVerificationService verificationService,
        ILogger<PublicGuestTeleconsultEndpoints> logger,
        CancellationToken ct)
    {
        if (request is null)
        {
            var res = new GuestTeleconsultVerifyResponse(false, null, null, null, null, 0, "Request payload is required.", "EMPTY_REQUEST");
            return Results.BadRequest(ApiResponse<GuestTeleconsultVerifyResponse>.Fail("Request payload is required.", [], "EMPTY_REQUEST"));
        }

        var result = await verificationService.VerifyGuestAsync(
            request.InviteToken,
            request.DateOfBirth,
            request.Otp,
            ct);

        if (result.Success)
        {
            var response = new GuestTeleconsultVerifyResponse(
                Success: true,
                CallId: result.CallId,
                RoomName: result.RoomName,
                RelayUrl: result.RelayUrl,
                GuestToken: result.GuestToken,
                RemainingAttempts: result.RemainingAttempts,
                Message: "Verification successful.",
                ErrorCode: null,
                GuestDisplayName: result.GuestDisplayName,
                ClinicName: result.ClinicName,
                ClinicSupportPhone: result.ClinicSupportPhone,
                ClinicianName: result.ClinicianName,
                ScheduledAtUtc: result.ScheduledAtUtc);

            return Results.Ok(ApiResponse<GuestTeleconsultVerifyResponse>.Success(response));
        }

        var failResponse = new GuestTeleconsultVerifyResponse(
            Success: false,
            CallId: result.CallId,
            RoomName: null,
            RelayUrl: null,
            GuestToken: null,
            RemainingAttempts: result.RemainingAttempts,
            Message: result.ErrorMessage,
            ErrorCode: result.ErrorCode);

        // Map error conditions to specific HTTP status codes per specification
        if (result.ErrorCode == "GUEST_CONSULTATION_ENDED")
        {
            return Results.Json(
                ApiResponse<GuestTeleconsultVerifyResponse>.Fail(result.ErrorMessage ?? "Consultation ended.", [], "GUEST_CONSULTATION_ENDED"),
                statusCode: StatusCodes.Status410Gone);
        }

        if (result.IsLockedOut || result.ErrorCode == "GUEST_INVITE_LOCKED_OUT")
        {
            return Results.Json(
                ApiResponse<GuestTeleconsultVerifyResponse>.Fail(result.ErrorMessage ?? "Invite locked out.", [], "GUEST_INVITE_LOCKED_OUT"),
                statusCode: StatusCodes.Status423Locked);
        }

        if (result.IsExpired || result.ErrorCode == "GUEST_INVITE_EXPIRED")
        {
            return Results.Json(
                ApiResponse<GuestTeleconsultVerifyResponse>.Fail(result.ErrorMessage ?? "Invite expired.", [], "GUEST_INVITE_EXPIRED"),
                statusCode: StatusCodes.Status410Gone);
        }

        if (result.ErrorCode == "INVALID_FORMAT" || result.ErrorCode == "INVALID_TOKEN" || result.ErrorCode == "DOCUMENT_KIND_MISMATCH")
        {
            return Results.BadRequest(
                ApiResponse<GuestTeleconsultVerifyResponse>.Fail(result.ErrorMessage ?? "Invalid format.", [], result.ErrorCode));
        }

        // Default to 401 Unauthorized for invalid credentials with remaining attempts
        return Results.Json(
            ApiResponse<GuestTeleconsultVerifyResponse>.Fail(result.ErrorMessage ?? "Unauthorized.", [], result.ErrorCode ?? "UNAUTHORIZED"),
            statusCode: StatusCodes.Status401Unauthorized);
    }
}
