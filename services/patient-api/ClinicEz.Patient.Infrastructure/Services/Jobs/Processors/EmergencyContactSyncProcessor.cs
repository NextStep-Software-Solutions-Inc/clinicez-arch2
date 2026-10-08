using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

// Mobile schema fields: name, relationship, phone, altPhone, email, address, sortOrder
internal sealed class EmergencyContactPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Name { get; set; } = string.Empty;   // mobile: "name" → entity: FullName
    public string? Relationship { get; set; }
    public string? Phone { get; set; }                 // mobile: "phone" → entity: Mobile
    public string? AltPhone { get; set; }
    public string? Email { get; set; }
    public string? Address { get; set; }
    public int? SortOrder { get; set; }
    public bool IsPrimary { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class EmergencyContactSyncProcessor
    : SimpleListSyncProcessor<EmergencyContact, EmergencyContactPayload>
{
    public EmergencyContactSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.EmergencyContact;

    protected override async Task<EmergencyContact?> FindExistingAsync(EmergencyContactPayload p, Guid? id, CancellationToken ct)
    {
        if (id.HasValue)
        {
            var found = await Context.EmergencyContacts.FindAsync([id.Value], ct);
            if (found is not null) return found;
        }

        if (p.ClientId != Guid.Empty)
        {
            var foundByClient = await Context.EmergencyContacts
                .FirstOrDefaultAsync(e => e.PatientId == p.PatientId && e.ClientId == p.ClientId, ct);
            if (foundByClient is not null) return foundByClient;
        }

        if (!string.IsNullOrWhiteSpace(p.Phone))
        {
            var foundByPhone = await Context.EmergencyContacts
                .FirstOrDefaultAsync(e => e.PatientId == p.PatientId && e.Mobile == p.Phone, ct);
            if (foundByPhone is not null) return foundByPhone;
        }

        return null;
    }

    protected override EmergencyContact CreateFromPayload(EmergencyContactPayload p) => new()
    {
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        FullName = p.Name,
        Relationship = p.Relationship,
        Mobile = p.Phone,
        AltPhone = p.AltPhone,
        IsPrimary = p.SortOrder == 0 || p.IsPrimary,  // sortOrder 0 = first/primary contact
    };

    protected override void ApplyUpdate(EmergencyContact e, EmergencyContactPayload p)
    {
        e.FullName = p.Name;
        e.Relationship = p.Relationship;
        e.Mobile = p.Phone;
        e.AltPhone = p.AltPhone;
        e.IsPrimary = p.SortOrder == 0 || p.IsPrimary;
    }

    protected override DateTime GetPayloadTimestamp(EmergencyContactPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, EmergencyContact e) => log.EntityId = e.Id;
}
