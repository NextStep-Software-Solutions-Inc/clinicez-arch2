using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Patients.Commands.LogMedicationAdherence;
using ClinicEz.Patient.Application.Features.Patients.Queries.GetTodayMedications;
using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Routing;

namespace ClinicEz.Patient.Api.Endpoints.Patients;

public sealed class GetTodayMedicationsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/medications/today", async (
                Guid patientId,
                [FromQuery] DateOnly? date,
                ISender sender = null!,
                CancellationToken ct = default) =>
            {
                var meds = await sender.Send(new GetTodayMedicationsQuery(patientId, date), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<TodayMedicationDto>>.Success(meds));
            })
            .WithTags("Patients")
            .WithName("GetTodayMedications")
            .WithSummary("Get active medications and adherence status for today")
            .WithDescription("Retrieves the patient's active daily medications including whether each dose has been taken today and recorded timestamp.")
            .Produces<ApiResponse<IReadOnlyList<TodayMedicationDto>>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}

public sealed class LogMedicationAdherenceEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/medications/{medicationId:guid}/log", async (
                Guid patientId,
                Guid medicationId,
                [FromBody] LogMedicationAdherenceRequest? request,
                ISender sender = null!,
                CancellationToken ct = default) =>
            {
                var success = await sender.Send(new LogMedicationAdherenceCommand(
                    patientId,
                    medicationId,
                    request?.TakenAt,
                    request?.Notes), ct);

                return Results.Ok(ApiResponse<bool>.Success(success));
            })
            .WithTags("Patients")
            .WithName("LogMedicationAdherence")
            .WithSummary("Log medication dose taken for today")
            .WithDescription("Records that a medication dose was taken at the specified timestamp (defaults to UtcNow).")
            .Produces<ApiResponse<bool>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status400BadRequest)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
