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
    public string? StreetAddress { get; set; }
    public string? Barangay { get; set; }
    public string? CityMunicipality { get; set; }  // city_municipality column
    public string? Province { get; set; }
    public string? Region { get; set; }
    public string? ZipCode { get; set; }
    public string? Country { get; set; }
    public bool IsPrimary { get; set; }
    public bool IsSameAsPermanent { get; set; }

    // 10-Digit PSGC hierarchy
    public string? RegionPsgc { get; set; }
    public string? ProvincePsgc { get; set; }
    public string? CityMunicipalityPsgc { get; set; }
    public string? BarangayPsgc { get; set; }

    public string? RegionName { get; set; }
    public string? ProvinceName { get; set; }
    public string? CityMunicipalityName { get; set; }
    public string? BarangayName { get; set; }

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
        IsSameAsPermanent = p.IsSameAsPermanent,
        Type = AddressType.Home,   // default; can be refined later when mobile exposes Home/Work
        HouseStreet = p.HouseStreet ?? p.StreetAddress,
        StreetAddress = p.StreetAddress ?? p.HouseStreet,
        Barangay = p.Barangay ?? p.BarangayName,
        CityMunicipality = p.CityMunicipality ?? p.CityMunicipalityName ?? string.Empty,
        Province = p.Province ?? p.ProvinceName,
        Region = p.Region ?? p.RegionName,
        ZipCode = p.ZipCode,
        Country = p.Country ?? "Philippines",
        RegionPsgc = p.RegionPsgc,
        ProvincePsgc = p.ProvincePsgc,
        CityMunicipalityPsgc = p.CityMunicipalityPsgc,
        BarangayPsgc = p.BarangayPsgc,
        RegionName = p.RegionName ?? p.Region,
        ProvinceName = p.ProvinceName ?? p.Province,
        CityMunicipalityName = p.CityMunicipalityName ?? p.CityMunicipality,
        BarangayName = p.BarangayName ?? p.Barangay,
    };

    protected override void ApplyUpdate(PatientAddress e, PatientAddressPayload p)
    {
        e.IsPrimary = string.Equals(p.Type, "primary", StringComparison.OrdinalIgnoreCase) || p.IsPrimary;
        e.IsSameAsPermanent = p.IsSameAsPermanent;
        e.HouseStreet = p.HouseStreet ?? p.StreetAddress ?? e.HouseStreet;
        e.StreetAddress = p.StreetAddress ?? p.HouseStreet ?? e.StreetAddress;
        e.Barangay = p.Barangay ?? p.BarangayName ?? e.Barangay;
        e.CityMunicipality = p.CityMunicipality ?? p.CityMunicipalityName ?? e.CityMunicipality;
        e.Province = p.Province ?? p.ProvinceName ?? e.Province;
        e.Region = p.Region ?? p.RegionName ?? e.Region;
        e.ZipCode = p.ZipCode ?? e.ZipCode;
        e.Country = p.Country ?? e.Country;
        e.RegionPsgc = p.RegionPsgc ?? e.RegionPsgc;
        e.ProvincePsgc = p.ProvincePsgc ?? e.ProvincePsgc;
        e.CityMunicipalityPsgc = p.CityMunicipalityPsgc ?? e.CityMunicipalityPsgc;
        e.BarangayPsgc = p.BarangayPsgc ?? e.BarangayPsgc;
        e.RegionName = p.RegionName ?? p.Region ?? e.RegionName;
        e.ProvinceName = p.ProvinceName ?? p.Province ?? e.ProvinceName;
        e.CityMunicipalityName = p.CityMunicipalityName ?? p.CityMunicipality ?? e.CityMunicipalityName;
        e.BarangayName = p.BarangayName ?? p.Barangay ?? e.BarangayName;
    }

    protected override DateTime GetPayloadTimestamp(PatientAddressPayload p) => p.UpdatedAt;
    protected override void SetEntityId(SyncLog log, PatientAddress e) => log.EntityId = e.Id;
}
