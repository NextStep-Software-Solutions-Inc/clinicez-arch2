using ClinicEz.Clinic.Application.Features.Patients.Commands;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Interop.E2E.Support;
using ClinicEz.Patient.Application.Features.Sharing.Commands.CreateShareCode;
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

    [Fact]
    public async Task Redeem_WithClinicEzIdAndCode_ImportsTheChartSuccessfully()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var accountId = await PatientSeed.AccountAsync(cell.Patient, allergy: "Amoxicillin");

        var codeDto = await cell.Patient.SendAsync(new CreateShareCodeCommand(accountId, ["demographics", "allergies"], "Consultation"));
        codeDto.Code.Should().NotBeNullOrWhiteSpace();
        codeDto.ClinicEzId.Should().StartWith("CE-");

        var accepted = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new RedeemPatientShareCommand(
            ShareToken: null,
            Purpose: "Consultation",
            AddToQueue: false,
            ChiefComplaint: null,
            ClinicEzId: codeDto.ClinicEzId,
            Code: codeDto.Code));

        await cell.PumpAsync();

        var import = await cell.Clinic.DbAsync(db => db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == accepted.CorrelationId));
        import.Status.Should().Be(ShareImportStatus.Imported);
        import.Scopes.Should().Be(SharingScopes.Demographics | SharingScopes.Allergies);

        var chart = await ChartAsync(cell, import);
        chart.SyncPatientId.Should().Be(accountId);
        chart.FirstName.Should().Be("Maria");
        chart.LastName.Should().Be("Santos");
        chart.Allergies.Should().Contain("Amoxicillin");

        var grant = (await cell.Patient.DbAsync(db => db.PatientAccessGrants.IgnoreQueryFilters().Where(g => g.PatientId == accountId).ToListAsync())).Should().ContainSingle().Subject;
        grant.TenantId.Should().Be(clinic.Tenant);
        grant.FacilityId.Should().Be(clinic.Id);
        grant.Scopes.Should().Be(AccessScopes.Demographics | AccessScopes.Allergies);
        grant.Source.Should().Be(AccessGrantSource.Manual);

        // A second attempt with the same one-time code must be denied
        var secondAccepted = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new RedeemPatientShareCommand(
            ShareToken: null,
            Purpose: "Consultation",
            AddToQueue: false,
            ChiefComplaint: null,
            ClinicEzId: codeDto.ClinicEzId,
            Code: codeDto.Code));

        await cell.PumpAsync();

        var secondImport = await cell.Clinic.DbAsync(db => db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == secondAccepted.CorrelationId));
        secondImport.Status.Should().Be(ShareImportStatus.Denied);
        secondImport.DenialReason.Should().NotBeNullOrWhiteSpace();

        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
    }

    [Fact]
    public async Task Redeem_WithInvalidCode_IsAnsweredWithADenial()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var accountId = await PatientSeed.AccountAsync(cell.Patient);
        var patient = await cell.Patient.DbAsync(db => db.Patients.IgnoreQueryFilters().SingleAsync(p => p.Id == accountId));

        var accepted = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new RedeemPatientShareCommand(
            ShareToken: null,
            Purpose: "Consultation",
            AddToQueue: false,
            ChiefComplaint: null,
            ClinicEzId: patient.ClinicEzId,
            Code: "WRONGCOD"));

        await cell.PumpAsync();

        var import = await cell.Clinic.DbAsync(db => db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == accepted.CorrelationId));
        import.Status.Should().Be(ShareImportStatus.Denied);
        import.DenialReason.Should().NotBeNullOrWhiteSpace();
    }

    [Fact]
    public async Task Redeem_WithAlternativeFormattingOfClinicEzIdAndCode_ImportsTheChartSuccessfully()
    {
        await using var cell = new TestCell();
        var clinic = await cell.ProvisionAsync(Fac.Clinic("tenant-a"));
        var accountId = await PatientSeed.AccountAsync(cell.Patient);

        var codeDto = await cell.Patient.SendAsync(new CreateShareCodeCommand(accountId, ["demographics"], "Consultation"));

        // Format ClinicEzId as unhyphenated lowercase (e.g. ceabcd1234) and Code with space (e.g. abcd efgh)
        var unhyphenatedId = codeDto.ClinicEzId.Replace("-", "").ToLowerInvariant();
        var spacedCode = codeDto.Code.Replace("-", " ").ToLowerInvariant();

        var accepted = await cell.Clinic.SendAsync(clinic.Tenant, clinic.Id, new RedeemPatientShareCommand(
            ShareToken: null,
            Purpose: "Consultation",
            AddToQueue: false,
            ChiefComplaint: null,
            ClinicEzId: unhyphenatedId,
            Code: spacedCode));

        await cell.PumpAsync();

        var import = await cell.Clinic.DbAsync(db => db.ShareImports.IgnoreQueryFilters().SingleAsync(i => i.Id == accepted.CorrelationId));
        import.Status.Should().Be(ShareImportStatus.Imported);

        var chart = await ChartAsync(cell, import);
        chart.SyncPatientId.Should().Be(accountId);
        chart.FirstName.Should().Be("Maria");

        foreach (var host in cell.Hosts) await host.AssertNothingStuckAsync();
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
