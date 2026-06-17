using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Features.Clinics.Commands.JoinClinic;

namespace PatientApp.Api.Endpoints.Clinics;

public sealed record JoinClinicRequest(
    Guid ClinicId,
    bool ConsentPrivacyPolicy,
    bool ConsentTermsAndConditions,
    bool ConsentDataSharing);

public sealed class JoinClinicEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/clinic-memberships", async (
                Guid patientId, JoinClinicRequest request, ISender sender, CancellationToken ct) =>
            {
                var id = await sender.Send(new JoinClinicCommand(
                    patientId, request.ClinicId,
                    request.ConsentPrivacyPolicy, request.ConsentTermsAndConditions, request.ConsentDataSharing), ct);

                return Results.Created(
                    $"/api/v1/patients/{patientId}/clinic-memberships/{id}",
                    ApiResponse<Guid>.Success(id, "Joined clinic successfully."));
            })
            .WithTags("Memberships")
            .WithName("JoinClinic")
            .WithSummary("Join a clinic directly (consent only — no invite code required)")
            .Produces<ApiResponse<Guid>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .RequireAuthorization();
    }
}
