using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Commands.RecordPatientVitals;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetPatientVitals;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed class GetPatientVitalsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/vitals", async (
                Guid patientId,
                [FromQuery] int take = 10,
                ISender sender = null!,
                CancellationToken ct = default) =>
            {
                var vitals = await sender.Send(new GetPatientVitalsQuery(patientId, take), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<VitalSignsDto>>.Success(vitals));
            })
            .WithTags("Patients")
            .WithName("GetPatientVitals")
            .WithSummary("Get recent vital signs for a patient")
            .WithDescription("Retrieves the patient's recorded vital signs (heart rate, blood pressure, oxygen saturation, temperature, etc.) newest first.")
            .Produces<ApiResponse<IReadOnlyList<VitalSignsDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed class RecordPatientVitalsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/vitals", async (
                Guid patientId,
                [FromBody] RecordPatientVitalsRequest request,
                ISender sender = null!,
                CancellationToken ct = default) =>
            {
                var result = await sender.Send(new RecordPatientVitalsCommand(patientId, request), ct);
                return Results.Created($"/api/v1/patients/{patientId}/vitals/{result.Id}", ApiResponse<VitalSignsDto>.Success(result));
            })
            .WithTags("Patients")
            .WithName("RecordPatientVitals")
            .WithSummary("Record new vital signs for a patient")
            .WithDescription("Records systolic/diastolic blood pressure, heart rate, oxygen saturation, temperature, weight, height, BMI.")
            .Produces<ApiResponse<VitalSignsDto>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
