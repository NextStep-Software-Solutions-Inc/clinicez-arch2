using ClinicEz.Interop.E2E.Support;
using ClinicEz.Shared.Interop;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

public class ProvisioningSmokeTests
{
    [Fact]
    public async Task Portal_provisions_every_facility_type_through_the_hub_and_each_confirms_back()
    {
        await using var cell = new TestCell();

        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var lab = await cell.ProvisionAsync(Fac.Lab("tenant-a"));
        var pharmacy = await cell.ProvisionAsync(Fac.Pharmacy("tenant-a"));

        (await cell.Clinic.DbAsync(db => Task.FromResult(db.ClinicSettings.IgnoreQueryFilters().Count(s => s.ClinicId == clinic.Id)))).Should().Be(1);

        var portalMail = await cell.Hub.NewSdk(InteropServices.Portal).PullAsync(InteropServices.Portal, 50, 0, CancellationToken.None);
        portalMail.Select(m => m.Envelope.Type).Should().Equal(Enumerable.Repeat(InteropTypes.FacilityProvisioned, 3));
        lab.Should().NotBeNull();
        pharmacy.Should().NotBeNull();
    }
}
