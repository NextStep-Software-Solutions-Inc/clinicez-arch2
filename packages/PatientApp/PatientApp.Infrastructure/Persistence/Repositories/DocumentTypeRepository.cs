using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Infrastructure.Persistence.Repositories;

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
