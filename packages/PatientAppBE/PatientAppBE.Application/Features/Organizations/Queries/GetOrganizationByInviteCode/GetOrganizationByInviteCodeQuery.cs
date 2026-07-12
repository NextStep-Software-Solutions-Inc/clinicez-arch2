using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Organizations.Queries.GetOrganizationByInviteCode;

public sealed record GetOrganizationByInviteCodeQuery(string InviteCode)
    : IRequest<OrganizationDetailDto?>;
