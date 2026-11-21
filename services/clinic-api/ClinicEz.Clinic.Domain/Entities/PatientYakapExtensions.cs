using System;
using System.Collections.Generic;
using System.Linq;
using ClinicEz.Clinic.Domain.Enums;

namespace ClinicEz.Clinic.Domain.Entities;

/// <summary>
/// Domain extension methods for Patient providing safe query, mutation,
/// and statutory lifecycle guarding of pure 1NF relational PatientYakapEnlistments.
/// </summary>
public static class PatientYakapExtensions
{
    /// <summary>
    /// Safely extracts all active and historical YAKAP enlistments from Patient.YakapEnlistments collection.
    /// Returns items sorted chronologically by effective year and enlistment date.
    /// </summary>
    public static IReadOnlyList<PatientYakapEnlistment> GetYakapEnlistments(this Patient? patient)
    {
        if (patient?.YakapEnlistments == null || patient.YakapEnlistments.Count == 0)
        {
            return Array.Empty<PatientYakapEnlistment>();
        }

        return patient.YakapEnlistments
            .Where(e => !e.IsDeleted)
            .OrderBy(e => e.EffectiveYear)
            .ThenBy(e => e.EnlistmentDate)
            .ToList();
    }

    /// <summary>
    /// Replaces the patient's YAKAP enlistments with the provided collection,
    /// enforcing chronological sorting by effective year and enlistment date.
    /// </summary>
    public static void SetYakapEnlistments(this Patient patient, IEnumerable<PatientYakapEnlistment>? enlistments)
    {
        ArgumentNullException.ThrowIfNull(patient);
        patient.YakapEnlistments = enlistments?
            .Where(e => !e.IsDeleted)
            .OrderBy(e => e.EffectiveYear)
            .ThenBy(e => e.EnlistmentDate)
            .ToList() ?? new List<PatientYakapEnlistment>();
    }

    /// <summary>
    /// Adds a new annual YAKAP enlistment or updates an existing benefit-year entry,
    /// strictly preserving all historical entries from prior years in chronological order.
    /// Retains already assigned control numbers (CaseNo, SelectionControlNumber, YesReferenceNo, ProfilingTransNo)
    /// if updating an existing year unless explicitly replaced.
    /// </summary>
    public static void AddOrRenewYakapEnlistment(this Patient patient, PatientYakapEnlistment newEnlistment)
    {
        ArgumentNullException.ThrowIfNull(patient);
        ArgumentNullException.ThrowIfNull(newEnlistment);

        patient.YakapEnlistments ??= new List<PatientYakapEnlistment>();

        var effYear = newEnlistment.EffectiveYear;
        if (effYear <= 0)
        {
            effYear = newEnlistment.EnlistmentDate != default ? newEnlistment.EnlistmentDate.Year : DateTime.UtcNow.Year;
            newEnlistment.EffectiveYear = effYear;
        }

        if (newEnlistment.EnlistmentDate == default)
        {
            newEnlistment.EnlistmentDate = new DateOnly(effYear, 1, 1);
        }

        if (newEnlistment.ValidUntil == default)
        {
            newEnlistment.ValidUntil = new DateOnly(effYear, 12, 31);
        }

        var existing = patient.YakapEnlistments.FirstOrDefault(e => e.EffectiveYear == effYear && !e.IsDeleted);
        if (existing != null)
        {
            existing.Status = newEnlistment.Status;
            existing.Source = newEnlistment.Source;
            existing.PackageType = newEnlistment.PackageType;
            existing.EnlistmentDate = newEnlistment.EnlistmentDate;
            existing.ValidUntil = newEnlistment.ValidUntil;
            if (!string.IsNullOrWhiteSpace(newEnlistment.CaseNo)) existing.CaseNo = newEnlistment.CaseNo;
            if (!string.IsNullOrWhiteSpace(newEnlistment.ProfilingTransNo)) existing.ProfilingTransNo = newEnlistment.ProfilingTransNo;
            if (newEnlistment.ProfilingDate.HasValue) existing.ProfilingDate = newEnlistment.ProfilingDate;
            if (!string.IsNullOrWhiteSpace(newEnlistment.ProfilingAtc)) existing.ProfilingAtc = newEnlistment.ProfilingAtc;
            if (newEnlistment.SuspendedAt.HasValue) existing.SuspendedAt = newEnlistment.SuspendedAt;
            if (!string.IsNullOrWhiteSpace(newEnlistment.SuspensionReason)) existing.SuspensionReason = newEnlistment.SuspensionReason;
            if (newEnlistment.TransferredAt.HasValue) existing.TransferredAt = newEnlistment.TransferredAt;
            if (!string.IsNullOrWhiteSpace(newEnlistment.TransferredToPmcc)) existing.TransferredToPmcc = newEnlistment.TransferredToPmcc;
            if (!string.IsNullOrWhiteSpace(newEnlistment.Remarks)) existing.Remarks = newEnlistment.Remarks;
        }
        else
        {
            newEnlistment.PatientId = patient.Id;
            newEnlistment.Patient = patient;
            newEnlistment.ClinicId = patient.ClinicId;
            newEnlistment.TenantId = patient.TenantId;
            patient.YakapEnlistments.Add(newEnlistment);
        }
    }

