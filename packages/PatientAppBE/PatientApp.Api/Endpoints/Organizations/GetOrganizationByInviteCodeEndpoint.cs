using CLINICEZ.Shared.Common;
using MediatR;
using PatientApp.Api.Abstractions;
using PatientApp.Application.Common.DTOs;
using PatientApp.Application.Features.Organizations.Queries.GetOrganizationByInviteCode;

namespace PatientApp.Api.Endpoints.Organizations;

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
            .Produces<ApiResponse<OrganizationDetailDto>>(StatusCodes.Status200OK)
            .Produces<ApiResponse<object>>(StatusCodes.Status404NotFound)
            .RequireAuthorization();
    }
}
