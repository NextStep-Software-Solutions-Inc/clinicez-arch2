using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Persistence;

public interface IDataSeeder
{
    int Order { get; }
    void Seed(ApplicationDbContext context);
}
