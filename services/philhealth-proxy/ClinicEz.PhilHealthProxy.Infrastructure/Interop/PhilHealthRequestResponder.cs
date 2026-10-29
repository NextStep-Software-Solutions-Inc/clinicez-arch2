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

                // Service 06: Data Upload
                PhilHealthOperations.DataUploadFpe =>
                    await HandleAsync(Deserialize<PhilHealthEncryptedPayload>(request.Body), env => mediator.Send(new UploadDataCommand("fpe", env), ct)),

                PhilHealthOperations.DataUploadConsultation =>
                    await HandleAsync(Deserialize<PhilHealthEncryptedPayload>(request.Body), env => mediator.Send(new UploadDataCommand("consultation", env), ct)),

                PhilHealthOperations.DataUploadDiagnosticRequest =>
                    await HandleAsync(Deserialize<PhilHealthEncryptedPayload>(request.Body), env => mediator.Send(new UploadDataCommand("diagnostic-request", env), ct)),

                PhilHealthOperations.DataUploadDiagnosticResults =>
                    await HandleAsync(Deserialize<PhilHealthEncryptedPayload>(request.Body), env => mediator.Send(new UploadDataCommand("diagnostic-results", env), ct)),

                PhilHealthOperations.DataUploadMedicine =>
                    await HandleAsync(Deserialize<PhilHealthEncryptedPayload>(request.Body), env => mediator.Send(new UploadDataCommand("medicine", env), ct)),

                PhilHealthOperations.DataUploadReferral =>
                    await HandleAsync(Deserialize<PhilHealthEncryptedPayload>(request.Body), env => mediator.Send(new UploadDataCommand("referral", env), ct)),

                PhilHealthOperations.DataUploadGetStatus =>
                    await HandleAsync(
                        request.Argument ?? request.Body ?? string.Empty,
                        txNo => mediator.Send(new GetUploadStatusQuery(txNo.Trim('"')), ct)),

                // Service 07: Verification Code (OTP)
                PhilHealthOperations.GeneratePatientOtp =>
                    await HandleAsync(Deserialize<VerificationCodeRequest>(request.Body), req => mediator.Send(new ValidateVerificationCodeCommand(req), ct)),

                // Service 08: Electronic Konsulta Availment Slip
                PhilHealthOperations.GenerateAvailmentSlip =>
                    await HandleAsync(Deserialize<AvailmentSlipRequest>(request.Body), req => mediator.Send(new GenerateAvailmentSlipQuery(req), ct)),

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
        catch (Exception ex)
        {
            logger.LogError(ex, "[PhilHealthResponder] Exception handling Operation '{Op}'", request.Operation);
            return Error(500, ex.Message);
        }
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
            Body = JsonSerializer.Serialize(result, JsonOpts)
        };
    }

    private static PhilHealthResponsePayload Error(int statusCode, string message) => new()
    {
        StatusCode = statusCode,
        Body = JsonSerializer.Serialize(ApiResponse<string>.Fail(message), JsonOpts)
    };
}
