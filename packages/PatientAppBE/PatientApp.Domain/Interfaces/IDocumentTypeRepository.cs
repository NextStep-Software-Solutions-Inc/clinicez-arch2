using PatientApp.Domain.Entities;

namespace PatientApp.Domain.Interfaces;

public interface IDocumentTypeRepository : IBaseRepository<DocumentType>
{
    Task<List<DocumentType>> GetAllActiveAsync(CancellationToken cancellationToken = default);
}
