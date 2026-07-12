using CLINICEZ.Shared.Common;
using MediatR;
using PatientAppBE.Api.Abstractions;
using PatientAppBE.Application.Common.DTOs;
using PatientAppBE.Application.Features.Organizations.Queries.GetOrganizationByInviteCode;

namespace PatientAppBE.Api.Endpoints.Organizations;

public sealed class GetOrganizationByInviteCodeEndpoint : IEndpoint
{
    public void MapEndpoint(IEndpointRouteBuilder app)
    {
        app.MapGet("/organizations/by-invite/{inviteCode}", async (
                string inviteCode, ISender sender, CancellationToken ct) =>
            {
                var result = await sender.Send(new GetOrganizationByInviteCodeQuery(inviteCode), ct);
                return result is null
                    ? Results.NotFound(ApiResponse<object>.Fail($"No organization found for invite code '{inviteCode}'."))
                    : Results.Ok(ApiResponse<OrganizationDetailDto>.Success(result));
            })
            .WithTags("Discovery")
            .WithName("GetOrganizationByInviteCode")
            .WithSummary("Look up an organization by its invite code before the patient joins")
            .WithDescription("Retrieves organization preview details based on an invitation code prior to joining.")
            .Produces<ApiResponse<OrganizationDetailDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
