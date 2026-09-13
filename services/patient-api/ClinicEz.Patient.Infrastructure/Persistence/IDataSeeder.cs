using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence;

public interface IDataSeeder
{
    int Order { get; }
    void Seed(ApplicationDbContext context);
}
