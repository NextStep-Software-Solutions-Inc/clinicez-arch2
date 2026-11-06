using MediatR;
using Microsoft.AspNetCore.Mvc;
using ClinicEz.Shared.Common;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Home;

namespace ClinicEz.Patient.Api.Endpoints.Home;

public sealed class GetPatientHomeDashboardEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/home-dashboard", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new GetPatientHomeDashboardQuery(patientId), ct);
                return Results.Ok(ApiResponse<PatientHomeDashboardDto>.Success(result));
            })
            .WithTags("Home")
            .WithName("GetPatientHomeDashboard")
            .WithSummary("Retrieve aggregated Patient Home dashboard state.")
            .Produces<ApiResponse<PatientHomeDashboardDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed class MarkWelcomeStepVisitedEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/welcome-steps/{stepKey}", async (
                Guid patientId,
                string stepKey,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new MarkWelcomeStepVisitedCommand(patientId, stepKey), ct);
                return Results.Ok(ApiResponse<WelcomeChecklistDto>.Success(result));
            })
            .WithTags("Home")
            .WithName("MarkWelcomeStepVisited")
            .WithSummary("Record that the patient navigated to one of the 3 onboarding welcome links.")
            .Produces<ApiResponse<WelcomeChecklistDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed class LogPatientVitalsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/vitals", async (
                Guid patientId,
                [FromBody] LogPatientVitalsRequestDto body,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new LogPatientVitalsCommand(patientId, body), ct);
                return Results.Created($"/api/v1/patients/{patientId}/vitals/{result.Id}", ApiResponse<VitalSignsEntryDto>.Success(result));
            })
            .WithTags("Home")
            .WithName("LogPatientVitals")
            .WithSummary("Record self-logged or synced vital signs for the patient.")
            .Produces<ApiResponse<VitalSignsEntryDto>>(StatusCodes.Status201Created)
            .RequireAuthorization();
    }
}

public sealed class GetTodayMedicationScheduleEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/medications/today", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new GetTodayMedicationScheduleQuery(patientId), ct);
                return Results.Ok(ApiResponse<TodayMedicationScheduleDto>.Success(result));
            })
            .WithTags("Home")
            .WithName("GetTodayMedicationSchedule")
            .WithSummary("Retrieve active medications and today's intake adherence status.")
            .Produces<ApiResponse<TodayMedicationScheduleDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed class LogMedicationIntakeEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/medications/{medicationId:guid}/log", async (
                Guid patientId,
                Guid medicationId,
                [FromBody] LogMedicationIntakeRequestDto? body,
                ISender sender,
                CancellationToken ct) =>
            {
                var payload = body ?? new LogMedicationIntakeRequestDto(null, null, null);
                var result = await sender.Send(new LogMedicationIntakeCommand(patientId, medicationId, payload), ct);
                return Results.Ok(ApiResponse<TodayMedicationScheduleItemDto>.Success(result));
            })
            .WithTags("Home")
            .WithName("LogMedicationIntake")
            .WithSummary("Log today's medication dose intake.")
            .Produces<ApiResponse<TodayMedicationScheduleItemDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed class CheckInAppointmentEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/appointments/{appointmentId:guid}/check-in", async (
                Guid patientId,
                Guid appointmentId,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new CheckInAppointmentCommand(patientId, appointmentId), ct);
                return Results.Ok(ApiResponse<AppointmentCheckInResponseDto>.Success(result));
            })
            .WithTags("Home")
            .WithName("CheckInAppointment")
            .WithSummary("Initiate patient check-in for an upcoming appointment.")
            .Produces<ApiResponse<AppointmentCheckInResponseDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}

public sealed class SearchPatientCatalogEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/search", async (
                Guid patientId,
                [FromQuery] string? q,
                [FromQuery] string? category,
                [FromQuery] bool availableTodayOnly = false,
                [FromQuery] bool openNowOnly = false,
                [FromQuery] int take = 20,
                ISender sender = null!,
                CancellationToken ct = default) =>
            {
                var result = await sender.Send(
                    new SearchPatientCatalogQuery(
                        patientId,
                        q,
                        category ?? "all",
                        availableTodayOnly,
                        openNowOnly,
                        take),
                    ct);
                return Results.Ok(ApiResponse<PatientSearchResponseDto>.Success(result));
            })
            .WithTags("Search")
            .WithName("SearchPatientCatalog")
            .WithSummary("Search visible doctors, clinics, and services with category counts.")
            .Produces<ApiResponse<PatientSearchResponseDto>>(StatusCodes.Status200OK)
            .RequireAuthorization();
    }
}
