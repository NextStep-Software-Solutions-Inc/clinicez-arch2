using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Organizations.Queries.GetOrganizationByInviteCode;

public sealed record GetOrganizationByInviteCodeQuery(string InviteCode)
    : IRequest<OrganizationDetailDto?>;
