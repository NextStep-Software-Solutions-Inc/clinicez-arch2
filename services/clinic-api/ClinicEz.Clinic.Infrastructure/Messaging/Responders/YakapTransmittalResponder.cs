using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Text.Json;
using System.Web;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging.Responders;

/// <summary>
/// Handles <c>yakap.transmittal.requested</c> messages arriving over the Interop Hub from <c>Party.Portal</c>.
/// Runs in-process against the clinic's MediatR queries and services within the addressed clinic scope,
/// returning <c>yakap.transmittal.responded</c> with the ApiResponse payload.
/// Note: Legacy XML batch transmittals are deprecated in favor of YAKAP 2.0 direct submissions.
/// </summary>
public sealed class YakapTransmittalResponder : IInteropResponder<YakapTransmittalRequestedPayload, YakapTransmittalRespondedPayload>
{
    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        .UseStrictStringEnums();

    private readonly ISender _sender;
    private readonly IPhilHealthProxyClient _proxyClient;
    private readonly ClinicRecipientResolver _recipient;
    private readonly IClinicScopeSetter _scope;
    private readonly IPhilHealthMasterlistSyncService? _syncService;
    private readonly ILogger<YakapTransmittalResponder> _logger;

    public YakapTransmittalResponder(
        ISender sender,
        IPhilHealthProxyClient proxyClient,
        ClinicRecipientResolver recipient,
        IClinicScopeSetter scope,
        ILogger<YakapTransmittalResponder> logger,
        IPhilHealthMasterlistSyncService? syncService = null)
    {
        _sender = sender;
        _proxyClient = proxyClient;
        _recipient = recipient;
        _scope = scope;
        _logger = logger;
        _syncService = syncService;
    }

    public async Task<YakapTransmittalRespondedPayload> RespondAsync(
        YakapTransmittalRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        var from = context.From;
        // Verify sender: Only the control plane (Party.Portal) or trusted platform services are authorized
        if (from.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning(
                "[YakapTransmittalResponder] Refusing request {MessageId}: sender {From} is not a control plane party.",
                context.MessageId, from.Address);
            return Fail(403, "FORBIDDEN", "Forbidden: only the portal control plane may query YAKAP transmittals.");
        }

        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null)
        {
            _logger.LogWarning(
                "[YakapTransmittalResponder] Refusing request {MessageId}: addressed facility {To} is not a hosted clinic.",
                context.MessageId, context.To.Address);
            return Fail(404, "NOT_FOUND", "The requested clinic facility was not found on this server.");
        }

        var queryParams = HttpUtility.ParseQueryString(request.Query ?? string.Empty);
        Guid? branchId = Guid.TryParse(queryParams["branchId"], out var bId) ? bId : null;

        // Enter ambient clinic scope for the duration of this request
        _scope.Enter(clinic.TenantId, clinic.ClinicId, branchId);

        var method = (request.Method ?? "GET").Trim().ToUpperInvariant();
        var rawPath = (request.Path ?? string.Empty).Trim('/');

        // Strip optional prefix "api/v1/yakap/" or "yakap/" if passed by caller
        if (rawPath.StartsWith("api/v1/yakap/", StringComparison.OrdinalIgnoreCase))
            rawPath = rawPath[13..];
        else if (rawPath.StartsWith("yakap/", StringComparison.OrdinalIgnoreCase))
            rawPath = rawPath[6..];

