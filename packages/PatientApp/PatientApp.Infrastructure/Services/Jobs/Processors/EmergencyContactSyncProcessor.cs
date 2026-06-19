using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class EmergencyContactPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    // Mobile sends "name" not "fullName"
    public string Name { get; set; } = string.Empty;
    public string? Relationship { get; set; }
    // Mobile sends "phone" not "mobile"
    public string? Phone { get; set; }
    public string? AltPhone { get; set; }
    public bool IsPrimary { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class EmergencyContactSyncProcessor
    : SimpleListSyncProcessor<EmergencyContact, EmergencyContactPayload>
{
    public EmergencyContactSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.EmergencyContact;

    protected override async Task<EmergencyContact?> FindExistingAsync(EmergencyContactPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.EmergencyContacts.FindAsync([id.Value], ct)
            : await Context.EmergencyContacts.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override EmergencyContact CreateFromPayload(EmergencyContactPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        FullName = p.Name, Relationship = p.Relationship,
        Mobile = p.Phone, AltPhone = p.AltPhone, IsPrimary = p.IsPrimary,
    };

    protected override void ApplyUpdate(EmergencyContact e, EmergencyContactPayload p)
    {
        e.FullName = p.Name; e.Relationship = p.Relationship;
        e.Mobile = p.Phone; e.AltPhone = p.AltPhone; e.IsPrimary = p.IsPrimary;
    }

    protected override DateTime GetPayloadTimestamp(EmergencyContactPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, EmergencyContact e) => log.EntityId = e.Id;
}
