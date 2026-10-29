using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>Clinic-side fixtures: what a clinic's staff would already have entered before ordering or prescribing.</summary>
public static class ClinicSeed
{
    public static async Task<ClinicEz.Clinic.Domain.Entities.Patient> PatientAsync(ClinicHost clinic, Fac facility, Guid? syncPatientId, string first = "Maria", string last = "Santos")
    {
        var patient = new ClinicEz.Clinic.Domain.Entities.Patient
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            ClinicId = facility.Id,
            PatientCode = $"PAT-{Guid.NewGuid().ToString("N")[..6]}",
            FirstName = first,
            LastName = last,
            ContactNumber = "0917-123-4567",
            DateOfBirth = new DateOnly(1984, 3, 12),
            Gender = Gender.Female,
            CloudPatientId = syncPatientId
        };
        await clinic.DbAsync(async db =>
        {
            db.Patients.Add(patient);
            await db.SaveChangesAsync();
            return 0;
        });
        return patient;
    }

    public static async Task<StaffMember> DoctorAsync(ClinicHost clinic, Fac facility)
    {
        var doctor = new StaffMember
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            ClinicId = facility.Id,
            FirstName = "Ana",
            LastName = "Cruz",
            Title = "Dr.",
            Role = StaffRole.Doctor,
            PrcLicenseNumber = "0123456",
            Specialty = "Internal Medicine"
        };
        await clinic.DbAsync(async db =>
        {
            db.StaffMembers.Add(doctor);
            await db.SaveChangesAsync();
            return 0;
        });
        return doctor;
    }

    /// <summary>A consultation ready to be signed, with one prescribed medicine.</summary>
    public static async Task<ConsultationEncounter> EncounterWithPrescriptionAsync(
        ClinicHost clinic, Fac facility, ClinicEz.Clinic.Domain.Entities.Patient patient, StaffMember doctor, string genericName = "Paracetamol", int quantity = 10)
    {
        var encounter = new ConsultationEncounter
        {
            Id = Guid.NewGuid(),
            TenantId = facility.Tenant,
            ClinicId = facility.Id,
            PatientId = patient.Id,
            PatientName = $"{patient.FirstName} {patient.LastName}",
            DoctorId = doctor.Id,
            DoctorName = $"{doctor.Title} {doctor.FirstName} {doctor.LastName}",
            EncounterDate = DateTime.UtcNow,
            Assessment = "Fever",
            Plan = "Rest and fluids",
            Prescriptions =
            [
                new PrescriptionItem
                {
                    Id = Guid.NewGuid(),
                    GenericName = genericName,
                    Dosage = "500mg",
                    Form = "Tablet",
                    Sig = "1 tablet every 6 hours",
                    Quantity = quantity,
                    DurationDays = 3
                }
            ]
        };
        await clinic.DbAsync(async db =>
        {
            db.Consultations.Add(encounter);
            await db.SaveChangesAsync();
            return 0;
        });
        return encounter;
    }
}