        try
        {
            return (method, rawPath) switch
            {
                ("GET", "encounters/eligible") => await HandleGetEligibleEncountersAsync(queryParams, branchId, ct),
                ("GET", "transmittals") => HandleDeprecatedGetTransmittals(),
                ("GET", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase) &&
                               (rawPath.EndsWith("/xml", StringComparison.OrdinalIgnoreCase) || rawPath.EndsWith("/raw-xml", StringComparison.OrdinalIgnoreCase))
                    => Fail(410, "GONE", "Legacy XML batch transmittal documents are obsolete in YAKAP 2.0."),
                ("GET", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase)
                    => Fail(410, "GONE", "Legacy XML batch transmittals are obsolete in YAKAP 2.0."),
                ("POST", "transmittals") => Fail(410, "GONE", "Legacy XML batch transmittal creation is obsolete in YAKAP 2.0."),
                ("POST", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase) && rawPath.EndsWith("/validate", StringComparison.OrdinalIgnoreCase)
                    => Fail(410, "GONE", "Legacy XML batch transmittal validation is obsolete in YAKAP 2.0."),
                ("POST", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase) && rawPath.EndsWith("/submit", StringComparison.OrdinalIgnoreCase)
                    => Fail(410, "GONE", "Legacy XML batch transmittal submission is obsolete in YAKAP 2.0."),
                ("GET", _) when rawPath.StartsWith("pin/", StringComparison.OrdinalIgnoreCase) && rawPath.EndsWith("/validate", StringComparison.OrdinalIgnoreCase)
                    => await HandleValidatePinAsync(rawPath, ct),
                ("POST", "masterlist/extract") => await HandleExtractMasterlistAsync(request.Body, clinic.TenantId, clinic.ClinicId, ct),
                _ => Fail(404, "NOT_FOUND", $"Unknown YAKAP operation: {method} {request.Path}")
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[YakapTransmittalResponder] Error handling YAKAP operation {Method} {Path}", method, rawPath);
            return Fail(500, "INTERNAL_ERROR", $"Internal error processing YAKAP operation: {ex.Message}");
        }
    }

    private async Task<YakapTransmittalRespondedPayload> HandleGetEligibleEncountersAsync(
        NameValueCollection query,
        Guid? branchId,
        CancellationToken ct)
    {
        var reportTagging = query["reportTagging"] ?? "2";
        DateTime? startDate = DateTime.TryParse(query["startDate"], out var sDate) ? sDate : null;
        DateTime? endDate = DateTime.TryParse(query["endDate"], out var eDate) ? eDate : null;
        Guid? patientId = Guid.TryParse(query["patientId"], out var pId) ? pId : null;

        var result = await _sender.Send(new GetEligibleYakapEncountersQuery(reportTagging, startDate, endDate, patientId, branchId), ct);
        return Success(result);
    }

    private static YakapTransmittalRespondedPayload HandleDeprecatedGetTransmittals()
    {
        var emptyList = ApiResponse<IReadOnlyList<object>>.Success(Array.Empty<object>());
        return Success(emptyList);
    }

    private async Task<YakapTransmittalRespondedPayload> HandleValidatePinAsync(string path, CancellationToken ct)
    {
        var parts = path.Split('/');
        if (parts.Length < 3 || string.IsNullOrWhiteSpace(parts[1]))
        {
            return Fail(400, "INVALID_PIN", "PIN is required");
        }

        var result = await _proxyClient.ValidatePinAsync(parts[1], ct);
        return Success(result);
    }

    private async Task<YakapTransmittalRespondedPayload> HandleExtractMasterlistAsync(
        string? body,
        string tenantId,
        Guid? clinicId,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return Fail(400, "INVALID_BODY", "Request body is required.");
        }

        var req = JsonSerializer.Deserialize<ExtractMasterlistProxyRequest>(body, JsonOptions);
        if (req == null)
        {
            return Fail(400, "INVALID_BODY", "Malformed masterlist extract payload.");
        }

        var result = await _proxyClient.ExtractMasterlistAsync(req, ct);
        if (!result.Succeeded || result.Data == null)
        {
            return Fail(400, "EXTRACT_FAILED", result.Message ?? "Failed to extract masterlist");
        }

        if (_syncService != null)
        {
            await _syncService.SyncProxyResponseAsync(tenantId, clinicId, result.Data, ct);
        }

        return Success(result);
    }

    private static YakapTransmittalRespondedPayload Success<T>(ApiResponse<T> result, int statusCode = 200)
    {
        return new YakapTransmittalRespondedPayload
        {
            StatusCode = statusCode,
            ContentType = "application/json",
            Body = JsonSerializer.Serialize(result, JsonOptions)
        };
    }

    private static YakapTransmittalRespondedPayload Fail(int statusCode, string code, string message)
    {
        var body = ApiResponse<object>.Fail(message, [new ApiFieldError("Yakap", code, message)]);
        return new YakapTransmittalRespondedPayload
        {
            StatusCode = statusCode,
            ContentType = "application/json",
            Body = JsonSerializer.Serialize(body, JsonOptions)
        };
    }
}
