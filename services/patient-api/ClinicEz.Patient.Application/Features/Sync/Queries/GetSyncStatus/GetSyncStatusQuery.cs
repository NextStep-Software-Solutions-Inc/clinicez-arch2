using MediatR;
using ClinicEz.Patient.Application.Common.DTOs;

namespace ClinicEz.Patient.Application.Features.Sync.Queries.GetSyncStatus;

public sealed record GetSyncStatusQuery(Guid PatientId, int Take = 50) : IRequest<SyncStatusDto>;
