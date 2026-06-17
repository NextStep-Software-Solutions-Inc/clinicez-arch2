using MediatR;
using PatientApp.Application.Common.DTOs;

namespace PatientApp.Application.Features.Sync.Queries.GetSyncStatus;

public sealed record GetSyncStatusQuery(Guid PatientId, int Take = 50) : IRequest<SyncStatusDto>;
