using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Persistence.Repositories;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

public sealed class PatientRepository : BaseRepository<Patient>, IPatientRepository
{
    public PatientRepository(ApplicationDbContext context) : base(context) { }

    public Task<Patient?> GetByClerkUserIdAsync(string clerkUserId, CancellationToken cancellationToken = default)
        => Context.Patients
            .FirstOrDefaultAsync(p => p.ClerkUserId == clerkUserId, cancellationToken);

    public Task<Patient?> GetWithProfileAsync(Guid id, CancellationToken cancellationToken = default)
        => Context.Patients
            .Include(p => p.GovernmentIds)
            .Include(p => p.Addresses)
            .Include(p => p.EmergencyContacts)
            .Include(p => p.HealthcareProviders)
            .Include(p => p.Allergies)
            .Include(p => p.Medications)
            .Include(p => p.SurgicalHistories)
            .Include(p => p.PastIllnesses)
            .Include(p => p.ChronicConditions)
            .Include(p => p.FamilyHistories)
            .Include(p => p.ImmunizationsSelf)
            .Include(p => p.Disabilities)
            .Include(p => p.TravelHistories)
            .Include(p => p.ContraceptiveHistories)
            .Include(p => p.Pregnancies)
            .Include(p => p.SocialHistory)
            .Include(p => p.Occupation)
            .Include(p => p.ObstetricProfile)
            .Include(p => p.MaleReproductive)
            .Include(p => p.DentalVision)
            .Include(p => p.MentalHealthProfile)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
}
