using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.Organizations.Commands.JoinOrganization;

namespace PatientAppBE.Api.Endpoints.Organizations;

public sealed record JoinOrganizationRequest(
    Guid? OrganizationId,
    string? InviteCode,
    string RoleId,
    bool ConsentPrivacyPolicy,
    bool ConsentTermsAndConditions,
    bool ConsentDataSharing);

public sealed class JoinOrganizationEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapPost("/patients/{patientId:guid}/organization-memberships", async (
                Guid patientId, JoinOrganizationRequest request, ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new JoinOrganizationCommand(
                    patientId, request.OrganizationId, request.InviteCode, request.RoleId,
                    request.ConsentPrivacyPolicy, request.ConsentTermsAndConditions, request.ConsentDataSharing), ct);

                return Results.Created(
                    $"/api/v1/patients/{patientId}/organization-memberships/{result.Id}",
                    ApiResponse<OrganizationMembershipDto>.Success(result, "Joined organization successfully."));
            })
            .WithTags("Memberships")
            .WithName("JoinOrganization")
            .WithSummary("Join an organization using an invite code")
            .Produces<ApiResponse<OrganizationMembershipDto>>(StatusCodes.Status201Created)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .Produces<ApiResponse<object>>(StatusCodes.Status409Conflict)
            .RequireAuthorization();
    }
}
