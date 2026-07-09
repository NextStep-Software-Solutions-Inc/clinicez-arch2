using System.Text.Json;
using MediatR;
using PatientAppBE.Application.Features.Files.Queries.GetFileConfig;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.DocumentTypes.Queries;

public record GetDocumentTypesQuery : IRequest<List<DocumentTypeDto>>;

public class GetDocumentTypesQueryHandler : IRequestHandler<GetDocumentTypesQuery, List<DocumentTypeDto>>
{
    private readonly IDocumentTypeRepository _repository;

    public GetDocumentTypesQueryHandler(IDocumentTypeRepository repository)
    {
        _repository = repository;
    }

    public async Task<List<DocumentTypeDto>> Handle(GetDocumentTypesQuery request, CancellationToken cancellationToken)
    {
        var types = await _repository.GetAllAsync(cancellationToken);
        
        return types.Select(t => new DocumentTypeDto(
            t.Id,
            t.Code,
            t.Label,
            t.Description,
            string.IsNullOrWhiteSpace(t.SupportedExtensionsJson) ? new List<string>() : JsonSerializer.Deserialize<List<string>>(t.SupportedExtensionsJson) ?? new List<string>(),
            string.IsNullOrWhiteSpace(t.SupportedMimeTypesJson) ? new List<string>() : JsonSerializer.Deserialize<List<string>>(t.SupportedMimeTypesJson) ?? new List<string>(),
            t.NativePreviewKind,
            t.SortOrder,
            t.IsActive
        )).OrderBy(t => t.SortOrder).ToList();
    }
}
