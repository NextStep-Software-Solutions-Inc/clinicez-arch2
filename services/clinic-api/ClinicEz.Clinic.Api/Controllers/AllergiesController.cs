using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application.Features.Allergies.Commands;
using ClinicEz.Clinic.Application.Features.Allergies.Dtos;
using ClinicEz.Clinic.Application.Features.Allergies.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;

namespace ClinicEz.Clinic.Api.Controllers;

[ApiController]
[Route("api/v1/patients/{patientId:guid}/allergies")]
public sealed class AllergiesController : ControllerBase
{
    private readonly ISender _sender;

    public AllergiesController(ISender sender)
    {
        _sender = sender;
    }

    [HttpGet]
    [HasPermission(ClinicPermissions.PatientsRead)]
    public async Task<ActionResult<ApiResponse<IReadOnlyList<PatientAllergyDto>>>> GetPatientAllergies(
        Guid patientId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new GetPatientAllergiesQuery(patientId), ct);
        return Ok(ApiResponse<IReadOnlyList<PatientAllergyDto>>.Success(result));
    }

    [HttpPost]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<PatientAllergyDto>>> CreateAllergy(
        Guid patientId,
        [FromBody] CreateAllergyRequest request,
        CancellationToken ct)
    {
        var command = new CreatePatientAllergyCommand(
            PatientId: patientId,
            Category: request.Category,
            Allergen: request.Allergen,
            AllergenDrugCode: request.AllergenDrugCode,
            Severity: request.Severity,
            ReactionManifestation: request.ReactionManifestation,
            IsAnaphylactic: request.IsAnaphylactic,
            OnsetDate: request.OnsetDate,
            Notes: request.Notes
        );

        var result = await _sender.Send(command, ct);
        return Ok(ApiResponse<PatientAllergyDto>.Success(result));
    }

    [HttpDelete("{allergyId:guid}")]
    [HasPermission(ClinicPermissions.PatientsWrite)]
    public async Task<ActionResult<ApiResponse<bool>>> DeleteAllergy(
        Guid patientId,
        Guid allergyId,
        CancellationToken ct)
    {
        var result = await _sender.Send(new DeletePatientAllergyCommand(allergyId, patientId), ct);
        return Ok(ApiResponse<bool>.Success(result));
    }
}
