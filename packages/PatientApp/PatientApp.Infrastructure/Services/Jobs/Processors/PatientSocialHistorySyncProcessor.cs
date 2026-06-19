using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class SocialHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? SmokingStatus { get; set; }
    public int? CigsPerDay { get; set; }
    public decimal? PackYears { get; set; }
    public DateOnly? QuitDate { get; set; }
    public string? OtherTobaccoProducts { get; set; }
    public string? AlcoholUse { get; set; }
    public string? AlcoholType { get; set; }
    public int? AlcoholFrequencyDaysPerWeek { get; set; }
    public int? AlcoholQuantityPerOccasion { get; set; }
    public bool UsesSubstances { get; set; }
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
        SmokingStatus = Enum.TryParse<SmokingStatus>(p.SmokingStatus, true, out var ss) ? ss : null,
        CigsPerDay = p.CigsPerDay, PackYears = p.PackYears, QuitDate = p.QuitDate,
        OtherTobaccoProducts = p.OtherTobaccoProducts,
        AlcoholUse = Enum.TryParse<AlcoholUse>(p.AlcoholUse, true, out var au) ? au : null,
        AlcoholType = p.AlcoholType, AlcoholFrequencyDaysPerWeek = p.AlcoholFrequencyDaysPerWeek,
        AlcoholQuantityPerOccasion = p.AlcoholQuantityPerOccasion,
        UsesSubstances = p.UsesSubstances, SubstanceName = p.SubstanceName,
        SubstanceRoute = p.SubstanceRoute, SubstanceFrequency = p.SubstanceFrequency,
        ActivityLevel = Enum.TryParse<ActivityLevel>(p.ActivityLevel, true, out var al) ? al : null,
        ExerciseType = p.ExerciseType, ExerciseFrequencyDaysPerWeek = p.ExerciseFrequencyDaysPerWeek,
        DietPattern = p.DietPattern, FoodRestrictions = p.FoodRestrictions,
        SleepAvgHours = p.SleepAvgHours,
        SleepQuality = Enum.TryParse<SleepQuality>(p.SleepQuality, true, out var sq) ? sq : null,
        IsSexuallyActive = p.IsSexuallyActive,
        WaterIntake = p.WaterIntake, OccupationalHazards = p.OccupationalHazards,
    };

    protected override void ApplyUpdate(PatientSocialHistory e, SocialHistoryPayload p)
    {
        e.SmokingStatus = Enum.TryParse<SmokingStatus>(p.SmokingStatus, true, out var ss) ? ss : e.SmokingStatus;
        e.CigsPerDay = p.CigsPerDay; e.PackYears = p.PackYears; e.QuitDate = p.QuitDate;
        e.OtherTobaccoProducts = p.OtherTobaccoProducts;
        e.AlcoholUse = Enum.TryParse<AlcoholUse>(p.AlcoholUse, true, out var au) ? au : e.AlcoholUse;
        e.AlcoholType = p.AlcoholType; e.AlcoholFrequencyDaysPerWeek = p.AlcoholFrequencyDaysPerWeek;
        e.AlcoholQuantityPerOccasion = p.AlcoholQuantityPerOccasion;
        e.UsesSubstances = p.UsesSubstances; e.SubstanceName = p.SubstanceName;
        e.SubstanceRoute = p.SubstanceRoute; e.SubstanceFrequency = p.SubstanceFrequency;
        e.ActivityLevel = Enum.TryParse<ActivityLevel>(p.ActivityLevel, true, out var al) ? al : e.ActivityLevel;
        e.ExerciseType = p.ExerciseType; e.ExerciseFrequencyDaysPerWeek = p.ExerciseFrequencyDaysPerWeek;
        e.DietPattern = p.DietPattern; e.FoodRestrictions = p.FoodRestrictions;
        e.SleepAvgHours = p.SleepAvgHours;
        e.SleepQuality = Enum.TryParse<SleepQuality>(p.SleepQuality, true, out var sq) ? sq : e.SleepQuality;
        e.IsSexuallyActive = p.IsSexuallyActive;
        e.WaterIntake = p.WaterIntake; e.OccupationalHazards = p.OccupationalHazards;
    }

    protected override DateTime GetPayloadTimestamp(SocialHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientSocialHistory e) => log.EntityId = e.Id;
}
