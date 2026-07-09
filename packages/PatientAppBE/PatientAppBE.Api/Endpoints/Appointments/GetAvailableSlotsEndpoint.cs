using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Features.Appointments.Queries.GetAvailableSlots;

namespace PatientAppBE.Api.Endpoints.Appointments;

public sealed class GetAvailableSlotsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/clinics/{clinicId:guid}/providers/{providerId:guid}/slots", async (
            Guid clinicId, Guid providerId, DateOnly date, ISender sender, CancellationToken ct) =>
        {
            var query = new GetAvailableSlotsQuery(clinicId, providerId, date);
            var slots = await sender.Send(query, ct);
            
            return Results.Ok(ApiResponse<object>.Success(new { date = date.ToString("yyyy-MM-dd"), slots = slots }));
        })
        .WithTags("Appointments")
        .WithName("GetAvailableSlots")
        .WithSummary("Get available appointment slots for a specific provider on a given date.")
        .Produces<ApiResponse<object>>(StatusCodes.Status200OK);
    }
}
