using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Persistence;

public interface IDataSeeder
{
    int Order { get; }
    void Seed(ApplicationDbContext context);
}
