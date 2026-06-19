using System.Collections.Generic;
using System.Linq;

namespace PatientApp.Infrastructure.Persistence;

public static class DbSeeder
{
    private static readonly List<IDataSeeder> Seeders = new()
    {
        new PatientSeeder(),
        new CatalogSeeder()
    };

    public static void Seed(ApplicationDbContext context)
    {
        foreach (var seeder in Seeders.OrderBy(s => s.Order))
        {
            seeder.Seed(context);
        }
    }
}
