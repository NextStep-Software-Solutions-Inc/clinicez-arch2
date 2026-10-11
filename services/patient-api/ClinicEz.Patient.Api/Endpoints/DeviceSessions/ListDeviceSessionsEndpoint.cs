using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.DeviceSessions.Queries.ListDeviceSessions;

namespace ClinicEz.Patient.Api.Endpoints.DeviceSessions;

public sealed class ListDeviceSessionsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/sessions", async (
                Guid patientId,
                ISender sender,
                CancellationToken ct) =>
            {
                var result = await sender.Send(new ListDeviceSessionsQuery(patientId), ct);
                return Results.Ok(ApiResponse<IReadOnlyList<DeviceSessionDto>>.Success(result));
            })
            .WithTags("Device Sessions")
            .WithName("ListDeviceSessions")
            .WithSummary("List the devices currently signed in for a patient")
            .WithDescription("Returns every active device session of the patient, most recently active first.")
            .Produces<ApiResponse<IReadOnlyList<DeviceSessionDto>>>()
            .RequireAuthorization();
    }
}
