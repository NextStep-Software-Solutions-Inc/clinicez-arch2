using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.Prescriptions.Queries;

/// <summary>
/// Drugstores this clinic has recorded external dispenses with, most used first. Learned from the clinic's own
/// records, so the app needs no built-in list of pharmacy chains.
/// </summary>
public sealed record GetRecentExternalPharmaciesQuery(int Take = 12) : IRequest<IReadOnlyList<string>>;

public sealed class GetRecentExternalPharmaciesQueryHandler : IRequestHandler<GetRecentExternalPharmaciesQuery, IReadOnlyList<string>>
{
    private readonly IRepository<ConsultationEncounter> _encounters;

    public GetRecentExternalPharmaciesQueryHandler(IRepository<ConsultationEncounter> encounters) => _encounters = encounters;

    public async Task<IReadOnlyList<string>> Handle(GetRecentExternalPharmaciesQuery request, CancellationToken cancellationToken)
    {
        var take = request.Take is < 1 or > 50 ? 12 : request.Take;

        var names = await _encounters
            .Query(e => e.RxDispensedPharmacyName != null && e.RxDispensedPharmacyName != string.Empty)
            .Select(e => e.RxDispensedPharmacyName!)
            .ToListAsync(cancellationToken);

        // Group case-insensitively in memory (the clinic has at most a few thousand dispenses) and keep the spelling used most.
        return names
            .Select(n => n.Trim())
            .Where(n => n.Length > 0)
            .GroupBy(n => n, System.StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Count())
            .ThenBy(g => g.Key, System.StringComparer.OrdinalIgnoreCase)
            .Take(take)
            .Select(g => g.GroupBy(x => x).OrderByDescending(x => x.Count()).First().Key)
            .ToList();
    }
}
