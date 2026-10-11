using ClinicEz.Patient.Domain.Interfaces;
using MediatR;

namespace ClinicEz.Patient.Application.Features.Sharing.Queries.GetAccessGrants;

public sealed record GetAccessGrantsQuery(Guid PatientId) : IRequest<IReadOnlyList<AccessGrantDto>>;

public sealed class GetAccessGrantsQueryHandler : IRequestHandler<GetAccessGrantsQuery, IReadOnlyList<AccessGrantDto>>
{
    private readonly IPatientAccessRepository _access;
    private readonly IClinicRepository _clinics;
    private readonly TimeProvider _clock;

    public GetAccessGrantsQueryHandler(IPatientAccessRepository access, IClinicRepository clinics, TimeProvider clock)
    {
        _access = access;
        _clinics = clinics;
        _clock = clock;
    }

    public async Task<IReadOnlyList<AccessGrantDto>> Handle(GetAccessGrantsQuery request, CancellationToken cancellationToken)
    {
        var grants = await _access.GetGrantsAsync(request.PatientId, cancellationToken);
        var names = await FacilityNames.ForAsync(_clinics, grants.Select(g => g.FacilityId), cancellationToken);
        var now = _clock.GetUtcNow().UtcDateTime;

        return grants.Select(g => AccessGrantMapper.ToDto(g, names.GetValueOrDefault(g.FacilityId), now)).ToList();
    }
}

internal static class FacilityNames
{
    public static async Task<Dictionary<Guid, string>> ForAsync(IClinicRepository clinics, IEnumerable<Guid> ids, CancellationToken ct)
    {
        var distinct = ids.Distinct().ToList();
        if (distinct.Count == 0)
            return [];

        var found = await clinics.GetByIdsAsync(distinct, ct);
        return found.ToDictionary(c => c.Id, c => c.Name);
    }
}