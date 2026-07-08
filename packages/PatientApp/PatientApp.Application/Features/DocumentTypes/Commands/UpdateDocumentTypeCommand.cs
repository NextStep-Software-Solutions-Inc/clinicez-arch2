using System.Text.Json;
using MediatR;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Application.Features.DocumentTypes.Commands;

public record UpdateDocumentTypeCommand(
    Guid Id,
    string Code,
    string Label,
    string? Description,
    List<string> SupportedExtensions,
    List<string> SupportedMimeTypes,
    string NativePreviewKind,
    int SortOrder,
    bool IsActive) : IRequest<bool>;

public class UpdateDocumentTypeCommandHandler : IRequestHandler<UpdateDocumentTypeCommand, bool>
{
    private readonly IDocumentTypeRepository _repository;
    private readonly IUnitOfWork _unitOfWork;

    public UpdateDocumentTypeCommandHandler(IDocumentTypeRepository repository, IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(UpdateDocumentTypeCommand request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetByIdAsync(request.Id, cancellationToken);
        if (entity == null) return false;

        entity.Code = request.Code;
        entity.Label = request.Label;
        entity.Description = request.Description;
        entity.SupportedExtensionsJson = JsonSerializer.Serialize(request.SupportedExtensions);
        entity.SupportedMimeTypesJson = JsonSerializer.Serialize(request.SupportedMimeTypes);
        entity.NativePreviewKind = request.NativePreviewKind;
        entity.SortOrder = request.SortOrder;
        entity.IsActive = request.IsActive;

        _repository.Update(entity);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
