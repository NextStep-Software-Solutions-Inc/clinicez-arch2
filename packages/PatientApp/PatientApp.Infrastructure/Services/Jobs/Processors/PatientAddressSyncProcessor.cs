using Microsoft.EntityFrameworkCore;
using PatientApp.Application.Common.Constants;
using PatientApp.Domain.Entities;
using PatientApp.Domain.Enums;
using PatientApp.Infrastructure.Persistence;

namespace PatientApp.Infrastructure.Services.Jobs.Processors;

internal sealed class PatientAddressPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string? Street { get; set; }
    public string? Barangay { get; set; }
    public string? City { get; set; }
    public string? Province { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }
    public bool IsPrimary { get; set; }
    public DateTime UpdatedAt { get; set; }
}

internal sealed class PatientAddressSyncProcessor
    : SimpleListSyncProcessor<PatientAddress, PatientAddressPayload>
{
    public PatientAddressSyncProcessor(ApplicationDbContext ctx) : base(ctx) { }
    public override string EntityType => SyncableEntityTypes.PatientAddress;

    protected override async Task<PatientAddress?> FindExistingAsync(PatientAddressPayload p, Guid? id, CancellationToken ct)
        => id.HasValue ? await Context.PatientAddresses.FindAsync([id.Value], ct)
            : await Context.PatientAddresses.FirstOrDefaultAsync(e => e.ClientId == p.ClientId, ct);

    protected override PatientAddress CreateFromPayload(PatientAddressPayload p) => new()
    {
        ClientId = p.ClientId, PatientId = p.PatientId,
        Type = Enum.TryParse<AddressType>(p.Type, true, out var at) ? at : AddressType.Home,
        Street = p.Street, Barangay = p.Barangay, City = p.City,
        Province = p.Province, ZipCode = p.ZipCode, Country = p.Country, IsPrimary = p.IsPrimary,
    };

    protected override void ApplyUpdate(PatientAddress e, PatientAddressPayload p)
    {
        e.Type = Enum.TryParse<AddressType>(p.Type, true, out var at) ? at : e.Type;
        e.Street = p.Street; e.Barangay = p.Barangay; e.City = p.City;
        e.Province = p.Province; e.ZipCode = p.ZipCode; e.Country = p.Country; e.IsPrimary = p.IsPrimary;
    }

    protected override DateTime GetPayloadTimestamp(PatientAddressPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientAddress e) => log.EntityId = e.Id;
}
