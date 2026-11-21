using System;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>Where to send a message about one clinic patient: the clinic it comes from and the patient-app account it goes to.</summary>
public sealed record ClinicPatientAddress(Party From, Party To, FacilitySettings Clinic, Guid CloudPatientId)
{
    public Guid SyncPatientId => CloudPatientId;
}

/// <summary>
/// Maps a clinic patient to the patient-app account that receives patient-facing messages. Only patients linked to a
/// patient-app account (<see cref="Patient.CloudPatientId"/>) can be addressed; walk-in patients have no account.
/// </summary>
public sealed class ClinicPatientAddressResolver
{
    private readonly ApplicationDbContext _db;

    public ClinicPatientAddressResolver(ApplicationDbContext db) => _db = db;

    /// <summary>Null when the clinic is not provisioned here, the patient is unknown to the clinic, or has no patient-app account.</summary>
    public async Task<ClinicPatientAddress?> ResolveAsync(Guid clinicId, Guid clinicPatientId, CancellationToken ct)
    {
        var clinic = await _db.Settings
            .IgnoreQueryFilters()
            .AsNoTracking()
            .FirstOrDefaultAsync(s => !s.IsDeleted && s.ClinicId == clinicId, ct);
        if (clinic == null) return null;

        var cloudPatientId = await _db.Patients
            .IgnoreQueryFilters()
            .AsNoTracking()
            .Where(p => !p.IsDeleted && p.ClinicId == clinicId && p.Id == clinicPatientId)
            .Select(p => p.CloudPatientId)
            .FirstOrDefaultAsync(ct);
        if (cloudPatientId is not { } cId || cId == Guid.Empty) return null;

        return new ClinicPatientAddress(
            ClinicParties.Clinic(clinic.TenantId, clinic.ClinicId.ToString()),
            Party.ForPatient(cId.ToString()),
            clinic,
            cId);
    }
}
