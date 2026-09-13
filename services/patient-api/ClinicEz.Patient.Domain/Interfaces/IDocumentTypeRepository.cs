using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Domain.Interfaces;

public interface IDocumentTypeRepository : IBaseRepository<DocumentType>
{
    Task<List<DocumentType>> GetAllActiveAsync(CancellationToken cancellationToken = default);
}
