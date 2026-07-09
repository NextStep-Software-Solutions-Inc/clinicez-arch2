using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

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
