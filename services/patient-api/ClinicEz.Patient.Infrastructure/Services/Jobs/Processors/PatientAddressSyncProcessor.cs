using Microsoft.EntityFrameworkCore;
using ClinicEz.Patient.Application.Common.Constants;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Infrastructure.Persistence;

namespace ClinicEz.Patient.Infrastructure.Services.Jobs.Processors;

internal sealed class PatientAddressPayload
{
    public Guid ClientId { get; set; }
    public Guid PatientId { get; set; }
    // Mobile type enum: "primary" | "secondary" — drives IsPrimary, not AddressType
    public string? Type { get; set; }
    // Mobile schema field names
    public string? HouseStreet { get; set; }       // house_street column
    public string? Barangay { get; set; }
    public string? CityMunicipality { get; set; }  // city_municipality column
    public string? Province { get; set; }
    public string? Region { get; set; }
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
    {
        if (id.HasValue)
        {
            var found = await Context.PatientAddresses.FindAsync([id.Value], ct);
            if (found is not null) return found;
        }

        if (p.ClientId != Guid.Empty)
        {
            var foundByClient = await Context.PatientAddresses
                .FirstOrDefaultAsync(e => e.PatientId == p.PatientId && e.ClientId == p.ClientId, ct);
            if (foundByClient is not null) return foundByClient;
        }

        var isPrimary = string.Equals(p.Type, "primary", StringComparison.OrdinalIgnoreCase) || p.IsPrimary;
        if (isPrimary)
        {
            var existingPrimary = await Context.PatientAddresses
                .FirstOrDefaultAsync(e => e.PatientId == p.PatientId && e.IsPrimary, ct);
            if (existingPrimary is not null) return existingPrimary;
        }

        return null;
    }

    protected override PatientAddress CreateFromPayload(PatientAddressPayload p) => new()
    {
        ClientId = p.ClientId,
        PatientId = p.PatientId,
        // Mobile type field means "primary"/"secondary" — drive IsPrimary from it
        IsPrimary = string.Equals(p.Type, "primary", StringComparison.OrdinalIgnoreCase) || p.IsPrimary,
        Type = AddressType.Home,   // default; can be refined later when mobile exposes Home/Work
        HouseStreet = p.HouseStreet,
        Barangay = p.Barangay,
        CityMunicipality = p.CityMunicipality,
        Province = p.Province,
        Region = p.Region,
        ZipCode = p.ZipCode,
        Country = p.Country,
    };

    protected override void ApplyUpdate(PatientAddress e, PatientAddressPayload p)
    {
        e.IsPrimary = string.Equals(p.Type, "primary", StringComparison.OrdinalIgnoreCase) || p.IsPrimary;
        e.HouseStreet = p.HouseStreet;
        e.Barangay = p.Barangay;
        e.CityMunicipality = p.CityMunicipality;
        e.Province = p.Province;
        e.Region = p.Region;
        e.ZipCode = p.ZipCode;
        e.Country = p.Country;
    }

    protected override DateTime GetPayloadTimestamp(PatientAddressPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientAddress e) => log.EntityId = e.Id;
}
