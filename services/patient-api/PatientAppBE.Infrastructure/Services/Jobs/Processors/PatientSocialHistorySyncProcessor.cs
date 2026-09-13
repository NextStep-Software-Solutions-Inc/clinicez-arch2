using Microsoft.EntityFrameworkCore;
using PatientAppBE.Application.Common.Constants;
using PatientAppBE.Domain.Entities;
using PatientAppBE.Domain.Enums;
using PatientAppBE.Infrastructure.Persistence;

namespace PatientAppBE.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: tobaccoStatus, cigsPerDay, packYears, quitDate, otherTobaccoProducts,
//   alcoholUseLevel, alcoholType, alcoholFrequencyDaysPerWeek, alcoholQuantityPerOccasion,
//   substanceUse, substanceName, substanceRoute, substanceFrequency,
//   activityLevel, exerciseType, exerciseFrequencyDaysPerWeek,
//   dietPattern, foodRestrictions, sleepAvgHours, sleepQuality,
//   isSexuallyActive, waterIntake, caffeineUse, dailyScreenTime
// Backend entity fields: SmokingStatus, CigsPerDay, ..., AlcoholUse, ..., UsesSubstances, ...
internal sealed class SocialHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    // Mobile: "tobaccoStatus" (Never/Former/Current) → backend SmokingStatus enum
    public string? TobaccoStatus { get; set; }
    // Also accept the old backend name for backward compat
    public string? SmokingStatus { get; set; }
    public int? CigsPerDay { get; set; }
    public decimal? PackYears { get; set; }
    public string? QuitDate { get; set; }           // ISO date string
    public string? OtherTobaccoProducts { get; set; }
    // Mobile: "alcoholUseLevel" → backend AlcoholUse enum
    public string? AlcoholUseLevel { get; set; }
    public string? AlcoholUse { get; set; }         // backend compat alias
    public string? AlcoholType { get; set; }
    public int? AlcoholFrequencyDaysPerWeek { get; set; }
    public int? AlcoholQuantityPerOccasion { get; set; }
    // Mobile: "substanceUse" (boolean) → backend UsesSubstances
    public bool? SubstanceUse { get; set; }
    public bool? UsesSubstances { get; set; }       // backend compat alias
    public string? SubstanceName { get; set; }
    public string? SubstanceRoute { get; set; }
    public string? SubstanceFrequency { get; set; }
    public string? ActivityLevel { get; set; }
    public string? ExerciseType { get; set; }
    public int? ExerciseFrequencyDaysPerWeek { get; set; }
    public string? DietPattern { get; set; }
    public string? FoodRestrictions { get; set; }
    public decimal? SleepAvgHours { get; set; }
    public string? SleepQuality { get; set; }
    public bool? IsSexuallyActive { get; set; }
    public string? WaterIntake { get; set; }
    // Mobile-only fields stored in OccupationalHazards as JSON note
    public string? CaffeineUse { get; set; }
    public string? DailyScreenTime { get; set; }
    public string? OccupationalHazards { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientSocialHistorySyncProcessor
    : SimpleListSyncProcessor<PatientSocialHistory, SocialHistoryPayload>
{
    public PatientSocialHistorySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientSocialHistory;

    protected override async Task<PatientSocialHistory?> FindExistingAsync(SocialHistoryPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientSocialHistories.FindAsync([id.Value], ct)
            : await Context.PatientSocialHistories.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientSocialHistory CreateFromPayload(SocialHistoryPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        // Resolve dual-named fields (mobile name takes priority)
        SmokingStatus = ParseSmokingStatus(p.TobaccoStatus ?? p.SmokingStatus),
        CigsPerDay = p.CigsPerDay, PackYears = p.PackYears,
        QuitDate = DateOnly.TryParse(p.QuitDate, out var qd) ? qd : null,
        OtherTobaccoProducts = p.OtherTobaccoProducts,
        AlcoholUse = Enum.TryParse<AlcoholUse>(p.AlcoholUseLevel ?? p.AlcoholUse, true, out var au) ? au : null,
        AlcoholType = p.AlcoholType,
        AlcoholFrequencyDaysPerWeek = p.AlcoholFrequencyDaysPerWeek,
        AlcoholQuantityPerOccasion = p.AlcoholQuantityPerOccasion,
        UsesSubstances = p.SubstanceUse ?? p.UsesSubstances ?? false,
        SubstanceName = p.SubstanceName, SubstanceRoute = p.SubstanceRoute, SubstanceFrequency = p.SubstanceFrequency,
        ActivityLevel = Enum.TryParse<ActivityLevel>(p.ActivityLevel, true, out var al) ? al : null,
        ExerciseType = p.ExerciseType, ExerciseFrequencyDaysPerWeek = p.ExerciseFrequencyDaysPerWeek,
        DietPattern = p.DietPattern, FoodRestrictions = p.FoodRestrictions,
        SleepAvgHours = p.SleepAvgHours,
        SleepQuality = Enum.TryParse<SleepQuality>(p.SleepQuality, true, out var sq) ? sq : null,
        IsSexuallyActive = p.IsSexuallyActive, WaterIntake = p.WaterIntake,
        OccupationalHazards = BuildExtendedNotes(p),
    };

    protected override void ApplyUpdate(PatientSocialHistory e, SocialHistoryPayload p)
    {
        e.SmokingStatus = ParseSmokingStatus(p.TobaccoStatus ?? p.SmokingStatus) ?? e.SmokingStatus;
        e.CigsPerDay = p.CigsPerDay; e.PackYears = p.PackYears;
        e.QuitDate = DateOnly.TryParse(p.QuitDate, out var qd) ? qd : e.QuitDate;
        e.OtherTobaccoProducts = p.OtherTobaccoProducts;
        e.AlcoholUse = Enum.TryParse<AlcoholUse>(p.AlcoholUseLevel ?? p.AlcoholUse, true, out var au) ? au : e.AlcoholUse;
        e.AlcoholType = p.AlcoholType;
        e.AlcoholFrequencyDaysPerWeek = p.AlcoholFrequencyDaysPerWeek;
        e.AlcoholQuantityPerOccasion = p.AlcoholQuantityPerOccasion;
        e.UsesSubstances = p.SubstanceUse ?? p.UsesSubstances ?? e.UsesSubstances;
        e.SubstanceName = p.SubstanceName; e.SubstanceRoute = p.SubstanceRoute; e.SubstanceFrequency = p.SubstanceFrequency;
        e.ActivityLevel = Enum.TryParse<ActivityLevel>(p.ActivityLevel, true, out var al) ? al : e.ActivityLevel;
        e.ExerciseType = p.ExerciseType; e.ExerciseFrequencyDaysPerWeek = p.ExerciseFrequencyDaysPerWeek;
        e.DietPattern = p.DietPattern; e.FoodRestrictions = p.FoodRestrictions;
        e.SleepAvgHours = p.SleepAvgHours;
        e.SleepQuality = Enum.TryParse<SleepQuality>(p.SleepQuality, true, out var sq) ? sq : e.SleepQuality;
        e.IsSexuallyActive = p.IsSexuallyActive; e.WaterIntake = p.WaterIntake;
        e.OccupationalHazards = BuildExtendedNotes(p);
    }

    // Mobile enum: Never/Former/Current → backend SmokingStatus enum
    private static SmokingStatus? ParseSmokingStatus(string? value) => value?.ToLowerInvariant() switch
    {
        "never" => Domain.Enums.SmokingStatus.NeverSmoked,
        "former" => Domain.Enums.SmokingStatus.FormerSmoker,
        "current" => Domain.Enums.SmokingStatus.CurrentSmoker,
        _ => Enum.TryParse<SmokingStatus>(value, true, out var s) ? s : null,
    };

    private static string? BuildExtendedNotes(SocialHistoryPayload p)
    {
        var parts = new List<string>();
        if (p.OccupationalHazards is not null) parts.Add(p.OccupationalHazards);
        if (p.CaffeineUse is not null) parts.Add($"Caffeine: {p.CaffeineUse}");
        if (p.DailyScreenTime is not null) parts.Add($"Screen time: {p.DailyScreenTime}");
        return parts.Count > 0 ? string.Join("; ", parts) : null;
    }

    protected override DateTime GetPayloadTimestamp(SocialHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientSocialHistory e) => log.EntityId = e.Id;
}
