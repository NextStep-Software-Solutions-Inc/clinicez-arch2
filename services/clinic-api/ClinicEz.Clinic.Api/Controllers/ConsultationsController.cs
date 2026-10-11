using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Consultations.Commands;
using ClinicEz.Clinic.Application.Features.Consultations.DTOs;
using ClinicEz.Clinic.Application.Features.Consultations.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/consultations")]
public sealed class ConsultationsController : ControllerBase
{
    private readonly ISender _sender;

    public ConsultationsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ConsultationEncounterDto>>>> GetConsultations(
        [FromQuery] Guid? patientId,
        [FromQuery] Guid? doctorId,
        [FromQuery] bool? isSigned,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetConsultationsQuery(patientId, doctorId, isSigned), ct);
        return Ok(ApiResponse<IReadOnlyList<ConsultationEncounterDto>>.Success(result));
    }

    [HttpGet("{id:guid}")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<ConsultationEncounterDto>>> GetConsultation(Guid id, CancellationToken ct)
    {
        var result = await _sender.Send(new GetConsultationByIdQuery(id), ct);
        return Ok(ApiResponse<ConsultationEncounterDto>.Success(result));
    }

    [HttpGet("{id:guid}/yakap-readiness")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<YakapClaimReadinessDto>>> ValidateYakapReadiness(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new ValidateConsultationYakapReadinessQuery(id), ct);
        return Ok(ApiResponse<YakapClaimReadinessDto>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.ConsultationsWrite)]
    public async Task<ActionResult<ApiResponse<ConsultationEncounterDto>>> CreateConsultation(
        [FromBody] CreateConsultationCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetConsultation), new { id = result.Id }, ApiResponse<ConsultationEncounterDto>.Success(result, "Consultation encounter drafted successfully."));
    }

    [HttpPut("{id:guid}")]
    [HasPermission(ClinicPermissions.ConsultationsWrite)]
    public async Task<ActionResult<ApiResponse<ConsultationEncounterDto>>> UpdateConsultation(
        Guid id,
        [FromBody] UpdateConsultationRequest request,
        CancellationToken ct)
    {
        var command = new UpdateConsultationCommand(
            id,
            request.Subjective,
            request.Objective,
            request.Assessment,
            request.Plan,
            request.Diagnoses,
            request.Prescriptions,
            request.IsYakapEligible,
            request.PhilHealthSignSympCode,
            request.PhilHealthOtherComplaint,
            request.PhilHealthPainSite,
            request.DoctorPhilHealthPan,
            request.PhilHealthAtc,
            request.HciCaseNo,
            request.HciTransNo,
            request.SoapTransNo,
            request.GeneralSurveyId,
            request.GeneralSurveyRemarks,
            request.PhysicalExamFindingsJson);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ConsultationEncounterDto>.Success(result, "Consultation updated successfully."));
    }

    [HttpPost("{id:guid}/sign")]
    [HasPermission(ClinicPermissions.ConsultationsSign)]
    public async Task<ActionResult<ApiResponse<ConsultationEncounterDto>>> SignConsultation(
        Guid id,
        [FromBody] SignConsultationRequest? request,
        CancellationToken ct)
    {
        var command = new SignConsultationCommand(
            id,
            request?.PrcLicenseNumber,
            request?.PtrNumber,
            request?.S2LicenseNumber,
            request?.TargetPharmacyFacilityId,
            request?.TargetPharmacyTenantId,
            request?.DoctorPhilHealthPan,
            request?.PhilHealthAtc);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ConsultationEncounterDto>.Success(result, "Consultation signed and locked successfully."));
    }
}

public sealed record UpdateConsultationRequest(
    string? Subjective,
    string? Objective,
    string? Assessment,
    string? Plan,
    List<DiagnosisInput>? Diagnoses,
    List<PrescriptionInput>? Prescriptions,
    bool? IsYakapEligible = null,
    string? PhilHealthSignSympCode = null,
    string? PhilHealthOtherComplaint = null,
    string? PhilHealthPainSite = null,
    string? DoctorPhilHealthPan = null,
    string? PhilHealthAtc = null,
    string? HciCaseNo = null,
    string? HciTransNo = null,
    string? SoapTransNo = null,
    string? GeneralSurveyId = null,
    string? GeneralSurveyRemarks = null,
    string? PhysicalExamFindingsJson = null);

public sealed record SignConsultationRequest(
    string? PrcLicenseNumber,
    string? PtrNumber,
    string? S2LicenseNumber,
    string? DoctorPhilHealthPan = null,
    string? PhilHealthAtc = null,
    string? TargetPharmacyFacilityId = null,
    string? TargetPharmacyTenantId = null);
