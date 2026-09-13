using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Patient.Infrastructure.Persistence;

public class AppointmentSeeder : IDataSeeder
{
    public int Order => 3; // Run after CatalogSeeder and PatientSeeder

    public void Seed(ApplicationDbContext context)
    {
        var testClerkUserId = "user_30WHio75ZUVC7SME6lFEriMNRyL";
        var patient = context.Patients.FirstOrDefault(p => p.ClerkUserId == testClerkUserId);

        if (patient == null)
        {
            Console.WriteLine("[DbSeeder] Target test patient not found. Skipping appointments seeding.");
            return;
        }

        if (context.Appointments.Count(a => a.PatientId == patient.Id) >= 200)
        {
            return; // Already seeded enough
        }

        var clinics = context.Clinics
            .Include(c => c.HealthcareProviders)
            .Include(c => c.Services)
            .ToList();
            
        if (clinics.Count == 0)
        {
            Console.WriteLine("[DbSeeder] No clinics found. Skipping appointments seeding.");
            return;
        }

        var now = DateTime.UtcNow;

        // Ensure ALL clinics have a Free service
        bool newServicesAdded = false;
        foreach (var clinic in clinics)
        {
            if (!clinic.Services.Any(s => s.Price == 0 || s.Name.ToLower().Contains("free")))
            {
                var freeService = new ClinicService
                {
                    Id = Guid.NewGuid(),
                    ClinicId = clinic.Id,
                    Name = "Free Consultation",
                    Description = "A complimentary free consultation.",
                    DurationMinutes = 15,
                    Price = 0.00m,
                    IsActive = true,
                    DisplayOrder = 0,
                    CreatedAt = now,
                    UpdatedAt = now
                };
                context.Set<ClinicService>().Add(freeService);
                clinic.Services.Add(freeService);
                newServicesAdded = true;
            }
        }
        if (newServicesAdded)
        {
            context.SaveChanges();
            Console.WriteLine("[DbSeeder] Added missing Free Consultation services to existing clinics.");
        }

        var rnd = new Random(12345);
        var fallbackServiceTypes = new[] { "General Consultation", "Dental Cleaning", "Follow-up", "Annual Checkup", "Vaccination", "Cardiology Review", "Dermatology Screen" };
        var chiefComplaints = new[] { 
            "Persistent headache for 3 days", 
            "Annual physical checkup", 
            "Toothache in lower left jaw", 
            "Skin rash on right arm", 
            "Routine follow-up on blood pressure", 
            "Mild fever and cough", 
            "Chest pain after exercise", 
            "Allergy symptoms flaring up", 
            "Knee joint pain", 
            "Stomach ache after meals" 
        };
        var notesList = new[] {
            "Patient reported symptoms started recently. Advised to bring previous lab results.",
            "Routine visit. No special prep needed.",
            "Patient is allergic to penicillin. Alerted pharmacy.",
            "Discuss recent dietary changes and impact on health.",
            "Please ensure patient signs the updated consent forms at the front desk.",
            "Follow-up required from the specialist visit last month."
        };

        var appointments = new List<Appointment>();

        for (int i = 0; i < 200; i++)
        {
            var clinic = clinics[rnd.Next(clinics.Count)];
            var clinicProviders = clinic.HealthcareProviders.ToList();
            var provider = clinicProviders.Count > 0 ? clinicProviders[rnd.Next(clinicProviders.Count)] : null;
            
            var clinicServices = clinic.Services.ToList();
            var service = clinicServices.Count > 0 ? clinicServices[rnd.Next(clinicServices.Count)] : null;
            var serviceType = service?.Name ?? fallbackServiceTypes[rnd.Next(fallbackServiceTypes.Length)];
            var durationMinutes = service?.DurationMinutes ?? (rnd.Next(1, 5) * 15);
            
            // Random date between 30 days ago and 30 days in the future
            var daysOffset = rnd.Next(-30, 31);
            var hoursOffset = rnd.Next(8, 18); // 8 AM to 5 PM
            var scheduledAt = now.Date.AddDays(daysOffset).AddHours(hoursOffset);
            
            // Determine logical status based on date
            AppointmentStatus status;
            if (scheduledAt < now)
            {
                // Past appointments are mostly completed or canceled/no-show
                var pastStatuses = new[] { AppointmentStatus.Completed, AppointmentStatus.Completed, AppointmentStatus.Completed, AppointmentStatus.Cancelled, AppointmentStatus.NoShow };
                status = pastStatuses[rnd.Next(pastStatuses.Length)];
            }
            else
            {
                // Future appointments are mostly confirmed or pending
                var futureStatuses = new[] { AppointmentStatus.Confirmed, AppointmentStatus.Confirmed, AppointmentStatus.Pending };
                status = futureStatuses[rnd.Next(futureStatuses.Length)];
            }

            appointments.Add(new Appointment
            {
                Id = Guid.NewGuid(),
                PatientId = patient.Id,
                ClinicId = clinic.Id,
                ProviderId = provider?.Id ?? Guid.NewGuid(),
                Subject = provider?.Name ?? "Dr. Unassigned",
                ServiceType = serviceType,
                ScheduledAt = scheduledAt,
                DurationMinutes = durationMinutes, // 15, 30, 45, 60
                Status = status,
                ChiefComplaint = chiefComplaints[rnd.Next(chiefComplaints.Length)],
                Notes = notesList[rnd.Next(notesList.Length)] + $" (Mock Ref: {i + 1})",
                CreatedAt = now,
                CreatedBy = "seeder",
                UpdatedAt = now,
                UpdatedBy = "seeder"
            });
        }

        context.Appointments.AddRange(appointments);
        context.SaveChanges();

        Console.WriteLine($"[DbSeeder] Successfully seeded {appointments.Count} random appointments for test patient.");
    }
}
