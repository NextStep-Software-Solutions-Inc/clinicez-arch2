using System;
using System.Linq;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;

namespace PatientApp.Infrastructure.Persistence;

public class AppointmentSeeder : IDataSeeder
{
    public int Order => 3; // Run after CatalogSeeder and PatientSeeder

    public void Seed(ApplicationDbContext context)
    {
        var testClerkUserId = "user_2hXZZn1Wmr7z1S4GqBhsdzvzHdm";
        var patient = context.Patients.FirstOrDefault(p => p.ClerkUserId == testClerkUserId);

        if (patient == null)
        {
            Console.WriteLine("[DbSeeder] Test patient not found. Skipping appointments seeding.");
            return;
        }

        if (context.Appointments.Any(a => a.PatientId == patient.Id))
        {
            return; // Already seeded
        }

        var clinics = context.Clinics.Take(2).ToList();
        if (clinics.Count == 0)
        {
            Console.WriteLine("[DbSeeder] No clinics found. Skipping appointments seeding.");
            return;
        }

        var now = DateTime.UtcNow;
        var appointments = new[]
        {
            new Appointment
            {
                Id = Guid.NewGuid(),
                PatientId = patient.Id,
                ClinicId = clinics[0].Id,
                ProviderId = Guid.NewGuid(),
                Subject = "Dr. Alice Smith",
                ServiceType = "General Consultation",
                ScheduledAt = now.AddDays(1).AddHours(2), // Tomorrow
                DurationMinutes = 30,
                Status = AppointmentStatus.Confirmed,
                Notes = "Routine checkup",
                CreatedAt = now,
                CreatedBy = "seeder",
                UpdatedAt = now,
                UpdatedBy = "seeder"
            },
            new Appointment
            {
                Id = Guid.NewGuid(),
                PatientId = patient.Id,
                ClinicId = clinics[0].Id,
                ProviderId = Guid.NewGuid(),
                Subject = "Dr. Bob Johnson",
                ServiceType = "Dental Cleaning",
                ScheduledAt = now.AddDays(5),
                DurationMinutes = 60,
                Status = AppointmentStatus.Pending,
                Notes = "Bring previous dental records",
                CreatedAt = now,
                CreatedBy = "seeder",
                UpdatedAt = now,
                UpdatedBy = "seeder"
            },
            new Appointment
            {
                Id = Guid.NewGuid(),
                PatientId = patient.Id,
                ClinicId = clinics.Count > 1 ? clinics[1].Id : clinics[0].Id,
                ProviderId = Guid.NewGuid(),
                Subject = "Dr. Carol Williams",
                ServiceType = "Follow-up",
                ScheduledAt = now.AddDays(-2), // Past appointment
                DurationMinutes = 15,
                Status = AppointmentStatus.Completed,
                Notes = "Follow-up on blood test results",
                CreatedAt = now,
                CreatedBy = "seeder",
                UpdatedAt = now,
                UpdatedBy = "seeder"
            }
        };

        context.Appointments.AddRange(appointments);
        context.SaveChanges();

        Console.WriteLine($"[DbSeeder] Successfully seeded {appointments.Length} appointments for test patient.");
    }
}
