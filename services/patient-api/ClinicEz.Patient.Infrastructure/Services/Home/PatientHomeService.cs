using System.Globalization;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Patient.Application.Common.DTOs;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Home;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Home;

public sealed class PatientHomeService(
    ApplicationDbContext db,
    TimeProvider timeProvider) : IPatientHomeService
{
    private static readonly DailyMindfulMomentDto[] WellnessMoments =
    [
        new(
            "hydration-post-lunch",
            "DAILY MINDFUL MOMENT",
            "Hydration check",
            "Hydration check: drinking 500ml water after lunch helps stabilize afternoon energy and supports healthy circulation."),
        new(
            "paced-breathing",
            "DAILY MINDFUL MOMENT",
            "Calm vagal reset",
            "Four slow 4-second breaths before checking blood pressure can lower sympathetic tension and improve reading accuracy."),
        new(
            "post-meal-walk",
            "DAILY MINDFUL MOMENT",
            "Post-meal movement",
            "A gentle 10-minute walk within 30 minutes after meals helps smooth post-prandial blood glucose peaks."),
        new(
            "sleep-anchor",
            "DAILY MINDFUL MOMENT",
            "Consistent wake anchor",
            "Waking within the same 30-minute window daily anchors circadian rhythm and deepens restorative slow-wave sleep."),
        new(
            "medication-pairing",
            "DAILY MINDFUL MOMENT",
            "Routine pairing",
            "Pairing scheduled medications with an existing daily cue like morning tea or brushing teeth strengthens adherence."),
        new(
            "sodium-balance",
            "DAILY MINDFUL MOMENT",
            "Potassium & hydration balance",
            "Pairing whole fruits or leafy greens with water supports healthy vascular tone and steady blood pressure."),
        new(
            "screen-wind-down",
            "DAILY MINDFUL MOMENT",
            "Evening light hygiene",
            "Dimming bright overhead screens 45 minutes before bed supports natural melatonin release and calmer resting heart rate.")
    ];

    public async Task<PatientHomeDashboardDto> GetHomeDashboardAsync(Guid patientId, CancellationToken ct = default)
    {
        var patient = await db.Patients
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == patientId, ct)
            ?? throw new NotFoundException($"Patient '{patientId}' was not found.");

        var utcNow = timeProvider.GetUtcNow().UtcDateTime;
        var today = DateOnly.FromDateTime(utcNow);

        var unreadNotifications = await db.Notifications
            .AsNoTracking()
            .CountAsync(n => n.PatientId == patientId && !n.IsRead, ct);

        var hasAllergies = await db.PatientAllergies.AsNoTracking().AnyAsync(a => a.PatientId == patientId, ct);
        var hasEmergencyContacts = await db.EmergencyContacts.AsNoTracking().AnyAsync(e => e.PatientId == patientId, ct);
        var hasInsurance = await db.PatientGovernmentIds.AsNoTracking().AnyAsync(g => g.PatientId == patientId, ct);
        var hasClinicMembership = await db.ClinicMemberships.AsNoTracking()
            .AnyAsync(m => m.PatientId == patientId && m.Status == ClinicMembershipStatus.Active, ct);

        var healthPass = new PatientHealthPassDto(
            patient.Id,
            patient.ClinicEzId,
            FormatFullName(patient),
            patient.FirstName,
            patient.LastName,
            patient.BloodType?.ToString(),
            FormatBloodGroup(patient.BloodType),
            patient.AvatarUrl,
            unreadNotifications);

        var visitedSteps = ParseVisitedSteps(patient.WelcomeVisitedStepsJson);
        var hasProfileData = patient.BloodType.HasValue || hasAllergies || hasEmergencyContacts;
        var welcomeChecklist = BuildWelcomeChecklistDto(visitedSteps, hasProfileData, hasInsurance, hasClinicMembership);

        var appointmentsSection = await BuildAppointmentsSectionAsync(patientId, utcNow, ct);
        var recentVitals = await BuildRecentVitalsAsync(patientId, ct);
        var todaySchedule = await BuildTodayScheduleInternalAsync(patientId, today, ct);
        var mindfulMoment = SelectMindfulMoment(today);

        return new PatientHomeDashboardDto(
            healthPass,
            welcomeChecklist,
            appointmentsSection,
            recentVitals,
            todaySchedule,
            mindfulMoment);
    }

    public async Task<WelcomeChecklistDto> MarkWelcomeStepVisitedAsync(
        Guid patientId,
        string stepKey,
        CancellationToken ct = default)
    {
        var patient = await db.Patients
            .FirstOrDefaultAsync(p => p.Id == patientId, ct)
            ?? throw new NotFoundException($"Patient '{patientId}' was not found.");

        var normalized = WelcomeStepKeys.Normalize(stepKey);
        if (!WelcomeStepKeys.All.Contains(normalized))
            throw new ValidationException("Invalid welcome step key.");

        var visited = ParseVisitedSteps(patient.WelcomeVisitedStepsJson).ToList();
        if (!visited.Contains(normalized, StringComparer.OrdinalIgnoreCase))
        {
            visited.Add(normalized);
            patient.WelcomeVisitedStepsJson = JsonSerializer.Serialize(visited);
            await db.SaveChangesAsync(ct);
        }

        var hasAllergies = await db.PatientAllergies.AsNoTracking().AnyAsync(a => a.PatientId == patientId, ct);
        var hasEmergencyContacts = await db.EmergencyContacts.AsNoTracking().AnyAsync(e => e.PatientId == patientId, ct);
        var hasInsurance = await db.PatientGovernmentIds.AsNoTracking().AnyAsync(g => g.PatientId == patientId, ct);
        var hasClinicMembership = await db.ClinicMemberships.AsNoTracking()
            .AnyAsync(m => m.PatientId == patientId && m.Status == ClinicMembershipStatus.Active, ct);

        return BuildWelcomeChecklistDto(
            visited,
            patient.BloodType.HasValue || hasAllergies || hasEmergencyContacts,
            hasInsurance,
            hasClinicMembership);
    }

    public async Task<VitalSignsEntryDto> LogPatientVitalsAsync(
        Guid patientId,
        LogPatientVitalsRequestDto request,
        CancellationToken ct = default)
    {
        var exists = await db.Patients.AsNoTracking().AnyAsync(p => p.Id == patientId, ct);
        if (!exists)
            throw new NotFoundException($"Patient '{patientId}' was not found.");

        var recordedAt = request.RecordedAt?.ToUniversalTime() ?? timeProvider.GetUtcNow().UtcDateTime;
        var source = string.IsNullOrWhiteSpace(request.Source) ? "SelfLogged" : request.Source.Trim();

        var entry = new VitalSigns
        {
            Id = Guid.NewGuid(),
            PatientId = patientId,
            ClinicId = Guid.Empty,
            RecordedAt = recordedAt,
            HeartRateBpm = request.HeartRateBpm,
            SystolicBp = request.SystolicBp,
            DiastolicBp = request.DiastolicBp,
            FastingBloodGlucoseMgDl = request.FastingBloodGlucoseMgDl,
            SleepDurationMinutes = request.SleepDurationMinutes,
            DeepSleepMinutes = request.DeepSleepMinutes,
            Source = source,
        };

        db.VitalSigns.Add(entry);
        await db.SaveChangesAsync(ct);

        return new VitalSignsEntryDto(
            entry.Id,
            entry.RecordedAt,
            entry.HeartRateBpm,
            entry.SystolicBp,
            entry.DiastolicBp,
            entry.FastingBloodGlucoseMgDl,
            entry.SleepDurationMinutes,
            entry.DeepSleepMinutes,
            entry.Source);
    }

    public async Task<TodayMedicationScheduleDto> GetTodayMedicationScheduleAsync(Guid patientId, CancellationToken ct = default)
    {
        var exists = await db.Patients.AsNoTracking().AnyAsync(p => p.Id == patientId, ct);
        if (!exists)
            throw new NotFoundException($"Patient '{patientId}' was not found.");

        var today = DateOnly.FromDateTime(timeProvider.GetUtcNow().UtcDateTime);
        return await BuildTodayScheduleInternalAsync(patientId, today, ct);
    }

    public async Task<TodayMedicationScheduleItemDto> LogMedicationIntakeAsync(
        Guid patientId,
        Guid medicationId,
        LogMedicationIntakeRequestDto request,
        CancellationToken ct = default)
    {
        var medication = await db.PatientMedications
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == medicationId && m.PatientId == patientId, ct)
            ?? throw new NotFoundException($"Medication '{medicationId}' was not found.");

        var utcNow = timeProvider.GetUtcNow().UtcDateTime;
        var takenAt = request.TakenAt?.ToUniversalTime() ?? utcNow;
        var today = DateOnly.FromDateTime(utcNow);
        var scheduledLabel = string.IsNullOrWhiteSpace(request.ScheduledTimeLabel)
            ? InferScheduledTimeLabel(medication, 0)
            : request.ScheduledTimeLabel.Trim();

        var existingLog = await db.PatientMedicationLogs
            .FirstOrDefaultAsync(
                l => l.PatientId == patientId && l.PatientMedicationId == medicationId && l.LogDate == today,
                ct);

        if (existingLog is null)
        {
            existingLog = new PatientMedicationLog
            {
                Id = Guid.NewGuid(),
                PatientId = patientId,
                PatientMedicationId = medicationId,
                LogDate = today,
                ScheduledTimeLabel = scheduledLabel,
                TakenAt = takenAt,
                Notes = request.Notes,
            };
            db.PatientMedicationLogs.Add(existingLog);
        }
        else
        {
            existingLog.TakenAt = takenAt;
            existingLog.ScheduledTimeLabel = scheduledLabel;
            existingLog.Notes = request.Notes ?? existingLog.Notes;
        }

        await db.SaveChangesAsync(ct);

        return MapScheduleItem(medication, existingLog, 0);
    }

    public async Task<AppointmentCheckInResponseDto> CheckInAppointmentAsync(
        Guid patientId,
        Guid appointmentId,
        CancellationToken ct = default)
    {
        var appointment = await db.Appointments
            .FirstOrDefaultAsync(a => a.Id == appointmentId && a.PatientId == patientId, ct)
            ?? throw new NotFoundException($"Appointment '{appointmentId}' was not found.");

        if (appointment.Status == AppointmentStatus.Cancelled)
            throw new ValidationException("Cannot check in to a cancelled appointment.");

        var utcNow = timeProvider.GetUtcNow().UtcDateTime;
        appointment.CheckedInAt ??= utcNow;
        if (appointment.Status == AppointmentStatus.Pending)
            appointment.Status = AppointmentStatus.Confirmed;

        await db.SaveChangesAsync(ct);

        var clinic = await db.Clinics.AsNoTracking().FirstOrDefaultAsync(c => c.Id == appointment.ClinicId, ct);
        var provider = await db.ClinicHealthcareProviders.AsNoTracking()
            .FirstOrDefaultAsync(p => p.Id == appointment.ProviderId, ct);

        return new AppointmentCheckInResponseDto(
            appointment.Id,
            appointment.CheckedInAt.Value,
            appointment.Status.ToString(),
            clinic?.Name ?? ExtractJsonString(appointment.RawJson, "clinicName") ?? "Network Clinic",
            provider?.Name ?? ExtractJsonString(appointment.RawJson, "providerName") ?? "Attending Physician");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private async Task<HomeAppointmentsSectionDto> BuildAppointmentsSectionAsync(
        Guid patientId,
        DateTime utcNow,
        CancellationToken ct)
    {
        var allAppointments = await db.Appointments
            .AsNoTracking()
            .Where(a => a.PatientId == patientId)
            .OrderBy(a => a.ScheduledAt)
            .ToListAsync(ct);

        var activeWindowCutoff = utcNow.AddHours(-2);

        var upcoming = allAppointments
            .Where(a =>
                (a.Status == AppointmentStatus.Pending ||
                 a.Status == AppointmentStatus.Confirmed ||
                 a.Status == AppointmentStatus.ActionRequired) &&
                a.ScheduledAt >= activeWindowCutoff)
            .OrderBy(a => a.ScheduledAt)
            .ToList();

        var pastAppointmentCount = allAppointments.Count(a =>
            a.Status == AppointmentStatus.Completed ||
            (a.ScheduledAt < activeWindowCutoff && a.Status != AppointmentStatus.Cancelled));

        var consultationCount = await db.Consultations
            .AsNoTracking()
            .CountAsync(c => c.PatientId == patientId, ct);

        var pastVisitsCount = Math.Max(pastAppointmentCount, consultationCount);

        var clinicIds = upcoming.Select(a => a.ClinicId).Where(id => id != Guid.Empty).Distinct().ToList();
        var providerIds = upcoming.Select(a => a.ProviderId).Where(id => id != Guid.Empty).Distinct().ToList();

        var clinicsById = clinicIds.Count > 0
            ? await db.Clinics.AsNoTracking().Where(c => clinicIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, ct)
            : new Dictionary<Guid, Clinic>();

        var providersById = providerIds.Count > 0
            ? await db.ClinicHealthcareProviders.AsNoTracking().Where(p => providerIds.Contains(p.Id)).ToDictionaryAsync(p => p.Id, ct)
            : new Dictionary<Guid, ClinicHealthcareProvider>();

        var cards = upcoming.Select(a =>
        {
            clinicsById.TryGetValue(a.ClinicId, out var clinic);
            providersById.TryGetValue(a.ProviderId, out var provider);

            var clinicName = clinic?.Name
                ?? ExtractJsonString(a.RawJson, "clinicName")
                ?? "Clinic EZ Partner Center";
            var clinicAddress = clinic?.Address
                ?? ExtractJsonString(a.RawJson, "clinicAddress");
            var providerName = provider?.Name
                ?? ExtractJsonString(a.RawJson, "providerName")
                ?? a.Subject
                ?? "Attending Specialist";
            var providerSpecialty = provider?.Specialty
                ?? ExtractJsonString(a.RawJson, "providerSpecialty")
                ?? a.ServiceType
                ?? "General Practice";

            return new HomeAppointmentCardDto(
                a.Id,
                a.ClinicId,
                clinicName,
                clinicAddress,
                a.ProviderId,
                providerName,
                providerSpecialty,
                provider?.AvatarUrl,
                a.ScheduledAt,
                a.ScheduledAt.AddMinutes(-15),
                a.DurationMinutes > 0 ? a.DurationMinutes : 30,
                a.Status.ToString(),
                a.ServiceType,
                a.CheckedInAt,
                a.CheckedInAt.HasValue);
        }).ToList();

        var carouselState = cards.Count > 0
            ? "active"
            : pastVisitsCount > 0
                ? "returning_empty"
                : "first_time";

        return new HomeAppointmentsSectionDto(
            carouselState,
            cards.Count,
            pastVisitsCount,
            cards);
    }

    private async Task<HomeRecentVitalsDto> BuildRecentVitalsAsync(Guid patientId, CancellationToken ct)
    {
        var vitals = await db.VitalSigns
            .AsNoTracking()
            .Where(v => v.PatientId == patientId)
            .OrderByDescending(v => v.RecordedAt)
            .Take(14)
            .ToListAsync(ct);

        var chronological = vitals.OrderBy(v => v.RecordedAt).ToList();

        // Heart Rate
        var hrPoints = chronological
            .Where(v => v.HeartRateBpm.HasValue)
            .TakeLast(7)
            .Select(v => new VitalSparklinePointDto(v.RecordedAt, v.HeartRateBpm!.Value))
            .ToList();
        int? latestHr = hrPoints.Count > 0 ? (int)hrPoints[^1].Value : null;
        int? hrDelta = hrPoints.Count >= 2 ? (int)(hrPoints[^1].Value - hrPoints[^2].Value) : null;

        // Blood Pressure
        var bpPoints = chronological
            .Where(v => v.SystolicBp.HasValue && v.DiastolicBp.HasValue)
            .TakeLast(7)
            .Select(v => new VitalSparklinePointDto(v.RecordedAt, v.SystolicBp!.Value, v.DiastolicBp!.Value))
            .ToList();
        int? latestSys = bpPoints.Count > 0 ? (int)bpPoints[^1].Value : null;
        int? latestDia = bpPoints.Count > 0 ? (int?)bpPoints[^1].SecondaryValue : null;
        string? bpStatus = ClassifyBloodPressure(latestSys, latestDia);

        // Fasting Blood Glucose (VitalSigns first, fallback to glucose LabResults)
        var bgPoints = chronological
            .Where(v => v.FastingBloodGlucoseMgDl.HasValue)
            .TakeLast(7)
            .Select(v => new VitalSparklinePointDto(v.RecordedAt, v.FastingBloodGlucoseMgDl!.Value))
            .ToList();

        if (bgPoints.Count == 0)
        {
            var glucoseLabs = await db.LabResults
                .AsNoTracking()
                .Where(l => l.PatientId == patientId && l.Result != null)
                .OrderByDescending(l => l.ResultedAt ?? l.CollectedAt ?? l.CreatedAt)
                .Take(20)
                .ToListAsync(ct);

            foreach (var lab in glucoseLabs
                .Where(l => l.TestName.Contains("glucose", StringComparison.OrdinalIgnoreCase) ||
                            l.TestName.Contains("fbs", StringComparison.OrdinalIgnoreCase))
                .OrderBy(l => l.ResultedAt ?? l.CollectedAt ?? l.CreatedAt))
            {
                if (TryParseLeadingDecimal(lab.Result, out var parsedBg) && parsedBg is >= 20m and <= 800m)
                {
                    bgPoints.Add(new VitalSparklinePointDto(lab.ResultedAt ?? lab.CollectedAt ?? lab.CreatedAt, parsedBg));
                }
            }
            if (bgPoints.Count > 7)
                bgPoints = bgPoints.TakeLast(7).ToList();
        }

        decimal? latestBg = bgPoints.Count > 0 ? bgPoints[^1].Value : null;
        string? bgStatus = ClassifyBloodGlucose(latestBg);

        // Sleep Total (VitalSigns first, fallback to SocialHistory.SleepAvgHours if present)
        var sleepPoints = chronological
            .Where(v => v.SleepDurationMinutes.HasValue)
            .TakeLast(7)
            .Select(v => new VitalSparklinePointDto(v.RecordedAt, v.SleepDurationMinutes!.Value, v.DeepSleepMinutes))
            .ToList();

        if (sleepPoints.Count == 0)
        {
            var social = await db.PatientSocialHistories
                .AsNoTracking()
                .FirstOrDefaultAsync(s => s.PatientId == patientId, ct);
            if (social?.SleepAvgHours is > 0)
            {
                var mins = (int)Math.Round(social.SleepAvgHours.Value * 60m);
                sleepPoints.Add(new VitalSparklinePointDto(social.UpdatedAt ?? social.CreatedAt, mins));
            }
        }

        int? latestSleepMins = sleepPoints.Count > 0 ? (int)sleepPoints[^1].Value : null;
        int? latestDeepSleepMins = sleepPoints.Count > 0 && sleepPoints[^1].SecondaryValue.HasValue
            ? (int)sleepPoints[^1].SecondaryValue!.Value
            : null;
        int? sleepDeltaPct = null;
        if (sleepPoints.Count >= 2 && sleepPoints[^2].Value > 0)
        {
            sleepDeltaPct = (int)Math.Round(((sleepPoints[^1].Value - sleepPoints[^2].Value) / sleepPoints[^2].Value) * 100m);
        }

        var latestEntry = vitals.FirstOrDefault();
        var hasAny = latestHr.HasValue || latestSys.HasValue || latestBg.HasValue || latestSleepMins.HasValue;

        return new HomeRecentVitalsDto(
            hasAny,
            latestEntry?.RecordedAt,
            latestEntry?.Source ?? (latestEntry is not null ? "Clinical" : null),
            latestHr,
            hrDelta,
            hrPoints,
            latestSys,
            latestDia,
            bpStatus,
            bpPoints,
            latestBg,
            bgStatus,
            bgPoints,
            latestSleepMins,
            latestDeepSleepMins,
            sleepDeltaPct,
            sleepPoints);
    }

    private async Task<TodayMedicationScheduleDto> BuildTodayScheduleInternalAsync(
        Guid patientId,
        DateOnly today,
        CancellationToken ct)
    {
        var activeMeds = await db.PatientMedications
            .AsNoTracking()
            .Where(m => m.PatientId == patientId && m.IsCurrentlyTaking && (m.EndDate == null || m.EndDate >= today))
            .OrderBy(m => m.CreatedAt)
            .ToListAsync(ct);

        if (activeMeds.Count == 0)
            return new TodayMedicationScheduleDto(0, []);

        var medIds = activeMeds.Select(m => m.Id).ToList();
        var logsToday = await db.PatientMedicationLogs
            .AsNoTracking()
            .Where(l => l.PatientId == patientId && medIds.Contains(l.PatientMedicationId) && l.LogDate == today)
            .ToDictionaryAsync(l => l.PatientMedicationId, ct);

        var items = activeMeds
            .Select((med, idx) =>
            {
                logsToday.TryGetValue(med.Id, out var log);
                return MapScheduleItem(med, log, idx);
            })
            .OrderByDescending(i => i.IsTakenToday) // Show morning/completed in chronological order like screenshot
            .ThenBy(i => i.ScheduledTimeLabel)
            .ToList();

        return new TodayMedicationScheduleDto(items.Count, items);
    }

    private static TodayMedicationScheduleItemDto MapScheduleItem(
        PatientMedication med,
        PatientMedicationLog? log,
        int index)
    {
        var scheduledLabel = !string.IsNullOrWhiteSpace(log?.ScheduledTimeLabel)
            ? log.ScheduledTimeLabel!
            : InferScheduledTimeLabel(med, index);

        var instruction = !string.IsNullOrWhiteSpace(med.Notes)
            ? med.Notes
            : !string.IsNullOrWhiteSpace(med.Frequency)
                ? med.Frequency
                : med.Purpose;

        return new TodayMedicationScheduleItemDto(
            med.Id,
            med.MedicationName,
            med.Dosage,
            med.Frequency,
            med.Route,
            instruction,
            scheduledLabel,
            log is not null,
            log?.TakenAt,
            log?.Id);
    }

    private static string InferScheduledTimeLabel(PatientMedication med, int index)
    {
        var combined = $"{med.Frequency} {med.Notes}".ToLowerInvariant();
        if (combined.Contains("dinner") || combined.Contains("evening") || combined.Contains("night") || combined.Contains("bed"))
            return "7:00 PM";
        if (combined.Contains("lunch") || combined.Contains("noon") || combined.Contains("midday"))
            return "12:30 PM";
        if (combined.Contains("breakfast") || combined.Contains("morning"))
            return "8:00 AM";

        return (index % 3) switch
        {
            0 => "8:00 AM",
            1 => "7:00 PM",
            _ => "1:00 PM"
        };
    }

    private static WelcomeChecklistDto BuildWelcomeChecklistDto(
        IReadOnlyList<string> visitedSteps,
        bool hasProfileData,
        bool hasInsurance,
        bool hasClinicMembership)
    {
        var distinct = visitedSteps
            .Select(WelcomeStepKeys.Normalize)
            .Where(WelcomeStepKeys.All.Contains)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var completedCount = distinct.Count;
        var currentStep = Math.Min(3, completedCount + 1);
        var isHidden = completedCount >= 3;

        return new WelcomeChecklistDto(
            distinct,
            completedCount,
            currentStep,
            isHidden,
            hasProfileData,
            hasInsurance,
            hasClinicMembership);
    }

    private static IReadOnlyList<string> ParseVisitedSteps(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return [];
        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(json);
            return parsed?
                .Where(s => !string.IsNullOrWhiteSpace(s) && WelcomeStepKeys.All.Contains(s.Trim()))
                .Select(WelcomeStepKeys.Normalize)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList() ?? [];
        }
        catch
        {
            return [];
        }
    }

    private static string FormatFullName(ClinicEz.Patient.Domain.Entities.Patient patient)
    {
        var parts = new[] { patient.FirstName, patient.LastName }
            .Where(p => !string.IsNullOrWhiteSpace(p));
        var joined = string.Join(" ", parts).Trim();
        return string.IsNullOrWhiteSpace(joined) ? "Clinic EZ Patient" : joined;
    }

    private static string? FormatBloodGroup(BloodType? bloodType) => bloodType switch
    {
        BloodType.APositive => "A+",
        BloodType.ANegative => "A-",
        BloodType.BPositive => "B+",
        BloodType.BNegative => "B-",
        BloodType.ABPositive => "AB+",
        BloodType.ABNegative => "AB-",
        BloodType.OPositive => "O+",
        BloodType.ONegative => "O-",
        _ => null
    };

    private static string? ClassifyBloodPressure(int? sys, int? dia)
    {
        if (!sys.HasValue || !dia.HasValue) return null;
        if (sys.Value < 120 && dia.Value < 80) return "Optimal";
        if (sys.Value < 130 && dia.Value < 80) return "Elevated";
        if (sys.Value < 130 && dia.Value < 85) return "Normal";
        return "High";
    }

    private static string? ClassifyBloodGlucose(decimal? mgDl)
    {
        if (!mgDl.HasValue) return null;
        if (mgDl.Value < 70m) return "Low";
        if (mgDl.Value <= 99m) return "Normal 70–99";
        return "Elevated";
    }

    private static bool TryParseLeadingDecimal(string? raw, out decimal value)
    {
        value = 0m;
        if (string.IsNullOrWhiteSpace(raw)) return false;
        var span = raw.AsSpan().Trim();
        var len = 0;
        while (len < span.Length && (char.IsDigit(span[len]) || span[len] == '.'))
            len++;
        if (len == 0) return false;
        return decimal.TryParse(span[..len], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out value);
    }

    private static string? ExtractJsonString(string? rawJson, string propertyName)
    {
        if (string.IsNullOrWhiteSpace(rawJson)) return null;
        try
        {
            using var doc = JsonDocument.Parse(rawJson);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                if (string.Equals(prop.Name, propertyName, StringComparison.OrdinalIgnoreCase) &&
                    prop.Value.ValueKind == JsonValueKind.String)
                {
                    var val = prop.Value.GetString();
                    if (!string.IsNullOrWhiteSpace(val)) return val;
                }
            }
        }
        catch
        {
            // Ignore malformed rawJson
        }
        return null;
    }

    private static DailyMindfulMomentDto SelectMindfulMoment(DateOnly date)
    {
        var index = Math.Abs(date.DayNumber) % WellnessMoments.Length;
        return WellnessMoments[index];
    }
}
