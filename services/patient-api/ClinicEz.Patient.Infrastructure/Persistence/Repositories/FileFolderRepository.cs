using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

public class FileFolderRepository : BaseRepository<FileFolder>, IFileFolderRepository
{
    public FileFolderRepository(ApplicationDbContext context) : base(context)
    {
    }
}
