using System;
using System.Linq;
using ClinicEz.Patient.Domain.Entities;

namespace ClinicEz.Patient.Infrastructure.Persistence;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

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
                    ClinicEzId = ClinicEz.Patient.Domain.Common.ClinicEzIdGenerator.Generate(),
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
