using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Problems.Commands;
using ClinicEz.Clinic.Application.Features.Problems.Dtos;
using ClinicEz.Clinic.Application.Features.Problems.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

public record CreateProblemRequest(
    Guid? ConsultationEncounterId,
    string Icd10Code,
    string ProblemTitle,
    string? PhilHealthMdiseaseCode = null,
    string Status = "Active",
    string Severity = "Moderate",
    bool IsChronicNcd = false,
    DateOnly? OnsetDate = null,
    string? ClinicalNotes = null,
    string? RecordedByDoctorName = null
);

public record UpdateProblemStatusRequest(
    string Status,
    DateOnly? ResolvedDate = null,
    string? ClinicalNotes = null
);

[ApiController]
[Route("api/v1/patients/{patientId:guid}/problems")]
public sealed class ProblemsController : ControllerBase
{
    private readonly ISender _sender;

    public ProblemsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PatientProblemDto>>>> GetPatientProblems(
        Guid patientId,
        [FromQuery] string? status,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientProblemsQuery(patientId, status), ct);
        return Ok(ApiResponse<IReadOnlyList<PatientProblemDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientProblemDto>>> CreateProblem(
        Guid patientId,
        [FromBody] CreateProblemRequest request,
        CancellationToken ct)
    {
        var command = new CreatePatientProblemCommand(
            PatientId: patientId,
            ConsultationEncounterId: request.ConsultationEncounterId,
            Icd10Code: request.Icd10Code,
            ProblemTitle: request.ProblemTitle,
            PhilHealthMdiseaseCode: request.PhilHealthMdiseaseCode,
            Status: request.Status,
            Severity: request.Severity,
            IsChronicNcd: request.IsChronicNcd,
            OnsetDate: request.OnsetDate,
            ClinicalNotes: request.ClinicalNotes,
            RecordedByDoctorName: request.RecordedByDoctorName
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientProblemDto>.Success(result));
    }

    [HttpPatch("{problemId:guid}/status")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientProblemDto>>> UpdateProblemStatus(
        Guid patientId,
        Guid problemId,
        [FromBody] UpdateProblemStatusRequest request,
        CancellationToken ct)
    {
        var command = new UpdatePatientProblemStatusCommand(
            ProblemId: problemId,
            PatientId: patientId,
            Status: request.Status,
            ResolvedDate: request.ResolvedDate,
            ClinicalNotes: request.ClinicalNotes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientProblemDto>.Success(result));
    }
}
