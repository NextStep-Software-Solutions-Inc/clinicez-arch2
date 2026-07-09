using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;

namespace PatientApp.Infrastructure.Persistence.Repositories;

public class FileFolderRepository : BaseRepository<FileFolder>, IFileFolderRepository
{
    public FileFolderRepository(ApplicationDbContext context) : base(context)
    {
    }
}
