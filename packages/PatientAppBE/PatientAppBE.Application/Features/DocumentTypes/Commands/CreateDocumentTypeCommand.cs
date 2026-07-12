using System.Text.Json;
using MediatR;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.DocumentTypes.Commands;

public record CreateDocumentTypeCommand(
    string Code,
    string Label,
    string? Description,
    List<string> SupportedExtensions,
    List<string> SupportedMimeTypes,
    string NativePreviewKind,
    int SortOrder,
    bool IsActive) : IRequest<Guid>;

public class CreateDocumentTypeCommandHandler : IRequestHandler<CreateDocumentTypeCommand, Guid>
{
    private readonly IDocumentTypeRepository _repository;
    private readonly IUnitOfWork _unitOfWork;

    public CreateDocumentTypeCommandHandler(IDocumentTypeRepository repository, IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<Guid> Handle(CreateDocumentTypeCommand request, CancellationToken cancellationToken)
    {
        var entity = new DocumentType
        {
            Id = Guid.NewGuid(),
            Code = request.Code,
            Label = request.Label,
            Description = request.Description,
            SupportedExtensionsJson = JsonSerializer.Serialize(request.SupportedExtensions),
            SupportedMimeTypesJson = JsonSerializer.Serialize(request.SupportedMimeTypes),
            NativePreviewKind = request.NativePreviewKind,
            SortOrder = request.SortOrder,
            IsActive = request.IsActive
        };

        await _repository.AddAsync(entity, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return entity.Id;
    }
}
