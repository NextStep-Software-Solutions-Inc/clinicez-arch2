using ClinicEz.Shared.Common;
using MediatR;
using ClinicEz.Patient.Api.Abstractions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Features.Organizations.Queries.GetOrganizationByInviteCode;

namespace ClinicEz.Patient.Api.Endpoints.Organizations;

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
