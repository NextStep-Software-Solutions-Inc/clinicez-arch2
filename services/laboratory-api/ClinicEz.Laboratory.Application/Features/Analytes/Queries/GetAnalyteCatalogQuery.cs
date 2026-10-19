using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Domain.Services;
using MediatR;

namespace ClinicEz.Laboratory.Application.Features.Analytes.Queries;

public record AnalyteCatalogItemDto(
    string PanelName,
    string AnalyteCode,
    string AnalyteName,
    string Unit,
    string ReferenceInterval
);

public record GetAnalyteCatalogQuery : IRequest<List<AnalyteCatalogItemDto>>;

public class GetAnalyteCatalogQueryHandler : IRequestHandler<GetAnalyteCatalogQuery, List<AnalyteCatalogItemDto>>
{
    public Task<List<AnalyteCatalogItemDto>> Handle(GetAnalyteCatalogQuery request, CancellationToken cancellationToken)
    {
        var items = ReferenceRangeEvaluator.Catalog.Select(c => new AnalyteCatalogItemDto(
            c.PanelName,
            c.AnalyteCode,
            c.AnalyteName,
            c.Unit,
            c.ReferenceInterval
        )).ToList();

        return Task.FromResult(items);
    }
}
