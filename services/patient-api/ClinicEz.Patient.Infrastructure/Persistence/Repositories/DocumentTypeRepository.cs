using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

internal sealed class DocumentTypeRepository : BaseRepository<DocumentType>, IDocumentTypeRepository
{
    public DocumentTypeRepository(ApplicationDbContext context) : base(context)
    {
    }

    public async Task<List<DocumentType>> GetAllActiveAsync(CancellationToken cancellationToken = default)
    {
        return await DbSet
            .Where(d => d.IsActive)
            .OrderBy(d => d.SortOrder)
            .ThenBy(d => d.Label)
            .ToListAsync(cancellationToken);
    }
}
