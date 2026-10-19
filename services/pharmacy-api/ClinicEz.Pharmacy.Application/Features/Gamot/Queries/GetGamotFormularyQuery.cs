using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Pharmacy.Application.Features.Gamot.DTOs;
using ClinicEz.Pharmacy.Domain.Services;
using ClinicEz.Shared.Common;
using MediatR;

namespace ClinicEz.Pharmacy.Application.Features.Gamot.Queries;

public sealed record GetGamotFormularyQuery(
    string? SearchTerm = null,
    string? Category = null) : IRequest<ApiResponse<IReadOnlyList<GamotFormularyDto>>>;

public sealed class GetGamotFormularyQueryHandler : IRequestHandler<GetGamotFormularyQuery, ApiResponse<IReadOnlyList<GamotFormularyDto>>>
{
    private readonly IGamotFormularyService _formularyService;

    public GetGamotFormularyQueryHandler(IGamotFormularyService formularyService)
    {
        _formularyService = formularyService;
    }

    public Task<ApiResponse<IReadOnlyList<GamotFormularyDto>>> Handle(
        GetGamotFormularyQuery request,
        CancellationToken cancellationToken)
    {
        var items = _formularyService.GetAllFormularyItems();

        if (!string.IsNullOrWhiteSpace(request.Category))
        {
            items = items.Where(i => string.Equals(i.TherapeuticCategory, request.Category, StringComparison.OrdinalIgnoreCase)).ToList();
        }

        if (!string.IsNullOrWhiteSpace(request.SearchTerm))
        {
            var search = request.SearchTerm.Trim().ToLowerInvariant();
            items = items.Where(i =>
                i.GenericName.ToLowerInvariant().Contains(search) ||
                i.DrugCode.ToLowerInvariant().Contains(search) ||
                i.Dosage.ToLowerInvariant().Contains(search) ||
                i.TherapeuticCategory.ToLowerInvariant().Contains(search)).ToList();
        }

        var dtos = items.Select(i => new GamotFormularyDto(
            DrugCode: i.DrugCode,
            GenericName: i.GenericName,
            Dosage: i.Dosage,
            Form: i.Form,
            TherapeuticCategory: i.TherapeuticCategory,
            ReferenceUnitPrice: i.ReferenceUnitPrice,
            RequiresSpecialistRecommendation: i.RequiresSpecialistRecommendation
        )).ToList();

        return Task.FromResult(ApiResponse<IReadOnlyList<GamotFormularyDto>>.Success(dtos));
    }
}
