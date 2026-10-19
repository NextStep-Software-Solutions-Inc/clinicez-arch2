using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.CustomFields.DTOs;
using ClinicEz.Clinic.Application.Features.CustomFields.Templates;
using MediatR;

namespace ClinicEz.Clinic.Application.Features.CustomFields.Queries;

public sealed record GetCustomFieldTemplatesQuery(
    string? EntityType = "ClinicPatient") : IRequest<IReadOnlyList<CustomFieldTemplateDto>>;

public sealed class GetCustomFieldTemplatesQueryHandler : IRequestHandler<GetCustomFieldTemplatesQuery, IReadOnlyList<CustomFieldTemplateDto>>
{
    public Task<IReadOnlyList<CustomFieldTemplateDto>> Handle(GetCustomFieldTemplatesQuery request, CancellationToken ct)
    {
        var templates = ClinicCustomFieldTemplatesCatalog.GetAllTemplates(request.EntityType);
        return Task.FromResult(templates);
    }
}
