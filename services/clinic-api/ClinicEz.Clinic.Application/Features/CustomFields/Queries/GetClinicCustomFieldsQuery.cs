using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Interfaces;
using MediatR;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Queries;

public sealed record GetClinicCustomFieldsQuery(
    string? EntityType = "ClinicPatient",
    string? Category = null) : IRequest<IReadOnlyList<ClinicCustomFieldDefinitionDto>>;

public sealed class GetClinicCustomFieldsQueryHandler : IRequestHandler<GetClinicCustomFieldsQuery, IReadOnlyList<ClinicCustomFieldDefinitionDto>>
{
    private readonly IRepository<ClinicCustomFieldDefinition> _repo;

    public GetClinicCustomFieldsQueryHandler(IRepository<ClinicCustomFieldDefinition> repo)
    {
        _repo = repo;
    }

    public async Task<IReadOnlyList<ClinicCustomFieldDefinitionDto>> Handle(GetClinicCustomFieldsQuery request, CancellationToken ct)
    {
        var query = _repo.Query().AsNoTracking().Where(f => f.IsActive);

        if (!string.IsNullOrWhiteSpace(request.EntityType))
        {
            query = query.Where(f => f.EntityType == request.EntityType);
        }

        if (!string.IsNullOrWhiteSpace(request.Category))
        {
            query = query.Where(f => f.Category == null || f.Category == "All" || f.Category == request.Category);
        }

        var items = await query.OrderBy(f => f.DisplayOrder).ThenBy(f => f.Label).ToListAsync(ct);

        return items.Select(f => new ClinicCustomFieldDefinitionDto(
            f.Id,
            f.TenantId,
            f.ClinicId,
            f.EntityType,
            f.FieldKey,
            f.Label,
            f.DataType,
            f.Category,
            f.IsRequired,
            f.DisplayOrder,
            f.OptionsJson,
            f.Placeholder,
            f.IsActive,
            f.CreatedAt,
            f.VisibilityRuleJson,
            f.ConditionalOptionsJson,
            f.BoundaryMode
        )).ToList().AsReadOnly();
    }
}
