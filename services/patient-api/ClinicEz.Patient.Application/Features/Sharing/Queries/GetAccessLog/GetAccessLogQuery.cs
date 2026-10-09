using ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessGrants;
using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessLog;

public sealed record GetAccessLogQuery(Guid PatientId, Guid? GrantId, int Skip, int Take) : IRequest<AccessLogPageDto>;

public sealed class GetAccessLogQueryHandler : IRequestHandler<GetAccessLogQuery, AccessLogPageDto>
{
    public const int MaxPageSize = 200;

    private readonly IPatientAccessRepository _access;
    private readonly IClinicRepository _clinics;

    public GetAccessLogQueryHandler(IPatientAccessRepository access, IClinicRepository clinics)
    {
        _access = access;
        _clinics = clinics;
    }

    public async Task<AccessLogPageDto> Handle(GetAccessLogQuery request, CancellationToken cancellationToken)
    {
        var skip = Math.Max(0, request.Skip);
        var take = Math.Clamp(request.Take, 1, MaxPageSize);

        var (logs, total) = await _access.GetLogAsync(request.PatientId, request.GrantId, skip, take, cancellationToken);

        var grants = await _access.GetGrantsAsync(request.PatientId, cancellationToken);
        var facilityByGrant = grants.ToDictionary(g => g.Id, g => g.FacilityId);
        var names = await FacilityNames.ForAsync(_clinics, facilityByGrant.Values, cancellationToken);

        var items = logs.Select(l => new AccessLogDto(
            l.Id,
            l.GrantId,
            facilityByGrant.TryGetValue(l.GrantId, out var facilityId) ? names.GetValueOrDefault(facilityId) : null,
            l.Actor,
            l.Action,
            l.Detail,
            l.CreatedAt)).ToList();

        return new AccessLogPageDto(items, total);
    }
}