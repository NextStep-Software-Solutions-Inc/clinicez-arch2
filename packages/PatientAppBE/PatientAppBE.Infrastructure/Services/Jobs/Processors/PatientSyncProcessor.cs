using System.Text.Json;
using PatientAppBE.Application.Common.Constants;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Domain.Interfaces;
using PatientAppBE.Infrastructure.Services.Jobs;

namespace PatientAppBE.Infrastructure.Services.Jobs.Processors;

public sealed class PatientSyncProcessor : ISyncEntityProcessor
{
    private readonly IPatientRepository _patientRepository;

    private static readonly JsonSerializerOptions JsonOptions =
        new() { PropertyNameCaseInsensitive = true };

    public PatientSyncProcessor(IPatientRepository patientRepository)
        => _patientRepository = patientRepository;

    public string EntityType => SyncableEntityTypes.Patient;

    public async Task<SyncProcessResult> ProcessAsync(SyncLog log, CancellationToken ct)
    {
        if (log.Operation == SyncOperation.Delete)
        {
            if (!log.EntityId.HasValue)
                return SyncProcessResult.Rejected("EntityId is required for Delete operations.");

            var toDelete = await _patientRepository.GetByIdAsync(log.EntityId.Value, ct);
            if (toDelete is null) return SyncProcessResult.Success(); // Idempotent

            _patientRepository.Delete(toDelete);
            return SyncProcessResult.Success();
        }

        if (string.IsNullOrWhiteSpace(log.PayloadJson))
            return SyncProcessResult.Rejected("PayloadJson is required for Create and Update operations.");

        var payload = JsonSerializer.Deserialize<PatientSyncPayload>(log.PayloadJson, JsonOptions);
        if (payload is null)
            return SyncProcessResult.Rejected("Failed to deserialize Patient payload.");

        if (log.Operation == SyncOperation.Create)
        {
            // Idempotency: if a patient with this ClerkUserId already exists, treat as applied
            if (!string.IsNullOrWhiteSpace(payload.ClerkUserId))
            {
                var existing = await _patientRepository.GetByClerkUserIdAsync(payload.ClerkUserId, ct);
                if (existing is not null)
                {
                    log.EntityId = existing.Id;
                    return SyncProcessResult.Success();
                }
            }

            var patient = MapToEntity(payload);
            await _patientRepository.AddAsync(patient, ct);
            log.EntityId = patient.Id;
            return SyncProcessResult.Success();
        }

        if (log.Operation == SyncOperation.Update)
        {
            Patient? patient = null;

            if (log.EntityId.HasValue)
                patient = await _patientRepository.GetByIdAsync(log.EntityId.Value, ct);

            if (patient is null && !string.IsNullOrWhiteSpace(payload.ClerkUserId))
                patient = await _patientRepository.GetByClerkUserIdAsync(payload.ClerkUserId, ct);

            if (patient is null)
                return SyncProcessResult.Conflict("Patient no longer exists on the server.");

            // Last-Write-Wins: client wins only if its timestamp is >= the server's last update
            var serverTimestamp = patient.UpdatedAt ?? patient.CreatedAt;
            if (payload.UpdatedAt < serverTimestamp)
            {
                return SyncProcessResult.Conflict(
                    $"Server version is newer. Client={payload.UpdatedAt:O}, Server={serverTimestamp:O}. Server version retained.");
            }

            ApplyUpdate(patient, payload);
            _patientRepository.Update(patient);
            log.EntityId = patient.Id;
            return SyncProcessResult.Success();
        }

        return SyncProcessResult.Rejected($"Unsupported operation: {log.Operation}");
    }

    private static Patient MapToEntity(PatientSyncPayload p) => new()
    {
        ClientId = p.ClientId,
        ClerkUserId = p.ClerkUserId,
        FirstName = p.FirstName,
        MiddleName = p.MiddleName,
        LastName = p.LastName,
        Suffix = p.Suffix,
        Sex = Enum.TryParse<SexType>(p.Sex, true, out var sex) ? sex : null,
        DateOfBirth = p.DateOfBirth,
        PlaceOfBirth = p.PlaceOfBirth,
        CivilStatus = Enum.TryParse<CivilStatus>(p.CivilStatus, true, out var cs) ? cs : null,
        BloodType = Enum.TryParse<BloodType>(p.BloodType, true, out var bt) ? bt : null,
        Nationality = p.Nationality,
        Ethnicity = p.Ethnicity,
        Religion = p.Religion,
        PrimaryLanguage = p.PrimaryLanguage,
        EducationLevel = Enum.TryParse<EducationLevel>(p.EducationLevel, true, out var el) ? el : null,
        Mobile = p.Mobile,
        AltPhone = p.AltPhone,
        Email = p.Email,
        MessengerHandle = p.MessengerHandle,
        ConsentToShareInfo = p.ConsentToShareInfo,
    };

    private static void ApplyUpdate(Patient patient, PatientSyncPayload p)
    {
        patient.FirstName = p.FirstName;
        patient.MiddleName = p.MiddleName;
        patient.LastName = p.LastName;
        patient.Suffix = p.Suffix;
        patient.Sex = Enum.TryParse<SexType>(p.Sex, true, out var sex) ? sex : null;
        patient.DateOfBirth = p.DateOfBirth;
        patient.PlaceOfBirth = p.PlaceOfBirth;
        patient.CivilStatus = Enum.TryParse<CivilStatus>(p.CivilStatus, true, out var cs) ? cs : null;
        patient.BloodType = Enum.TryParse<BloodType>(p.BloodType, true, out var bt) ? bt : null;
        patient.Nationality = p.Nationality;
        patient.Ethnicity = p.Ethnicity;
        patient.Religion = p.Religion;
        patient.PrimaryLanguage = p.PrimaryLanguage;
        patient.EducationLevel = Enum.TryParse<EducationLevel>(p.EducationLevel, true, out var el) ? el : null;
        patient.Mobile = p.Mobile;
        patient.AltPhone = p.AltPhone;
        patient.Email = p.Email;
        patient.MessengerHandle = p.MessengerHandle;
        patient.ConsentToShareInfo = p.ConsentToShareInfo;
    }
}
