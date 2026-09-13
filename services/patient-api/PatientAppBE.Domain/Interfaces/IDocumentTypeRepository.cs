using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Domain.Interfaces;

public interface IDocumentTypeRepository : IBaseRepository<DocumentType>
{
    Task<List<DocumentType>> GetAllActiveAsync(CancellationToken cancellationToken = default);
}
