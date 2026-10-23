using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Infrastructure.Persistence;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace ClinicEz.Clinic.Infrastructure.Messaging;

/// <summary>
/// Completes a scan-to-fetch import (<c>patient.share.snapshot</c>). The import is found only by the envelope correlation id
/// of the redeem request this clinic made, so an unsolicited or replayed snapshot has nothing to attach to. Only the scopes
/// the patient granted are applied; the chart is matched by ClinicEZ ID, then by the patient-plane id, and a new chart
/// needs the demographics scope.
/// </summary>
public sealed class PatientShareSnapshotHandler : IInteropHandler<PatientShareSnapshotPayload>
{
    private const string AllergyKind = "allergy";
    private const string ConditionKind = "condition";

    private static readonly IReadOnlyDictionary<string, SharingScopes> KindScopes =
        new Dictionary<string, SharingScopes>(StringComparer.OrdinalIgnoreCase)
        {
            [AllergyKind] = SharingScopes.Allergies,
            ["medication"] = SharingScopes.Medications,
            [ConditionKind] = SharingScopes.Conditions,
            ["immunization"] = SharingScopes.Immunizations,
            ["labResult"] = SharingScopes.LabResults,
            ["prescription"] = SharingScopes.Prescriptions,
            ["vital"] = SharingScopes.Vitals
        };

    private readonly ApplicationDbContext _dbContext;
    private readonly ClinicRecipientResolver _recipient;
    private readonly ILogger<PatientShareSnapshotHandler> _logger;

    public PatientShareSnapshotHandler(
        ApplicationDbContext dbContext,
        ClinicRecipientResolver recipient,
        ILogger<PatientShareSnapshotHandler> logger)
    {
        _dbContext = dbContext;
        _recipient = recipient;
        _logger = logger;
    }

    public async Task HandleAsync(PatientShareSnapshotPayload message, InteropMessageContext context, CancellationToken ct)
    {
        var clinic = await _recipient.ResolveAsync(context, ct);
        if (clinic == null) return;

        if (!IsPatientPlane(context.From, message))
        {
            Ignore(context, "the sender is not the patient plane");
            return;
        }

        var import = await _dbContext.ShareImports
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(i => !i.IsDeleted && i.ClinicId == clinic.ClinicId && i.Id == context.CorrelationId, ct);
        if (import == null)
        {
            Ignore(context, $"no import {context.CorrelationId} was requested by clinic {clinic.ClinicId}");
            return;
        }

        if (import.Status != ShareImportStatus.Pending)
        {
            Ignore(context, $"import {import.Id} is already {import.Status}");
            return;
        }

        var now = DateTime.UtcNow;

        if (!message.Granted)
        {
            import.Status = ShareImportStatus.Denied;
            import.DenialCode = message.DenialCode;
            import.DenialReason = string.IsNullOrWhiteSpace(message.DenialReason)
                ? "The patient did not grant access."
                : message.DenialReason;
            import.CompletedAt = now;
            import.UpdatedAt = now;
            await _dbContext.SaveChangesAsync(ct);
            _logger.LogInformation("[ClinicEz.Clinic] Share import {ImportId} was denied.", import.Id);
            return;
        }

        var patient = await FindPatientAsync(clinic.ClinicId, message, ct);
        var demographicsShared = message.Scopes.HasFlag(SharingScopes.Demographics) && message.Demographics != null;

        if (patient == null && !demographicsShared)
        {
            import.Status = ShareImportStatus.Failed;
            import.DenialReason = "The patient is new to this clinic and did not share their demographics, so a chart cannot be created.";
            import.CompletedAt = now;
            import.UpdatedAt = now;
            await _dbContext.SaveChangesAsync(ct);
            _logger.LogWarning("[ClinicEz.Clinic] Share import {ImportId} failed: no demographics for a new patient.", import.Id);
            return;
        }

        if (patient == null)
        {
            patient = NewPatient(clinic.TenantId, clinic.ClinicId, message.Demographics!, message.PatientId, now);
            await _dbContext.Patients.AddAsync(patient, ct);
        }
        else if (demographicsShared)
        {
            MergeDemographics(patient, message.Demographics!);
        }

        patient.SyncPatientId = message.PatientId;
        if (!string.IsNullOrWhiteSpace(message.ClinicEzId))
        {
            patient.ClinicEzId = message.ClinicEzId.Trim();
        }
        patient.ShareGrantId = message.GrantId;
        patient.ShareGrantScopes = message.Scopes;
        patient.ShareGrantExpiresAt = message.ExpiresAtUtc;
        patient.UpdatedAt = now;

        var items = message.Items.Where(i => IsGranted(i, message.Scopes)).ToList();
        MergeList(items, AllergyKind, patient.Allergies, v => patient.Allergies = v);
        MergeList(items, ConditionKind, patient.ChronicConditions, v => patient.ChronicConditions = v);

        var kept = items.Where(i => !IsMergedKind(i.Kind)).ToList();

        import.Status = ShareImportStatus.Imported;
        import.ClinicPatientId = patient.Id;
        import.PatientName = DisplayName(patient);
        import.ClinicEzId = patient.ClinicEzId;
        import.GrantId = message.GrantId;
        import.Scopes = message.Scopes;
        import.GrantExpiresAt = message.ExpiresAtUtc;
        import.ItemsImported = items.Count + (demographicsShared ? 1 : 0);
        import.RedemptionNumber = message.RedemptionNumber > 0 ? message.RedemptionNumber : null;
        import.MaxRedemptions = message.MaxRedemptions > 0 ? message.MaxRedemptions : null;
        import.IsRefresh = message.IsRefresh;
        import.ItemsJson = kept.Count == 0 ? null : JsonSerializer.Serialize(kept);
        import.CompletedAt = now;
        import.UpdatedAt = now;

        if (import.AddToQueue)
        {
            var queueItem = await QueuePatientAsync(clinic, patient, import, now, ct);
            import.QueueItemId = queueItem.Id;
            import.QueueNumber = queueItem.QueueNumber;
        }

        await _dbContext.SaveChangesAsync(ct);

        _logger.LogInformation("[ClinicEz.Clinic] Share import {ImportId} completed for clinic patient {PatientId} ({Count} items).",
            import.Id, patient.Id, import.ItemsImported);
    }

