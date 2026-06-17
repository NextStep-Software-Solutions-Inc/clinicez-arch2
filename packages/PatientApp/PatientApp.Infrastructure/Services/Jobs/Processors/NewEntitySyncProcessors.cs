using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

// ── Payloads ──────────────────────────────────────────────────────────────────

internal sealed class HealthcareProviderPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string ProviderType { get; set; } = string.Empty;
    public string? Name { get; set; }
    public string? Specialty { get; set; }
    public string? ClinicHospital { get; set; }
    public string? Phone { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class ImmunizationSelfPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? ImmunizationCategory { get; set; }
    public string VaccineName { get; set; } = string.Empty;
    public string? DoseNumber { get; set; }
    public string? LotNumber { get; set; }
    public DateOnly? Date { get; set; }
    public string? AdministeredBy { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class DisabilityPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? BodyPart { get; set; }
    public string? Classification { get; set; }
    public bool IsPwdCertified { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class OccupationPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? Occupation { get; set; }
    public string? Employer { get; set; }
    public string? Industry { get; set; }
    public string? WorkEnvironment { get; set; }
    public int? YearsInOccupation { get; set; }
    public string? HazardExposure { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class TravelHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Destination { get; set; } = string.Empty;
    public string? CityProvince { get; set; }
    public DateOnly? DepartureDate { get; set; }
    public DateOnly? ReturnDate { get; set; }
    public string? Purpose { get; set; }
    public string? IllnessDuringAfterTravel { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class ContraceptiveHistoryPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Method { get; set; } = string.Empty;
    public bool IsCurrent { get; set; }
    public DateOnly? DateStarted { get; set; }
    public string? ReasonForStopping { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PregnancyPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public int? Year { get; set; }
    public string? Outcome { get; set; }
    public int? GestationalAgeWeeks { get; set; }
    public string? DeliveryType { get; set; }
    public decimal? BirthWeightKg { get; set; }
    public string? Complications { get; set; }
    public string? Facility { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class MaleReproductivePayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public bool HasVasectomy { get; set; }
    public DateOnly? VasectomyDate { get; set; }
    public string? Conditions { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class DentalVisionPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string? DentistName { get; set; }
    public string? DentistClinic { get; set; }
    public string? OrthodonticDevice { get; set; }
    public string? EyeDoctorName { get; set; }
    public string? CorrectiveLenses { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class FileFolderPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public Guid? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public DateTime UpdatedAt { get; set; }
}

// ── Processors ────────────────────────────────────────────────────────────────

internal sealed class PatientHealthcareProviderSyncProcessor
    : SimpleListSyncProcessor<PatientHealthcareProvider, HealthcareProviderPayload>
{
    public PatientHealthcareProviderSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientHealthcareProvider;

    protected override async Task<PatientHealthcareProvider?> FindExistingAsync(HealthcareProviderPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientHealthcareProviders.FindAsync([id.Value], ct)
            : await Context.PatientHealthcareProviders.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientHealthcareProvider CreateFromPayload(HealthcareProviderPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        ProviderType = Enum.TryParse<HealthcareProviderType>(p.ProviderType, true, out var pt) ? pt : HealthcareProviderType.PrimaryCare,
        Name = p.Name, Specialty = p.Specialty, ClinicHospital = p.ClinicHospital, Phone = p.Phone,
    };

    protected override void ApplyUpdate(PatientHealthcareProvider e, HealthcareProviderPayload p)
    {
        e.ProviderType = Enum.TryParse<HealthcareProviderType>(p.ProviderType, true, out var pt) ? pt : e.ProviderType;
        e.Name = p.Name; e.Specialty = p.Specialty; e.ClinicHospital = p.ClinicHospital; e.Phone = p.Phone;
    }

    protected override DateTime GetPayloadTimestamp(HealthcareProviderPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientHealthcareProvider e) => log.EntityId = e.Id;
}

internal sealed class PatientImmunizationSelfSyncProcessor
    : SimpleListSyncProcessor<PatientImmunizationSelf, ImmunizationSelfPayload>
{
    public PatientImmunizationSelfSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientImmunizationSelf;

    protected override async Task<PatientImmunizationSelf?> FindExistingAsync(ImmunizationSelfPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientImmunizationsSelf.FindAsync([id.Value], ct)
            : await Context.PatientImmunizationsSelf.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientImmunizationSelf CreateFromPayload(ImmunizationSelfPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, VaccineName = p.VaccineName,
        ImmunizationCategory = Enum.TryParse<ImmunizationCategory>(p.ImmunizationCategory, true, out var ic) ? ic : null,
        DoseNumber = p.DoseNumber, LotNumber = p.LotNumber, Date = p.Date, AdministeredBy = p.AdministeredBy,
    };

    protected override void ApplyUpdate(PatientImmunizationSelf e, ImmunizationSelfPayload p)
    {
        e.VaccineName = p.VaccineName;
        e.ImmunizationCategory = Enum.TryParse<ImmunizationCategory>(p.ImmunizationCategory, true, out var ic) ? ic : e.ImmunizationCategory;
        e.DoseNumber = p.DoseNumber; e.LotNumber = p.LotNumber; e.Date = p.Date; e.AdministeredBy = p.AdministeredBy;
    }

    protected override DateTime GetPayloadTimestamp(ImmunizationSelfPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientImmunizationSelf e) => log.EntityId = e.Id;
}

internal sealed class PatientDisabilitySyncProcessor
    : SimpleListSyncProcessor<PatientDisability, DisabilityPayload>
{
    public PatientDisabilitySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientDisability;

    protected override async Task<PatientDisability?> FindExistingAsync(DisabilityPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientDisabilities.FindAsync([id.Value], ct)
            : await Context.PatientDisabilities.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientDisability CreateFromPayload(DisabilityPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, BodyPart = p.BodyPart, Classification = p.Classification, IsPwdCertified = p.IsPwdCertified };

    protected override void ApplyUpdate(PatientDisability e, DisabilityPayload p)
        { e.BodyPart = p.BodyPart; e.Classification = p.Classification; e.IsPwdCertified = p.IsPwdCertified; }

    protected override DateTime GetPayloadTimestamp(DisabilityPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientDisability e) => log.EntityId = e.Id;
}

internal sealed class PatientOccupationSyncProcessor
    : SimpleListSyncProcessor<PatientOccupation, OccupationPayload>
{
    public PatientOccupationSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientOccupation;

    protected override async Task<PatientOccupation?> FindExistingAsync(OccupationPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientOccupations.FindAsync([id.Value], ct)
            : await Context.PatientOccupations.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientOccupation CreateFromPayload(OccupationPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, Occupation = p.Occupation, Employer = p.Employer,
        Industry = p.Industry, WorkEnvironment = Enum.TryParse<WorkEnvironment>(p.WorkEnvironment, true, out var we) ? we : null,
        YearsInOccupation = p.YearsInOccupation, HazardExposure = p.HazardExposure,
    };

    protected override void ApplyUpdate(PatientOccupation e, OccupationPayload p)
    {
        e.Occupation = p.Occupation; e.Employer = p.Employer; e.Industry = p.Industry;
        e.WorkEnvironment = Enum.TryParse<WorkEnvironment>(p.WorkEnvironment, true, out var we) ? we : e.WorkEnvironment;
        e.YearsInOccupation = p.YearsInOccupation; e.HazardExposure = p.HazardExposure;
    }

    protected override DateTime GetPayloadTimestamp(OccupationPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientOccupation e) => log.EntityId = e.Id;
}

internal sealed class PatientTravelHistorySyncProcessor
    : SimpleListSyncProcessor<PatientTravelHistory, TravelHistoryPayload>
{
    public PatientTravelHistorySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientTravelHistory;

    protected override async Task<PatientTravelHistory?> FindExistingAsync(TravelHistoryPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientTravelHistories.FindAsync([id.Value], ct)
            : await Context.PatientTravelHistories.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientTravelHistory CreateFromPayload(TravelHistoryPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, Destination = p.Destination, CityProvince = p.CityProvince,
        DepartureDate = p.DepartureDate, ReturnDate = p.ReturnDate,
        Purpose = Enum.TryParse<TravelPurpose>(p.Purpose, true, out var tp) ? tp : null,
        IllnessDuringAfterTravel = p.IllnessDuringAfterTravel,
    };

    protected override void ApplyUpdate(PatientTravelHistory e, TravelHistoryPayload p)
    {
        e.Destination = p.Destination; e.CityProvince = p.CityProvince; e.DepartureDate = p.DepartureDate;
        e.ReturnDate = p.ReturnDate;
        e.Purpose = Enum.TryParse<TravelPurpose>(p.Purpose, true, out var tp) ? tp : e.Purpose;
        e.IllnessDuringAfterTravel = p.IllnessDuringAfterTravel;
    }

    protected override DateTime GetPayloadTimestamp(TravelHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientTravelHistory e) => log.EntityId = e.Id;
}

internal sealed class PatientContraceptiveHistorySyncProcessor
    : SimpleListSyncProcessor<PatientContraceptiveHistory, ContraceptiveHistoryPayload>
{
    public PatientContraceptiveHistorySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientContraceptiveHistory;

    protected override async Task<PatientContraceptiveHistory?> FindExistingAsync(ContraceptiveHistoryPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientContraceptiveHistories.FindAsync([id.Value], ct)
            : await Context.PatientContraceptiveHistories.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientContraceptiveHistory CreateFromPayload(ContraceptiveHistoryPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, Method = p.Method, IsCurrent = p.IsCurrent, DateStarted = p.DateStarted, ReasonForStopping = p.ReasonForStopping };

    protected override void ApplyUpdate(PatientContraceptiveHistory e, ContraceptiveHistoryPayload p)
        { e.Method = p.Method; e.IsCurrent = p.IsCurrent; e.DateStarted = p.DateStarted; e.ReasonForStopping = p.ReasonForStopping; }

    protected override DateTime GetPayloadTimestamp(ContraceptiveHistoryPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientContraceptiveHistory e) => log.EntityId = e.Id;
}

internal sealed class PatientPregnancySyncProcessor
    : SimpleListSyncProcessor<PatientPregnancy, PregnancyPayload>
{
    public PatientPregnancySyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientPregnancy;

    protected override async Task<PatientPregnancy?> FindExistingAsync(PregnancyPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientPregnancies.FindAsync([id.Value], ct)
            : await Context.PatientPregnancies.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientPregnancy CreateFromPayload(PregnancyPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, Year = p.Year, Outcome = p.Outcome,
          GestationalAgeWeeks = p.GestationalAgeWeeks, DeliveryType = p.DeliveryType, BirthWeightKg = p.BirthWeightKg,
          Complications = p.Complications, Facility = p.Facility };

    protected override void ApplyUpdate(PatientPregnancy e, PregnancyPayload p)
        { e.Year = p.Year; e.Outcome = p.Outcome; e.GestationalAgeWeeks = p.GestationalAgeWeeks;
          e.DeliveryType = p.DeliveryType; e.BirthWeightKg = p.BirthWeightKg; e.Complications = p.Complications; e.Facility = p.Facility; }

    protected override DateTime GetPayloadTimestamp(PregnancyPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientPregnancy e) => log.EntityId = e.Id;
}

internal sealed class PatientMaleReproductiveSyncProcessor
    : SimpleListSyncProcessor<PatientMaleReproductive, MaleReproductivePayload>
{
    public PatientMaleReproductiveSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientMaleReproductive;

    protected override async Task<PatientMaleReproductive?> FindExistingAsync(MaleReproductivePayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientMaleReproductives.FindAsync([id.Value], ct)
            : await Context.PatientMaleReproductives.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientMaleReproductive CreateFromPayload(MaleReproductivePayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, HasVasectomy = p.HasVasectomy, VasectomyDate = p.VasectomyDate, Conditions = p.Conditions };

    protected override void ApplyUpdate(PatientMaleReproductive e, MaleReproductivePayload p)
        { e.HasVasectomy = p.HasVasectomy; e.VasectomyDate = p.VasectomyDate; e.Conditions = p.Conditions; }

    protected override DateTime GetPayloadTimestamp(MaleReproductivePayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientMaleReproductive e) => log.EntityId = e.Id;
}

internal sealed class PatientDentalVisionSyncProcessor
    : SimpleListSyncProcessor<PatientDentalVision, DentalVisionPayload>
{
    public PatientDentalVisionSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientDentalVision;

    protected override async Task<PatientDentalVision?> FindExistingAsync(DentalVisionPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientDentalVisions.FindAsync([id.Value], ct)
            : await Context.PatientDentalVisions.FirstOrDefaultAsync(e => e.PatientId == p.PatientId || e.ClientId == p.ClientId, ct);

    protected override PatientDentalVision CreateFromPayload(DentalVisionPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId, DentistName = p.DentistName, DentistClinic = p.DentistClinic,
        OrthodonticDevice = p.OrthodonticDevice, EyeDoctorName = p.EyeDoctorName,
        CorrectiveLenses = Enum.TryParse<CorrectiveLenses>(p.CorrectiveLenses, true, out var cl) ? cl : null,
    };

    protected override void ApplyUpdate(PatientDentalVision e, DentalVisionPayload p)
    {
        e.DentistName = p.DentistName; e.DentistClinic = p.DentistClinic; e.OrthodonticDevice = p.OrthodonticDevice;
        e.EyeDoctorName = p.EyeDoctorName;
        e.CorrectiveLenses = Enum.TryParse<CorrectiveLenses>(p.CorrectiveLenses, true, out var cl) ? cl : e.CorrectiveLenses;
    }

    protected override DateTime GetPayloadTimestamp(DentalVisionPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientDentalVision e) => log.EntityId = e.Id;
}

internal sealed class FileFolderSyncProcessor
    : SimpleListSyncProcessor<FileFolder, FileFolderPayload>
{
    public FileFolderSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.FileFolder;

    protected override async Task<FileFolder?> FindExistingAsync(FileFolderPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.FileFolders.FindAsync([id.Value], ct)
            : await Context.FileFolders.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override FileFolder CreateFromPayload(FileFolderPayload p) => new()
        { ClientId = p.ClientId, PatientId = p.PatientId, ParentId = p.ParentId, Name = p.Name };

    protected override void ApplyUpdate(FileFolder e, FileFolderPayload p)
        { e.ParentId = p.ParentId; e.Name = p.Name; }

    protected override DateTime GetPayloadTimestamp(FileFolderPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, FileFolder e) => log.EntityId = e.Id;
}
