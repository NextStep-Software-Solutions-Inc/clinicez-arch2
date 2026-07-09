using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Clinics.Queries.SearchClinics;

public sealed record SearchClinicsQuery(string? Query, Guid? OrganizationId, Guid? ForPatientId, int Skip = 0, int Take = 20)
    : IRequest<DiscoveryPagedDto<ClinicSummaryDto>>;
