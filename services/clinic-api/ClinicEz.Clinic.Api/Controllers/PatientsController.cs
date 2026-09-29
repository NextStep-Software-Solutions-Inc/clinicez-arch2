using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Application.Features.Patients.DTOs;
using ClinicEz.Clinic.Application.Features.Patients.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/patients")]
public sealed class PatientsController : ControllerBase
{
    private readonly ISender _sender;

    public PatientsController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<ClinicPatientDto>>>> GetPatients(
        [FromQuery] string? search,
        [FromQuery] bool? hasAlerts,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 50,
        CancellationToken ct = default)
    {
        var result = await _sender.Send(new GetClinicPatientsQuery(search, hasAlerts, page, pageSize), ct);
        return Ok(ApiResponse<IReadOnlyList<ClinicPatientDto>>.Success(result));
    }

    [HttpGet("{id:guid}")]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<ClinicPatientDto>>> GetPatientById(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetClinicPatientByIdQuery(id), ct);
        if (result == null)
        {
            return NotFound(ApiResponse<ClinicPatientDto>.Fail("Patient not found."));
        }
        return Ok(ApiResponse<ClinicPatientDto>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<ClinicPatientDto>>> RegisterPatient(
        [FromBody] RegisterClinicPatientCommand command,
        CancellationToken ct)
    {
        var result = await _sender.Send(command, ct);
        return CreatedAtAction(nameof(GetPatientById), new { id = result.Id }, ApiResponse<ClinicPatientDto>.Success(result, "Patient registered successfully."));
    }

    [HttpPut("{id:guid}")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<ClinicPatientDto>>> UpdatePatient(
        Guid id,
        [FromBody] UpdatePatientRequest request,
        CancellationToken ct)
    {
        var command = new UpdateClinicPatientCommand(
            id,
            request.FirstName,
            request.LastName,
            request.MiddleName,
            request.Suffix,
            request.DateOfBirth,
            request.Gender,
            request.CivilStatus,
            request.ContactNumber,
            request.Email,
            request.AddressLine,
            request.Barangay,
            request.City,
            request.Province,
            request.EmergencyContactName,
            request.EmergencyContactPhone,
            request.EmergencyContactRelationship,
            request.PhilHealthNumber,
            request.SeniorCitizenId,
            request.PwdId,
            request.BloodType,
            request.Allergies,
            request.ChronicConditions,
            request.Alerts);

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<ClinicPatientDto>.Success(result, "Patient profile updated successfully."));
    }

    [HttpGet("{id:guid}/chart")]
    [HasPermission(ClinicPermissions.ConsultationsRead)]
    public async Task<ActionResult<ApiResponse<PatientChartDto>>> GetPatientChart(
        Guid id,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientChartQuery(id), ct);
        return Ok(ApiResponse<PatientChartDto>.Success(result));
    }
}

public sealed record UpdatePatientRequest(
    string FirstName,
    string LastName,
    string? MiddleName,
    string? Suffix,
    DateOnly DateOfBirth,
    string Gender,
    string? CivilStatus,
    string ContactNumber,
    string? Email,
    string? AddressLine,
    string? Barangay,
    string? City,
    string? Province,
    string? EmergencyContactName,
    string? EmergencyContactPhone,
    string? EmergencyContactRelationship,
    string? PhilHealthNumber,
    string? SeniorCitizenId,
    string? PwdId,
    string? BloodType,
    string? Allergies,
    string? ChronicConditions,
    string? Alerts);
