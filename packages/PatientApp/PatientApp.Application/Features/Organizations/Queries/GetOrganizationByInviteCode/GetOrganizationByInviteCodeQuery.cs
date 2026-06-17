using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Organizations.Queries.GetOrganizationByInviteCode;

public sealed record GetOrganizationByInviteCodeQuery(string InviteCode)
    : IRequest<OrganizationDetailDto?>;
