using Microsoft.EntityFrameworkCore;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Interfaces;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Persistence.Repositories;

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
            .Include(p => p.Allergies)
            .Include(p => p.Medications)
            .Include(p => p.SurgicalHistories)
            .Include(p => p.PastIllnesses)
            .Include(p => p.ChronicConditions)
            .Include(p => p.FamilyHistories)
            .Include(p => p.SocialHistory)
            .Include(p => p.ObstetricProfile)
            .Include(p => p.MentalHealthProfile)
            .FirstOrDefaultAsync(p => p.Id == id, cancellationToken);
}
