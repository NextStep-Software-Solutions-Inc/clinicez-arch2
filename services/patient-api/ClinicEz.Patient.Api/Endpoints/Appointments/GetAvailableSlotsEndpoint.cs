using ClinicEz.Shared.Common;
using MediatR;
using Microsoft.AspNetCore.Mvc;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Features.Appointments.Queries.GetAvailableSlots;

namespace ClinicEz.Patient.Api.Endpoints.Appointments;

public sealed class GetAvailableSlotsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/clinics/{clinicId:guid}/providers/{providerId:guid}/slots", async (
            Guid clinicId,
            Guid providerId,
            [FromQuery] DateOnly date,
            ISender sender,
            CancellationToken ct,
            [FromQuery] Guid? forPatientId = null) =>
        {
            var query = new GetAvailableSlotsQuery(clinicId, providerId, date, forPatientId);
            var slots = await sender.Send(query, ct);
            
            return Results.Ok(ApiResponse<object>.Success(new { date = date.ToString("yyyy-MM-dd"), slots = slots }));
        })
        .WithTags("Appointments")
        .WithName("GetAvailableSlots")
        .WithSummary("Get available appointment slots for a specific provider on a given date.")
        .WithDescription("Fetches a list of available time slots for a specified provider at a clinic on a particular date. If the clinic has gated access, forPatientId must be provided with active clinic or linked organization membership.")
        .Produces<ApiResponse<object>>(StatusCodes.Status200OK);
    }
}