    private async Task<ClinicPatient?> FindPatientAsync(Guid clinicId, PatientShareSnapshotPayload message, CancellationToken ct)
    {
        var patients = _dbContext.Patients.IgnoreQueryFilters().Where(p => !p.IsDeleted && p.ClinicId == clinicId);

        if (!string.IsNullOrWhiteSpace(message.ClinicEzId))
        {
            var clinicEzId = message.ClinicEzId.Trim();
            var byClinicEzId = await patients.FirstOrDefaultAsync(p => p.ClinicEzId == clinicEzId, ct);
            if (byClinicEzId != null) return byClinicEzId;
        }

        return await patients.FirstOrDefaultAsync(p => p.SyncPatientId == message.PatientId, ct);
    }

    private static bool IsPatientPlane(Party from, PatientShareSnapshotPayload message)
    {
        if (from.Kind == PartyKind.ControlPlane)
        {
            return string.Equals(from.Service, InteropServices.Patient, StringComparison.OrdinalIgnoreCase) && !message.Granted;
        }

        return from.Kind == PartyKind.Patient
            && message.PatientId != Guid.Empty
            && string.Equals(from.PatientId, message.PatientId.ToString(), StringComparison.OrdinalIgnoreCase);
    }

    private static bool IsGranted(ShareItemDto item, SharingScopes granted) =>
        KindScopes.TryGetValue(item.Kind, out var scope) && granted.HasFlag(scope);

    private static bool IsMergedKind(string kind) =>
        string.Equals(kind, AllergyKind, StringComparison.OrdinalIgnoreCase)
        || string.Equals(kind, ConditionKind, StringComparison.OrdinalIgnoreCase);

    private static void MergeList(IEnumerable<ShareItemDto> items, string kind, string? current, Action<string?> assign)
    {
        var incoming = items
            .Where(i => string.Equals(i.Kind, kind, StringComparison.OrdinalIgnoreCase) && !string.IsNullOrWhiteSpace(i.Name))
            .Select(i => i.Name.Trim())
            .ToList();
        if (incoming.Count == 0) return;

        var merged = (current ?? string.Empty)
            .Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .ToList();
        foreach (var name in incoming)
        {
            if (!merged.Contains(name, StringComparer.OrdinalIgnoreCase))
            {
                merged.Add(name);
            }
        }

        assign(string.Join(", ", merged));
    }

