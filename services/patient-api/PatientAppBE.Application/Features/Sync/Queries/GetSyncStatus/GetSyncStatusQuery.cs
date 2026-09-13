using MediatR;
using PatientAppBE.Application.Common.DTOs;

namespace PatientAppBE.Application.Features.Sync.Queries.GetSyncStatus;

public sealed record GetSyncStatusQuery(Guid PatientId, int Take = 50) : IRequest<SyncStatusDto>;