    /// <summary>
    /// Retrieves the active YAKAP enlistment covering the given reference date.
    /// Returns null if no active entry covers the date.
    /// </summary>
    public static PatientYakapEnlistment? GetActiveYakapEnlistment(this Patient? patient, DateOnly referenceDate)
    {
        if (patient?.YakapEnlistments == null) return null;
        return patient.YakapEnlistments.FirstOrDefault(e =>
            !e.IsDeleted &&
            e.Status.IsUsableActiveStatus() &&
            e.IsCoveringDate(referenceDate));
    }

    /// <summary>
    /// Overload for DateTime.
    /// </summary>
    public static PatientYakapEnlistment? GetActiveYakapEnlistment(this Patient? patient, DateTime referenceDate)
    {
        return patient.GetActiveYakapEnlistment(DateOnly.FromDateTime(referenceDate));
    }

    /// <summary>
    /// Returns true if the patient has an active enlistment covering the reference date.
    /// </summary>
    public static bool HasActiveYakapEnlistment(this Patient? patient, DateOnly referenceDate)
    {
        return patient.GetActiveYakapEnlistment(referenceDate) != null;
    }

    /// <summary>
    /// Overload for DateTime.
    /// </summary>
    public static bool HasActiveYakapEnlistment(this Patient? patient, DateTime referenceDate)
    {
        return patient.HasActiveYakapEnlistment(DateOnly.FromDateTime(referenceDate));
    }

    /// <summary>
    /// Returns the most recent enlistment for the patient regardless of active status.
    /// </summary>
    public static PatientYakapEnlistment? GetLatestYakapEnlistment(this Patient? patient)
    {
        return patient?.YakapEnlistments?
            .Where(e => !e.IsDeleted)
            .OrderByDescending(e => e.EffectiveYear)
            .ThenByDescending(e => e.EnlistmentDate)
            .FirstOrDefault();
    }

    /// <summary>
    /// Returns true if the patient has any non-deleted enlistment record on file.
    /// </summary>
    public static bool HasEverEnlistedInYakap(this Patient? patient)
    {
        return patient?.YakapEnlistments?.Any(e => !e.IsDeleted) == true;
    }

    /// <summary>
    /// Enforces the statutory Strict No-Auto-Renewal Guard for journey number allocation.
    /// Resolves the active enlistment covering the reference date, or throws an InvalidOperationException
    /// with an exact statutory error message if the enlistment is missing, expired, or transferred.
    /// </summary>
    public static PatientYakapEnlistment ResolveActiveEnlistmentOrThrow(
        this Patient patient,
        DateOnly referenceDate,
        int? effectiveYear = null)
    {
        ArgumentNullException.ThrowIfNull(patient);

        var list = patient.GetYakapEnlistments();
        if (list.Count == 0)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd}. An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        var targetYear = effectiveYear ?? referenceDate.Year;

        // Check for transferred entry matching benefit year or covering reference date
        var transferred = list.FirstOrDefault(e =>
            e.Status == YakapEnlistmentStatus.Transferred &&
            (e.EffectiveYear == targetYear || e.IsCoveringDate(referenceDate)));

        if (transferred != null)
        {
            throw new InvalidOperationException(
                $"Patient PhilHealth YAKAP enlistment for benefit year {transferred.EffectiveYear} is marked as Transferred. Cannot assign journey numbers.");
        }

        // 1. Check for entry actively covering referenceDate:
        var active = list.FirstOrDefault(e =>
            e.IsActiveOn(referenceDate) &&
            (!effectiveYear.HasValue || e.EffectiveYear == effectiveYear.Value));

        if (active != null)
        {
            return active;
        }

        // 2. Pre-enlistment encounter check:
        var preEnlistment = list.FirstOrDefault(e =>
            (e.EffectiveYear == targetYear || e.EnlistmentDate.Year == referenceDate.Year) &&
            referenceDate < e.EnlistmentDate);

