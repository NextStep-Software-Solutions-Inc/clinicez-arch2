using System;
using System.Collections.Specialized;
using System.Text.Json;
using System.Web;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.CreateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.SubmitYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.Commands.ValidateYakapTransmittal;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittalById;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittalRawXml;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetYakapTransmittals;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using ClinicEz.Clinic.Domain.Enums;
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
/// Runs in-process against the clinic's MediatR queries and commands within the addressed clinic scope,
/// returning <c>yakap.transmittal.responded</c> with the ApiResponse payload.
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
                ("GET", "transmittals") => await HandleGetTransmittalsAsync(queryParams, branchId, ct),
                ("GET", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase) &&
                               (rawPath.EndsWith("/xml", StringComparison.OrdinalIgnoreCase) || rawPath.EndsWith("/raw-xml", StringComparison.OrdinalIgnoreCase))
                    => await HandleGetRawXmlAsync(rawPath, ct),
                ("GET", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase)
                    => await HandleGetTransmittalByIdAsync(rawPath, ct),
                ("POST", "transmittals") => await HandleCreateTransmittalAsync(request.Body, branchId, ct),
                ("POST", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase) && rawPath.EndsWith("/validate", StringComparison.OrdinalIgnoreCase)
                    => await HandleValidateTransmittalAsync(rawPath, ct),
                ("POST", _) when rawPath.StartsWith("transmittals/", StringComparison.OrdinalIgnoreCase) && rawPath.EndsWith("/submit", StringComparison.OrdinalIgnoreCase)
                    => await HandleSubmitTransmittalAsync(rawPath, ct),
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

    private async Task<YakapTransmittalRespondedPayload> HandleGetTransmittalsAsync(
        NameValueCollection query,
        Guid? branchId,
        CancellationToken ct)
    {
        YakapTransmittalStatus? status = Enum.TryParse<YakapTransmittalStatus>(query["status"], true, out var st) ? st : null;
        var reportTagging = query["reportTagging"];

        var result = await _sender.Send(new GetYakapTransmittalsQuery(status, reportTagging, branchId), ct);
        return Success(result);
    }

    private async Task<YakapTransmittalRespondedPayload> HandleGetTransmittalByIdAsync(string path, CancellationToken ct)
    {
        var parts = path.Split('/');
        if (parts.Length < 2 || !Guid.TryParse(parts[1], out var id))
        {
            return Fail(400, "INVALID_ID", "Invalid transmittal ID format");
        }

        var result = await _sender.Send(new GetYakapTransmittalByIdQuery(id), ct);
        return result.Succeeded ? Success(result) : Fail(404, "NOT_FOUND", result.Message ?? "Transmittal not found");
    }

    private async Task<YakapTransmittalRespondedPayload> HandleGetRawXmlAsync(string path, CancellationToken ct)
    {
        var parts = path.Split('/');
        if (parts.Length < 3 || !Guid.TryParse(parts[1], out var id))
        {
            return Fail(400, "INVALID_ID", "Invalid transmittal ID format");
        }

        var result = await _sender.Send(new GetYakapTransmittalRawXmlQuery(id), ct);
        return result.Succeeded ? Success(result) : Fail(404, "NOT_FOUND", result.Message ?? "Transmittal XML not found");
    }

    private async Task<YakapTransmittalRespondedPayload> HandleCreateTransmittalAsync(string? body, Guid? branchId, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            return Fail(400, "INVALID_BODY", "Request body is required for creating a transmittal.");
        }

        var command = JsonSerializer.Deserialize<CreateYakapTransmittalCommand>(body, JsonOptions);
        if (command == null)
        {
            return Fail(400, "INVALID_BODY", "Malformed transmittal creation payload.");
        }

        if (branchId.HasValue && !command.BranchId.HasValue)
        {
            command = command with { BranchId = branchId };
        }

        var result = await _sender.Send(command, ct);
        return result.Succeeded ? Success(result, 201) : Fail(400, "BAD_REQUEST", result.Message ?? "Failed to create transmittal");
    }

    private async Task<YakapTransmittalRespondedPayload> HandleValidateTransmittalAsync(string path, CancellationToken ct)
    {
        var parts = path.Split('/');
        if (parts.Length < 3 || !Guid.TryParse(parts[1], out var id))
        {
            return Fail(400, "INVALID_ID", "Invalid transmittal ID format");
        }

        var result = await _sender.Send(new ValidateYakapTransmittalCommand(id), ct);
        return result.Succeeded ? Success(result) : Fail(400, "VALIDATION_FAILED", result.Message ?? "Validation failed");
    }

    private async Task<YakapTransmittalRespondedPayload> HandleSubmitTransmittalAsync(string path, CancellationToken ct)
    {
        var parts = path.Split('/');
        if (parts.Length < 3 || !Guid.TryParse(parts[1], out var id))
        {
            return Fail(400, "INVALID_ID", "Invalid transmittal ID format");
        }

        var result = await _sender.Send(new SubmitYakapTransmittalCommand(id), ct);
        return result.Succeeded ? Success(result) : Fail(400, "SUBMISSION_FAILED", result.Message ?? "Submission failed");
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
