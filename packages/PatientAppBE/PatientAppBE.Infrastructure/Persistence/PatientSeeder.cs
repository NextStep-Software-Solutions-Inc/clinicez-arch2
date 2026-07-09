using System;
using System.Linq;
using PatientAppBE.Domain.Entities;

namespace PatientAppBE.Infrastructure.Persistence;

public class PatientSeeder : IDataSeeder
{
    public int Order => 1;

    public void Seed(ApplicationDbContext context)
    {
        var now = DateTime.UtcNow;
        var testClerkUserIds = new[] { 
            "user_2hXZZn1Wmr7z1S4GqBhsdzvzHdm",
            "user_30WHio75ZUVC7SME6lFEriMNRyL"
        };

        foreach (var testClerkUserId in testClerkUserIds)
        {
            if (!context.Patients.Any(p => p.ClerkUserId == testClerkUserId))
            {
                var patientId = Guid.NewGuid();
                var patient = new Patient
                {
                    ClientId = patientId,
                    ClerkUserId = testClerkUserId,
                    FirstName = "Demo",
                    LastName = "Patient",
                    CreatedAt = now,
                    CreatedBy = "seeder",
                    UpdatedAt = now,
                    UpdatedBy = "seeder"
                };
                context.Patients.Add(patient);
                context.SaveChanges();
                Console.WriteLine($"[DbSeeder] Successfully seeded test patient (Clerk ID: {testClerkUserId}, Client ID: {patientId})");
            }
        }
    }
}
