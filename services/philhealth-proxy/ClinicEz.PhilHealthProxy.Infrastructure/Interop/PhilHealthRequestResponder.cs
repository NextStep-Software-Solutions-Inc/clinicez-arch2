using System;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.PhilHealthProxy.Application.Features.AvailmentSlip.Queries;
using ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.DataUpload.Queries;
using ClinicEz.PhilHealthProxy.Application.Features.Empanelment.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.Masterlist.Queries;
using ClinicEz.PhilHealthProxy.Application.Features.Pcu.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.Sandbox;
using ClinicEz.PhilHealthProxy.Application.Features.Selection.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Commands;
using ClinicEz.PhilHealthProxy.Application.Features.Tenants.Queries;
using ClinicEz.PhilHealthProxy.Application.Features.Validator.Queries;
using ClinicEz.PhilHealthProxy.Application.Features.VerificationCode.Commands;
using ClinicEz.PhilHealthProxy.Domain.Exceptions;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Interoperability;
using MediatR;
using Microsoft.Extensions.Logging;

namespace ClinicEz.PhilHealthProxy.Infrastructure.Interop;

public sealed class PhilHealthRequestResponder(
    IMediator mediator,
    CurrentTenantService currentTenantService,
    ILogger<PhilHealthRequestResponder> logger)
    : IInteropResponder<PhilHealthRequestPayload, PhilHealthResponsePayload>
{
    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = null
    };

    public async Task<PhilHealthResponsePayload> RespondAsync(
        PhilHealthRequestPayload request,
        InteropMessageContext context,
        CancellationToken ct)
    {
        // 1. Strict Tenant & Facility resolution from verified context.From
        if (!Guid.TryParse(context.From.TenantId, out var tenantId) || tenantId == Guid.Empty)
        {
            logger.LogWarning("[PhilHealthResponder] Rejected envelope with invalid sender TenantId: {From}", context.From);
            return Error(401, "Invalid or unverified sender TenantId.");
        }

        Guid? branchId = null;
        if (!string.IsNullOrEmpty(context.From.FacilityId) && Guid.TryParse(context.From.FacilityId, out var parsedBranch))
        {
            branchId = parsedBranch;
        }

        currentTenantService.SetTenantId(tenantId);
        if (branchId.HasValue)
        {
            currentTenantService.SetBranchId(branchId.Value);
        }

        logger.LogInformation("[PhilHealthResponder] Dispatching Operation '{Op}' for Tenant {T}, Branch {B}",
            request.Operation, tenantId, branchId);

        try
        {
            return request.Operation switch
            {
                // Service 01: PCU
                PhilHealthOperations.PcuStart =>
                    await HandleAsync(Deserialize<PcuStartRequest>(request.Body), req => mediator.Send(new StartPcuCommand(req), ct)),

                PhilHealthOperations.PcuVerify =>
                    await HandleAsync(Deserialize<PcuVerifyRequest>(request.Body), req => mediator.Send(new VerifyPcuCommand(req), ct)),

                // Service 02: Primary Care Validator
                PhilHealthOperations.YakapValidateStanding =>
                    await HandleAsync(
                        !string.IsNullOrWhiteSpace(request.Body)
                            ? Deserialize<YakapValidateStandingRequest>(request.Body)
                            : new YakapValidateStandingRequest(request.Argument ?? string.Empty, DateTime.UtcNow.Year.ToString(), true),
                        req => mediator.Send(new ValidateYakapStandingQuery(req), ct)),

                // Service 03: YAKAP Empanelment
                PhilHealthOperations.YakapEmpanel =>
                    await HandleAsync(Deserialize<YakapEmpanelmentRequest>(request.Body), req => mediator.Send(new SubmitEmpanelmentCommand(req), ct)),

                // Service 04: YAKAP Selection
                PhilHealthOperations.YakapSelect =>
                    await HandleAsync(Deserialize<YakapSelectionRequest>(request.Body), req => mediator.Send(new SubmitSelectionCommand(req), ct)),

                // Service 05: Masterlist
                PhilHealthOperations.MasterlistDownloadIndividual =>
                    await HandleAsync(Deserialize<MasterlistIndividualRequest>(request.Body), req => mediator.Send(new DownloadIndividualMasterlistQuery(req), ct)),

                PhilHealthOperations.MasterlistDownloadBatch =>
                    await HandleAsync(Deserialize<MasterlistBatchRequest>(request.Body), req => mediator.Send(new DownloadBatchMasterlistQuery(req), ct)),

                // Service 06: Data Upload (accepts either Annex C encrypted envelope OR raw wire JSON encrypted at proxy boundary)
                PhilHealthOperations.DataUploadFpe =>
                    await HandleDataUploadAsync("fpe", request.Body, ct),

                PhilHealthOperations.DataUploadConsultation =>
                    await HandleDataUploadAsync("consultation", request.Body, ct),

                PhilHealthOperations.DataUploadDiagnosticRequest =>
                    await HandleDataUploadAsync("diagnostic-request", request.Body, ct),

                PhilHealthOperations.DataUploadDiagnosticResults =>
                    await HandleDataUploadAsync("diagnostic-results", request.Body, ct),

                PhilHealthOperations.DataUploadMedicine =>
                    await HandleDataUploadAsync("medicine", request.Body, ct),

                PhilHealthOperations.DataUploadReferral =>
                    await HandleDataUploadAsync("referral", request.Body, ct),

                PhilHealthOperations.DataUploadGetStatus =>
                    await HandleAsync(
                        request.Argument ?? request.Body ?? string.Empty,
                        txNo => mediator.Send(new GetUploadStatusQuery(txNo.Trim('"')), ct)),

                // Service 07: Verification Code (OTP)
                PhilHealthOperations.GeneratePatientOtp =>
                    await HandleAsync(Deserialize<VerificationCodeRequest>(request.Body), req => mediator.Send(new ValidateVerificationCodeCommand(req), ct)),

                // Service 08: Electronic Konsulta Availment Slip (decrypted at proxy boundary -> AvailmentSlipResponse)
                PhilHealthOperations.GenerateAvailmentSlip =>
                    await HandleAsync(Deserialize<AvailmentSlipRequest>(request.Body), req => mediator.Send(new GenerateDecryptedAvailmentSlipQuery(req), ct)),

                // Tenant Configuration & Status
                PhilHealthOperations.TenantConfigure =>
                    await HandleAsync(Deserialize<ConfigureTenantCredentialsRequest>(request.Body), req => mediator.Send(new ConfigureTenantCredentialsCommand(req), ct)),

                PhilHealthOperations.TenantStatus =>
                    await HandleAsync(tenantId, tid => mediator.Send(new GetTenantStatusQuery(tid, branchId), ct)),

                PhilHealthOperations.TenantTestConnection =>
                    await HandleAsync(tenantId, tid => mediator.Send(new TestTenantConnectionCommand(tid, branchId), ct)),

                // Sandbox Controls
                PhilHealthOperations.PcapiSandboxStatus =>
                    await HandleAsync(new object(), _ => mediator.Send(new GetSandboxStatusQuery(), ct)),

                PhilHealthOperations.PcapiSandboxScenario =>
                    await HandleAsync(Deserialize<SetSandboxScenarioRequest>(request.Body), req => mediator.Send(new SetSandboxScenarioCommand(req.Scenario), ct)),

                PhilHealthOperations.PcapiSandboxReset =>
                    await HandleAsync(new object(), _ => mediator.Send(new ResetSandboxCommand(), ct)),

                _ => Error(400, $"Unknown or unsupported PhilHealth operation '{request.Operation}'.")
            };
        }
        catch (FluentValidation.ValidationException vex)
        {
            logger.LogWarning(vex, "[PhilHealthResponder] Validation failure on Operation '{Op}'", request.Operation);
            return Error(422, string.Join("; ", vex.Errors.Select(e => e.ErrorMessage)));
        }
        catch (KeyNotFoundException knf)
        {
            logger.LogWarning(knf, "[PhilHealthResponder] Not found on Operation '{Op}'", request.Operation);
            return Error(404, knf.Message);
        }
        catch (UnauthorizedAccessException uex)
        {
            logger.LogWarning(uex, "[PhilHealthResponder] Unauthorized on Operation '{Op}'", request.Operation);
            return Error(401, uex.Message);
        }
        catch (TimeoutException tex)
        {
            logger.LogWarning(tex, "[PhilHealthResponder] Timeout on Operation '{Op}'", request.Operation);
            return Error(504, tex.Message);
        }
        catch (PhilHealthGatewayException gex)
        {
            logger.LogWarning(gex, "[PhilHealthResponder] Gateway failure ({Code}/{ErrorCode}) on Operation '{Op}'", gex.StatusCode, gex.ErrorCode, request.Operation);
            return Error(gex.StatusCode, gex.Message, gex.ErrorCode);
        }
        catch (System.Net.Http.HttpRequestException hex)
        {
            var code = hex.StatusCode.HasValue ? (int)hex.StatusCode.Value : 502;
            logger.LogWarning(hex, "[PhilHealthResponder] Upstream HTTP {Code} on Operation '{Op}'", code, request.Operation);
            return Error(code, hex.Message);
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "[PhilHealthResponder] Exception handling Operation '{Op}'", request.Operation);
            return Error(500, ex.Message);
        }
    }

    private async Task<PhilHealthResponsePayload> HandleDataUploadAsync(
        string form,
        string? body,
        CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(body))
        {
            throw new ArgumentException("Request body cannot be empty for data upload.");
        }

        using var doc = JsonDocument.Parse(body);
        var root = doc.RootElement;
        if (root.ValueKind == JsonValueKind.Object
            && TryHasPropertyCaseInsensitive(root, "docMimeType")
            && TryHasPropertyCaseInsensitive(root, "doc"))
        {
            var envelope = Deserialize<PhilHealthEncryptedPayload>(body);
            return await HandleAsync(envelope, env => mediator.Send(new UploadDataCommand(form, env), ct));
        }

        return await HandleAsync(body, plainJson => mediator.Send(new UploadPlainJsonDataCommand(form, plainJson), ct));
    }

    private static bool TryHasPropertyCaseInsensitive(JsonElement element, string name)
    {
        foreach (var prop in element.EnumerateObject())
        {
            if (string.Equals(prop.Name, name, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
        }

        return false;
    }

    private static T Deserialize<T>(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            throw new ArgumentException("Request body cannot be empty for this operation.");
        return JsonSerializer.Deserialize<T>(json, JsonOpts)
            ?? throw new ArgumentException("Failed to deserialize request body.");
    }

    private static async Task<PhilHealthResponsePayload> HandleAsync<TReq, TRes>(
        TReq request,
        Func<TReq, Task<TRes>> execute)
    {
        var result = await execute(request);
        return new PhilHealthResponsePayload
        {
            StatusCode = 200,
            Body = JsonSerializer.Serialize(ApiResponse<TRes>.Success(result), JsonOpts)
        };
    }

    private static PhilHealthResponsePayload Error(int statusCode, string message, string? explicitErrorCode = null)
    {
        var errorCode = !string.IsNullOrWhiteSpace(explicitErrorCode)
            ? explicitErrorCode
            : statusCode switch
            {
                >= 500 => "UPSTREAM_SERVER_ERROR",
                429 => "RATE_LIMITED",
                404 => "PIN_NOT_FOUND",
                400 or 422 => "PIN_INVALID",
                401 => "UNAUTHORIZED",
                _ => $"HTTP_{statusCode}"
            };

        return new()
        {
            StatusCode = statusCode,
            Body = JsonSerializer.Serialize(ApiResponse<object>.Fail(message, errorCode), JsonOpts)
        };
    }
}