        if (preEnlistment != null)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd}. An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        // 3. Expired encounter check:
        var expiredEntry = list
            .Where(e => e.Status == YakapEnlistmentStatus.Expired || e.ValidUntil < referenceDate)
            .OrderByDescending(e => effectiveYear.HasValue && e.EffectiveYear == effectiveYear.Value ? 1 : 0)
            .ThenByDescending(e => e.EffectiveYear)
            .ThenByDescending(e => e.ValidUntil)
            .FirstOrDefault();

        if (expiredEntry != null)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd} (enlistment expired on {expiredEntry.ValidUntil:yyyy-MM-dd}). An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        throw new InvalidOperationException(
            $"Patient has no active PhilHealth YAKAP enlistment covering the encounter date {referenceDate:yyyy-MM-dd}. An explicit annual renewal must be recorded before assigning journey control numbers.");
    }

    /// <summary>
    /// Resolves active enlistment strictly for the specified benefit year.
    /// </summary>
    public static PatientYakapEnlistment ResolveActiveEnlistmentForYearOrThrow(
        this Patient patient,
        int effectiveYear)
    {
        ArgumentNullException.ThrowIfNull(patient);

        var list = patient.GetYakapEnlistments();
        if (list.Count == 0)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment for benefit year {effectiveYear}. An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        var entry = list.FirstOrDefault(e => e.EffectiveYear == effectiveYear);
        if (entry == null)
        {
            throw new InvalidOperationException(
                $"Patient has no active PhilHealth YAKAP enlistment for benefit year {effectiveYear}. An explicit annual renewal must be recorded before assigning journey control numbers.");
        }

        if (entry.Status == YakapEnlistmentStatus.Transferred)
        {
            throw new InvalidOperationException(
                $"Patient PhilHealth YAKAP enlistment for benefit year {effectiveYear} is marked as Transferred. Cannot assign journey numbers.");
        }

        if (entry.Status == YakapEnlistmentStatus.Expired)
        {
            throw new InvalidOperationException(
                $"Patient PhilHealth YAKAP enlistment for benefit year {effectiveYear} is marked as Expired. Cannot assign journey numbers.");
        }

        if (!entry.Status.IsUsableActiveStatus())
        {
            throw new InvalidOperationException(
                $"Patient PhilHealth YAKAP enlistment for benefit year {effectiveYear} is not Active (status: {entry.Status}). Cannot assign journey numbers.");
        }

        return entry;
    }

    /// <summary>
    /// Overload for DateTime? referenceDate.
    /// </summary>
    public static PatientYakapEnlistment ResolveActiveEnlistmentOrThrow(
        this Patient patient,
        DateTime? referenceDate = null,
        int? effectiveYear = null)
    {
        if (referenceDate.HasValue)
        {
            return patient.ResolveActiveEnlistmentOrThrow(DateOnly.FromDateTime(referenceDate.Value), effectiveYear);
        }

        if (effectiveYear.HasValue)
        {
            return patient.ResolveActiveEnlistmentForYearOrThrow(effectiveYear.Value);
        }

        return patient.ResolveActiveEnlistmentOrThrow(DateOnly.FromDateTime(DateTime.UtcNow));
    }

    /// <summary>
    /// Cancels the enlistment for the specified effective year.
    /// </summary>
    public static void CancelYakapEnlistment(this Patient patient, int effectiveYear, string? reason = null)
    {
        ArgumentNullException.ThrowIfNull(patient);
        var entry = patient.YakapEnlistments?.FirstOrDefault(e => e.EffectiveYear == effectiveYear && !e.IsDeleted);
        if (entry != null)
        {
            entry.Status = YakapEnlistmentStatus.Cancelled;
            if (!string.IsNullOrWhiteSpace(reason))
            {
                entry.Remarks = reason;
            }
        }
    }

    /// <summary>
    /// Suspends the enlistment for the specified effective year.
    /// </summary>
    public static void SuspendYakapEnlistment(this Patient patient, int effectiveYear, string? reason = null)
    {
        ArgumentNullException.ThrowIfNull(patient);
        var entry = patient.YakapEnlistments?.FirstOrDefault(e => e.EffectiveYear == effectiveYear && !e.IsDeleted);
        if (entry != null)
        {
            entry.Status = YakapEnlistmentStatus.Suspended;
            entry.SuspendedAt = DateTime.UtcNow;
            entry.SuspensionReason = reason;
        }
    }

    public static bool IsCoveringDate(this PatientYakapEnlistment enlistment, DateOnly referenceDate)
    {
        if (enlistment == null) return false;
        if (enlistment.EnlistmentDate != default && enlistment.ValidUntil != default)
        {
            return referenceDate >= enlistment.EnlistmentDate && referenceDate <= enlistment.ValidUntil;
        }
        return enlistment.EffectiveYear == referenceDate.Year;
    }

    public static bool IsCoveringDate(this PatientYakapEnlistment enlistment, DateTime referenceDate)
    {
        return enlistment.IsCoveringDate(DateOnly.FromDateTime(referenceDate));
    }

    public static bool IsUsableActiveStatus(this YakapEnlistmentStatus status) =>
        status is YakapEnlistmentStatus.Active
            or YakapEnlistmentStatus.Registered
            or YakapEnlistmentStatus.Verified
            or YakapEnlistmentStatus.ProfilingCompleted
            or YakapEnlistmentStatus.Transmitted;

    public static bool IsActiveOn(this PatientYakapEnlistment enlistment, DateOnly referenceDate)
    {
        if (enlistment == null) return false;
        return !enlistment.IsDeleted &&
               enlistment.Status.IsUsableActiveStatus() &&
               enlistment.IsCoveringDate(referenceDate);
    }

    public static bool IsActiveOn(this PatientYakapEnlistment enlistment, DateTime referenceDate)
    {
        return enlistment.IsActiveOn(DateOnly.FromDateTime(referenceDate));
    }
}
