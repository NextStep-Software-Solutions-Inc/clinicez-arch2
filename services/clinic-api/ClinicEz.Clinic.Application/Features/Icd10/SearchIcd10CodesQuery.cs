using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.Icd10;

public sealed record Icd10ItemDto(string Code, string Description, string Category);

public sealed record SearchIcd10CodesQuery(string? Query = null) : IRequest<IReadOnlyList<Icd10ItemDto>>;

public sealed class SearchIcd10CodesQueryHandler : IRequestHandler<SearchIcd10CodesQuery, IReadOnlyList<Icd10ItemDto>>
{
    private static readonly IReadOnlyList<Icd10ItemDto> Catalog = new List<Icd10ItemDto>
    {
        new("I10", "Essential (primary) hypertension", "Cardiovascular"),
        new("I11.9", "Hypertensive heart disease without heart failure", "Cardiovascular"),
        new("E11.9", "Type 2 diabetes mellitus without complications", "Endocrine"),
        new("E78.5", "Hyperlipidemia, unspecified", "Endocrine"),
        new("J00", "Acute nasopharyngitis (common cold)", "Respiratory"),
        new("J02.9", "Acute pharyngitis, unspecified", "Respiratory"),
        new("J06.9", "Acute upper respiratory infection, unspecified", "Respiratory"),
        new("J18.9", "Pneumonia, unspecified organism", "Respiratory"),
        new("J45.909", "Unspecified asthma, uncomplicated", "Respiratory"),
        new("A09", "Infectious gastroenteritis and colitis, unspecified", "Gastrointestinal"),
        new("K21.9", "Gastro-esophageal reflux disease without esophagitis", "Gastrointestinal"),
        new("N39.0", "Urinary tract infection, site not specified", "Genitourinary"),
        new("A90", "Dengue fever (classical dengue)", "Infectious"),
        new("B34.9", "Viral infection, unspecified", "Infectious"),
        new("M54.5", "Low back pain", "Musculoskeletal"),
        new("R51", "Headache", "Symptoms"),
        new("R50.9", "Fever, unspecified", "Symptoms"),
        new("Z00.00", "Encounter for general adult medical examination", "Factors Influencing Health"),
        new("Z01.419", "Encounter for gynecological examination (general)", "Factors Influencing Health"),
        new("U07.1", "COVID-19, virus identified", "Special Codes")
    }.AsReadOnly();

    public Task<IReadOnlyList<Icd10ItemDto>> Handle(SearchIcd10CodesQuery request, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Query))
        {
            return Task.FromResult(Catalog);
        }

        var q = request.Query.Trim();
        var matches = Catalog.Where(item =>
            item.Code.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            item.Description.Contains(q, StringComparison.OrdinalIgnoreCase) ||
            item.Category.Contains(q, StringComparison.OrdinalIgnoreCase))
            .ToList();

        return Task.FromResult<IReadOnlyList<Icd10ItemDto>>(matches);
    }
}
