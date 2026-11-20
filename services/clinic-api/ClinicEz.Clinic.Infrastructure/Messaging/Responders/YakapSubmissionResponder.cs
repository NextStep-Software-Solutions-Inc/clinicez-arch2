using System;
using System.Collections.Generic;
using System.Collections.Specialized;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.Web;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Yakap.Commands;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Queries.GetEligibleYakapEncounters;
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
/// Handles <c>yakap.submission.requested</c> messages arriving over the Interop Hub from <c>Party.Portal</c>.
/// Runs in-process against the clinic's YAKAP 2.0 MediatR queries and commands within the addressed clinic scope,
/// returning <c>yakap.submission.responded</c> with a strictly Zero-PHI <see cref="ApiResponse{T}"/> payload.
/// </summary>
public sealed class YakapSubmissionResponder : IInteropResponder<YakapSubmissionRequestedPayload, YakapSubmissionRespondedPayload>
{
    private static readonly JsonSerializerOptions JsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web)
        .UseStrictStringEnums();

    private readonly ISender _sender;
    private readonly ClinicRecipientResolver _recipient;
    private readonly IClinicScopeSetter _scope;
    private readonly ILogger<YakapSubmissionResponder> _logger;

    public YakapSubmissionResponder(
        ISender sender,
        ClinicRecipientResolver recipient,
        IClinicScopeSetter scope,
        ILogger<YakapSubmissionResponder> logger)
    {
        _sender = sender;
        _recipient = recipient;
        _scope = scope;
        _logger = logger;
    }

    public async Task<YakapSubmissionRespondedPayload> RespondAsync(
        YakapSubmissionRequestedPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        var from = context.From;
        if (from.Kind != PartyKind.ControlPlane)
        {
            _logger.LogWarning(
                "[YakapSubmissionResponder] Refusing request {MessageId}: sender {From} is not a control plane party.",
                context.MessageId, from.Address);
            return Fail(403, "FORBIDDEN", "Forbidden: only the portal control plane may query YAKAP telemetry.");
        }

        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null)
        {
            _logger.LogWarning(
                "[YakapSubmissionResponder] Refusing request {MessageId}: addressed facility {To} is not a hosted clinic.",
                context.MessageId, context.To.Address);
            return Fail(404, "NOT_FOUND", "The requested clinic facility was not found on this server.");
        }

        var queryParams = HttpUtility.ParseQueryString(request.Query ?? string.Empty);
        Guid? branchId = Guid.TryParse(queryParams["branchId"], out var bId) ? bId : null;

        _scope.Enter(clinic.TenantId, clinic.ClinicId, branchId);

        var method = (request.Method ?? "GET").Trim().ToUpperInvariant();
        var rawPath = (request.Path ?? string.Empty).Trim('/');

        if (rawPath.StartsWith("api/v1/yakap/", StringComparison.OrdinalIgnoreCase))
            rawPath = rawPath[13..];
        else if (rawPath.StartsWith("yakap/", StringComparison.OrdinalIgnoreCase))
            rawPath = rawPath[6..];

        var segments = rawPath.Split('/', StringSplitOptions.RemoveEmptyEntries);

        try
        {
            return (method, rawPath, segments.Length) switch
            {
                ("GET", "encounters/eligible", _) => await HandleGetEligibleEncountersAsync(queryParams, branchId, ct),
                ("GET", "submissions/summary", _) => await HandleGetSubmissionsSummaryAsync(branchId, ct),
                ("GET", "submissions", _) => await HandleGetSubmissionsAsync(queryParams, branchId, ct),
                ("GET", _, 2) when segments[0].Equals("submissions", StringComparison.OrdinalIgnoreCase) && Guid.TryParse(segments[1], out var getSubId)
                    => await HandleGetSubmissionByIdAsync(getSubId, branchId, ct),
                ("POST", _, 3) when segments[0].Equals("submissions", StringComparison.OrdinalIgnoreCase)
                                    && segments[2].Equals("poll", StringComparison.OrdinalIgnoreCase)
                                    && Guid.TryParse(segments[1], out var pollSubId)
                    => await HandlePollSubmissionAsync(pollSubId, branchId, ct),
                ("POST", _, 3) when segments[0].Equals("submissions", StringComparison.OrdinalIgnoreCase)
                                    && segments[2].Equals("retry", StringComparison.OrdinalIgnoreCase)
                                    && Guid.TryParse(segments[1], out var retrySubId)
                    => await HandleRetrySubmissionAsync(retrySubId, branchId, ct),
                ("POST", "masterlist/sync", _) => await HandleSyncMasterlistAsync(request.Body, branchId, ct),
                _ => Fail(404, "NOT_FOUND", $"Unknown YAKAP 2.0 telemetry operation: {method} {request.Path}")
            };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[YakapSubmissionResponder] Error handling YAKAP operation {Method} {Path}", method, rawPath);
            return Fail(500, "INTERNAL_ERROR", $"Unable to process PhilHealth telemetry request: {ex.Message}");
        }
    }

    private async Task<YakapSubmissionRespondedPayload> HandleGetEligibleEncountersAsync(
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

    private async Task<YakapSubmissionRespondedPayload> HandleGetSubmissionsSummaryAsync(Guid? branchId, CancellationToken ct)
    {
        var summary = await _sender.Send(new GetYakapSubmissionsSummaryQuery(branchId), ct);
        return Success(ApiResponse<PortalYakapBranchSummaryDto>.Success(summary));
    }

    private async Task<YakapSubmissionRespondedPayload> HandleGetSubmissionsAsync(
        NameValueCollection query,
        Guid? branchId,
        CancellationToken ct)
    {
        var status = query["status"];
        var submissionType = query["submissionType"];
        var page = int.TryParse(query["page"], out var p) ? p : 1;
        var pageSize = int.TryParse(query["pageSize"], out var ps) ? ps : 50;

        var list = await _sender.Send(new GetYakapSubmissionsQuery(status, submissionType, page, pageSize, branchId), ct);
        return Success(ApiResponse<IReadOnlyList<PortalYakapSubmissionDto>>.Success(list));
    }

    private async Task<YakapSubmissionRespondedPayload> HandleGetSubmissionByIdAsync(Guid id, Guid? branchId, CancellationToken ct)
    {
        var item = await _sender.Send(new GetYakapSubmissionByIdQuery(id, branchId), ct);
        return Success(ApiResponse<PortalYakapSubmissionDto>.Success(item));
    }

    private async Task<YakapSubmissionRespondedPayload> HandlePollSubmissionAsync(Guid id, Guid? branchId, CancellationToken ct)
    {
        var item = await _sender.Send(new PollYakapSubmissionStatusCommand(id, branchId), ct);
        return Success(ApiResponse<PortalYakapSubmissionDto>.Success(item));
    }

    private async Task<YakapSubmissionRespondedPayload> HandleRetrySubmissionAsync(Guid id, Guid? branchId, CancellationToken ct)
    {
        var item = await _sender.Send(new RetryYakapSubmissionCommand(id, branchId), ct);
        return Success(ApiResponse<PortalYakapSubmissionDto>.Success(item));
    }

    private async Task<YakapSubmissionRespondedPayload> HandleSyncMasterlistAsync(string? body, Guid? branchId, CancellationToken ct)
    {
        SyncYakapMasterlistCommand cmd = new(BranchId: branchId);
        if (!string.IsNullOrWhiteSpace(body))
        {
            var parsed = JsonSerializer.Deserialize<SyncYakapMasterlistCommand>(body, JsonOptions);
            if (parsed != null)
            {
                cmd = parsed with { BranchId = parsed.BranchId ?? branchId };
            }
        }

        var res = await _sender.Send(cmd, ct);
        return Success(ApiResponse<PortalYakapMasterlistSyncResultDto>.Success(res));
    }

    private static YakapSubmissionRespondedPayload Success<T>(ApiResponse<T> result, int statusCode = 200)
    {
        return new YakapSubmissionRespondedPayload
        {
            StatusCode = statusCode,
            ContentType = "application/json",
            Body = JsonSerializer.Serialize(result, JsonOptions)
        };
    }

    private static YakapSubmissionRespondedPayload Fail(int statusCode, string code, string message)
    {
        var body = ApiResponse<object>.Fail(message, [new ApiFieldError("Yakap", code, message)]);
        return new YakapSubmissionRespondedPayload
        {
            StatusCode = statusCode,
            ContentType = "application/json",
            Body = JsonSerializer.Serialize(body, JsonOptions)
        };
    }
}