    private static ClinicPatient NewPatient(string tenantId, Guid clinicId, ShareDemographicsDto demographics, Guid patientPlaneId, DateTime now)
    {
        var (first, last) = SplitName(demographics.FullName);

        var customFields = new Dictionary<string, object?>();
        var address = Clean(demographics.Address);
        if (!string.IsNullOrWhiteSpace(address))
        {
            customFields["primary_address_line"] = address;
        }

        return new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = tenantId,
            ClinicId = clinicId,
            PatientCode = $"PAT-EXT-{now:yyyyMMdd}-{patientPlaneId.ToString("N")[..6].ToUpperInvariant()}",
            FirstName = first,
            LastName = last,
            DateOfBirth = ParseDate(demographics.DateOfBirth) ?? new DateOnly(2000, 1, 1),
            Gender = NormalizeGender(demographics.Sex),
            ContactNumber = !string.IsNullOrWhiteSpace(demographics.MobileNumber) ? demographics.MobileNumber.Trim() : "N/A",
            Email = Clean(demographics.Email),
            PhilHealthNumber = Clean(demographics.PhilHealthPin),
            CustomFields = customFields,
            CreatedAt = now,
            CreatedBy = "System:PatientShareImport"
        };
    }

    private static void MergeDemographics(ClinicPatient patient, ShareDemographicsDto demographics)
    {
        if (!string.IsNullOrWhiteSpace(demographics.MobileNumber)) patient.ContactNumber = demographics.MobileNumber.Trim();
        if (!string.IsNullOrWhiteSpace(demographics.Email)) patient.Email = demographics.Email.Trim();

        patient.CustomFields ??= new Dictionary<string, object?>();
        var cleanAddress = Clean(demographics.Address);
        if (!string.IsNullOrWhiteSpace(cleanAddress) &&
            (!patient.CustomFields.TryGetValue("primary_address_line", out var existing) ||
             existing == null ||
             string.IsNullOrWhiteSpace(existing.ToString())))
        {
            patient.CustomFields["primary_address_line"] = cleanAddress;
        }

        if (string.IsNullOrWhiteSpace(patient.PhilHealthNumber)) patient.PhilHealthNumber = Clean(demographics.PhilHealthPin);
    }

    private async Task<QueueItem> QueuePatientAsync(ClinicSettings clinic, ClinicPatient patient, ShareImport import, DateTime now, CancellationToken ct)
    {
        var today = DateOnly.FromDateTime(now);
        var lastSequence = await _dbContext.QueueItems
            .IgnoreQueryFilters()
            .Where(q => !q.IsDeleted && q.ClinicId == clinic.ClinicId && q.QueueDate == today)
            .MaxAsync(q => (int?)q.SequenceNumber, ct) ?? 0;

        var sequence = lastSequence + 1;
        var queueItem = new QueueItem
        {
            Id = Guid.NewGuid(),
            TenantId = clinic.TenantId,
            ClinicId = clinic.ClinicId,
            QueueNumber = $"Q-{sequence:D3}",
            SequenceNumber = sequence,
            QueueDate = today,
            PatientId = patient.Id,
            PatientName = DisplayName(patient),
            Priority = QueuePriority.Routine,
            Status = QueueStatus.Waiting,
            CheckInTime = now,
            ChiefComplaint = import.ChiefComplaint,
            CreatedAt = now,
            CreatedBy = import.RequestedByStaffId?.ToString() ?? "System:PatientShareImport"
        };

        await _dbContext.QueueItems.AddAsync(queueItem, ct);
        return queueItem;
    }

    private static string DisplayName(ClinicPatient patient) => $"{patient.FirstName} {patient.LastName}".Trim();

    private static (string First, string Last) SplitName(string fullName)
    {
        var parts = (fullName ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        return parts.Length switch
        {
            0 => ("Patient", "Unknown"),
            1 => (parts[0], parts[0]),
            _ => (parts[0], parts[^1])
        };
    }

    private static DateOnly? ParseDate(string? value) =>
        DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var date) ? date : null;

    private static string NormalizeGender(string? sex) => sex?.Trim().ToLowerInvariant() switch
    {
        "male" or "m" => "Male",
        "female" or "f" => "Female",
        _ => "Other"
    };

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private void Ignore(InteropMessageContext context, string reason) =>
        _logger.LogWarning("[ClinicEz.Clinic] Ignoring {Type} message {MessageId}: {Reason}.", context.Type, context.MessageId, reason);
}
