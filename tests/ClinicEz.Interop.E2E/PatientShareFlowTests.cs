using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareToken;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;

namespace ClinicEz.Interop.E2E;

/// <summary>
/// Flow E: the patient app mints a share token, the clinic redeems it over the hub, and what comes back is limited to the
/// scopes the patient ticked.
/// </summary>
public class PatientShareFlowTests
{
    [Fact]
    public async Task Redeem_WithDemographicsOnly_CreatesTheChartWithoutTheAllergies()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var accountId = await PatientSeed.AccountAsync(cell.Patient, allergy: "Penicillin");

        var import = await RedeemAsync(cell, clinic, accountId, "demographics");

        import.Status.Should().Be(ShareImportStatus.Imported);
        import.Scopes.Should().Be(SharingScopes.Demographics);
        var chart = await ChartAsync(cell, import);
        chart.SyncPatientId.Should().Be(accountId);
        chart.FirstName.Should().Be("Maria");
        chart.LastName.Should().Be("Santos");
        chart.Allergies.Should().BeNullOrEmpty("the patient did not share allergies");

        var grant = (await cell.Patient.DbAsync(db => db.PatientAccessGrants.IgnoreQueryFilters().Where(g => g.PatientId == accountId).ToListAsync())).Should().ContainSingle().Subject;
        grant.TenantId.Should().Be(clinic.Tenant);
        grant.FacilityId.Should().Be(clinic.Id);
        grant.Scopes.Should().Be(AccessScopes.Demographics);

        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task Redeem_WithAllergiesGranted_ImportsThem()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var accountId = await PatientSeed.AccountAsync(cell.Patient, allergy: "Penicillin");

        var import = await RedeemAsync(cell, clinic, accountId, "demographics", "allergies");

        import.Status.Should().Be(ShareImportStatus.Imported);
        import.Scopes.Should().Be(SharingScopes.Demographics | SharingScopes.Allergies);
        (await ChartAsync(cell, import)).Allergies.Should().Contain("Penicillin");
    }

    [Fact]
    public async Task Redeem_OfATokenAlreadyUsed_IsDenied_AndTheSecondClinicGetsNoChart()
    {
        await using var cell = new TestCell();
        var firstClinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a", "First Clinic"));
        var secondClinic = await cell.ProvisionAsync(Fac.Clinic("tenant-b", "Second Clinic"));
        var accountId = await PatientSeed.AccountAsync(cell.Patient);
        var token = await cell.Patient.SendAsync(new CreateShareTokenCommand(accountId, ["demographics"], null));

        var first = await RedeemTokenAsync(cell, firstClinic, token.Token);
        var second = await RedeemTokenAsync(cell, secondClinic, token.Token);

        first.Status.Should().Be(ShareImportStatus.Imported);
        second.Status.Should().Be(ShareImportStatus.Denied);
        second.ClinicPatientId.Should().BeNull();
        (await cell.Clinic.DbAsync(db => db.Patients.IgnoreQueryFilters().CountAsync(p => p.ClinicId == secondClinic.Id))).Should().Be(0);
    }

    [Fact]
    public async Task Redeem_OfAnInvalidToken_IsAnsweredWithADenial()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));

        var import = await RedeemTokenAsync(cell, clinic, "not-a-real-token");

        import.Status.Should().Be(ShareImportStatus.Denied);
        import.DenialReason.Should().NotBeNullOrWhiteSpace();
    }

    private static async Task<ShareImport> RedeemAsync(TestCell cell, Fac clinic, Guid accountId, params string[] scopes)
    {
        var token = await cell.Patient.SendAsync(new CreateShareTokenCommand(accountId, scopes, "Consultation"));
        return await RedeemTokenAsync(cell, clinic, token.Token);
    }

    private static async Task<ShareImport> RedeemTokenAsync(TestCell cell, Fac clinic, string token)
    {
        var accepted = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new RedeemPatientShareCommand(token));
        await cell.PumpAsync();
        return await cell.Clinic.DbAsync(db => db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == accepted.CorrelationId));
    }

    private static Task<ClinicPatient> ChartAsync(TestCell cell, ShareImport import) =>
        cell.Clinic.DbAsync(db => db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == import.ClinicPatientId));
}
