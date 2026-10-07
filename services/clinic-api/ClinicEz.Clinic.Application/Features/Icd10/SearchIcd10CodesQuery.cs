using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Icd10;

public sealed record Icd10ItemDto(string Code, string Description);

/// <summary>Typeahead over the PhilHealth Catalog's <c>lib_icd</c>. An empty query returns nothing.</summary>
public sealed record SearchIcd10CodesQuery(string? Query = null) : IRequest<IReadOnlyList<Icd10ItemDto>>;

public sealed class SearchIcd10CodesQueryHandler : IRequestHandler<SearchIcd10CodesQuery, IReadOnlyList<Icd10ItemDto>>
{
    public const string Library = "lib_icd";
    public const int MaxResults = 50;

    private readonly IPhilHealthCatalogLookup _catalog;

    public SearchIcd10CodesQueryHandler(IPhilHealthCatalogLookup catalog) => _catalog = catalog;

    public Task<IReadOnlyList<Icd10ItemDto>> Handle(SearchIcd10CodesQuery request, CancellationToken cancellationToken)
    {
        var results = _catalog
            .SearchByCodeOrDescription(Library, request.Query ?? string.Empty, MaxResults)
            .Select(r => new Icd10ItemDto(r.Code, r.Description))
            .ToList();

        return Task.FromResult<IReadOnlyList<Icd10ItemDto>>(results);
    }
}
