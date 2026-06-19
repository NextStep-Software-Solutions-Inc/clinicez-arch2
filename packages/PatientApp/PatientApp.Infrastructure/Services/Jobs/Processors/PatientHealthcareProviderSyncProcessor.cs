using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

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
