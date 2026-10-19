using ClinicEz.Patient.Domain.Entities;
using PatientEntity = ClinicEz.Patient.Domain.Entities.Patient;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>Patient-app-side fixtures: a patient who has signed up in the ClinicEZ patient app.</summary>
public static class PatientSeed
{
    public static async Task<Guid> AccountAsync(PatientHost patients, string first = "Maria", string last = "Santos", string? allergy = null)
    {
        var id = Guid.NewGuid();
        var patient = new PatientEntity
        {
            Id = id,
            ClerkUserId = $"clerk_{id:N}",
            ClinicEzId = $"CE-{id.ToString("N")[..4].ToUpperInvariant()}-{id.ToString("N")[4..8].ToUpperInvariant()}",
            FirstName = first,
            LastName = last,
            DateOfBirth = new DateOnly(1984, 3, 12),
            Mobile = "0917-555-0199"
        };
        if (allergy is not null) patient.Allergies.Add(new PatientAllergy { Id = Guid.NewGuid(), PatientId = id, AllergenName = allergy });

        await patients.DbAsync(async db =>
        {
            db.Patients.Add(patient);
            await db.SaveChangesAsync();
            return 0;
        });
        return id;
    }
}
