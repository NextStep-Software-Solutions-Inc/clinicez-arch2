using MediatR;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Application.Features.DocumentTypes.Commands;

public record DeleteDocumentTypeCommand(Guid Id) : IRequest<bool>;

public class DeleteDocumentTypeCommandHandler : IRequestHandler<DeleteDocumentTypeCommand, bool>
{
    private readonly IDocumentTypeRepository _repository;
    private readonly IUnitOfWork _unitOfWork;

    public DeleteDocumentTypeCommandHandler(IDocumentTypeRepository repository, IUnitOfWork unitOfWork)
    {
        _repository = repository;
        _unitOfWork = unitOfWork;
    }

    public async Task<bool> Handle(DeleteDocumentTypeCommand request, CancellationToken cancellationToken)
    {
        var entity = await _repository.GetByIdAsync(request.Id, cancellationToken);
        if (entity == null) return false;

        _repository.Delete(entity);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        return true;
    }
}
