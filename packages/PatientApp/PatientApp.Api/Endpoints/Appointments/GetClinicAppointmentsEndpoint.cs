using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Appointments.Queries.GetClinicAppointments;

namespace PatientApp.Api.Endpoints.Appointments;

public sealed class GetClinicAppointmentsEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/patients/{patientId:guid}/clinic-appointments", async (
                Guid patientId,
                string clinicBaseUrl,
                ISender sender,
                HttpContext httpContext,
                CancellationToken ct) =>
            {
                // Forward the patient's JWT to the clinic backend for service-to-service auth.
                var rawAuth = httpContext.Request.Headers.Authorization.ToString();
                var bearerToken = rawAuth.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
                    ? rawAuth["Bearer ".Length..].Trim()
                    : rawAuth;

                var result = await sender.Send(
                    new GetClinicAppointmentsQuery(patientId, clinicBaseUrl, bearerToken), ct);

                return Results.Ok(ApiResponse<ClinicAppointmentsResponse>.Success(result));
            })
            .WithTags("Appointments")
            .WithName("GetClinicAppointments")
            .WithSummary("Proxy appointment data from a specific clinic's backend API")
            .Produces<ApiResponse<ClinicAppointmentsResponse>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status503ServiceUnavailable)
            .ProducesValidationProblem()
            .RequireAuthorization();
    }
}
