using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Interfaces;

namespace PatientAppBE.Infrastructure.Persistence.Repositories;

public class FileFolderRepository : BaseRepository<FileFolder>, IFileFolderRepository
{
    public FileFolderRepository(ApplicationDbContext context) : base(context)
    {
    }
}
