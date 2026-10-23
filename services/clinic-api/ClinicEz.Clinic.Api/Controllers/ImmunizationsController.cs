using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Immunizations.Commands;
using ClinicEz.Clinic.Application.Features.Immunizations.DTOs;
using ClinicEz.Clinic.Application.Features.Immunizations.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/patients/{patientId:guid}/immunizations")]
public sealed class ImmunizationsController : ControllerBase
{
    private readonly ISender _sender;

    public ImmunizationsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PatientImmunizationDto>>>> GetPatientImmunizations(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientImmunizationsQuery(patientId), ct);
        return Ok(ApiResponse<IReadOnlyList<PatientImmunizationDto>>.Success(result));
    }

    [HttpPost("administer")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientImmunizationDto>>> AdministerVaccine(
        Guid patientId,
        [FromBody] AdministerVaccineRequest request,
        CancellationToken ct)
    {
        var command = new AdministerVaccineCommand(
            PatientId: patientId,
            ConsultationEncounterId: request.ConsultationEncounterId,
            PhilHealthLibrary: request.PhilHealthLibrary,
            PhilHealthCode: request.PhilHealthCode,
            VaccineName: request.VaccineName,
            BrandName: request.BrandName,
            Manufacturer: request.Manufacturer,
            LotBatchNumber: request.LotBatchNumber,
            ExpirationDate: request.ExpirationDate,
            DoseSequence: request.DoseSequence,
            IsSeriesCompleted: request.IsSeriesCompleted,
            Route: request.Route,
            InjectionSite: request.InjectionSite,
            AdministeredAtUtc: request.AdministeredAtUtc,
            AdministeredByStaffId: request.AdministeredByStaffId ?? Guid.Empty,
            AdministeredByStaffName: request.AdministeredByStaffName,
            AdministeredByPrcLicense: request.AdministeredByPrcLicense,
            Remarks: request.Remarks,
            QueueItemId: request.QueueItemId,
            CompleteVisit: request.CompleteVisit);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientImmunizationDto>.Success(result, "Vaccine administered successfully."));
    }

    [HttpPost("historical")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientImmunizationDto>>> RecordHistoricalImmunization(
        Guid patientId,
        [FromBody] RecordHistoricalImmunizationRequest request,
        CancellationToken ct)
    {
        var command = new RecordHistoricalImmunizationCommand(
            PatientId: patientId,
            PhilHealthLibrary: request.PhilHealthLibrary,
            PhilHealthCode: request.PhilHealthCode,
            VaccineName: request.VaccineName,
            AdministeredDate: request.AdministeredDate,
            DoseSequence: request.DoseSequence,
            IsSeriesCompleted: request.IsSeriesCompleted,
            LotBatchNumber: request.LotBatchNumber,
            HistoricalFacilityName: request.HistoricalFacilityName,
            Route: request.Route,
            InjectionSite: request.InjectionSite,
            Remarks: request.Remarks);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientImmunizationDto>.Success(result, "Historical immunization recorded successfully."));
    }

    [HttpPost("{immunizationId:guid}/aefi")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientImmunizationDto>>> RecordAefi(
        Guid patientId,
        Guid immunizationId,
        [FromBody] RecordAefiRequest request,
        CancellationToken ct)
    {
        var command = new RecordImmunizationAefiCommand(
            PatientId: patientId,
            ImmunizationId: immunizationId,
            AdverseReactionSeverity: request.AdverseReactionSeverity,
            AdverseReactionRemarks: request.AdverseReactionRemarks,
            RecordedAtUtc: request.RecordedAtUtc);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientImmunizationDto>.Success(result, "AEFI adverse event recorded successfully."));
    }
}

public sealed record AdministerVaccineRequest(
    Guid? ConsultationEncounterId,
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    string? BrandName,
    string? Manufacturer,
    string LotBatchNumber,
    DateOnly ExpirationDate,
    int DoseSequence,
    bool IsSeriesCompleted,
    string Route,
    string InjectionSite,
    DateTime AdministeredAtUtc,
    Guid? AdministeredByStaffId,
    string AdministeredByStaffName,
    string? AdministeredByPrcLicense,
    string? Remarks,
    Guid? QueueItemId = null,
    bool CompleteVisit = false
);

public sealed record RecordHistoricalImmunizationRequest(
    string PhilHealthLibrary,
    string PhilHealthCode,
    string VaccineName,
    DateOnly AdministeredDate,
    int DoseSequence,
    bool IsSeriesCompleted,
    string? LotBatchNumber,
    string? HistoricalFacilityName,
    string? Route,
    string? InjectionSite,
    string? Remarks
);

public sealed record RecordAefiRequest(
    string AdverseReactionSeverity,
    string AdverseReactionRemarks,
    DateTime RecordedAtUtc
);
