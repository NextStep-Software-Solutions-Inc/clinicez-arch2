using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Features.Billing.Search;
using ClinicEz.Clinic.Application.Features.Patients.Search;
using ClinicEz.Clinic.Application.Features.Search.Queries;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Search;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Adversarial;

/// <summary>
/// Empirical Challenger 2 Verification Suite for Milestone 2:
/// Rigorously tests Tenant Isolation, Soft-Delete Filtering, RBAC Permission Enforcement,
/// and Semantic Badge Variant Mapping across PatientSearchProvider and BillingSearchProvider.
/// </summary>
public class ChallengerM2TenantAndPermissionSecurityTests
{
    private readonly Guid _clinicIdA = Guid.NewGuid();
    private readonly Guid _clinicIdB = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;

    public ChallengerM2TenantAndPermissionSecurityTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicIdA);
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    // =========================================================================
    // 1. TENANT ISOLATION: Records with ClinicId != CurrentClinicId are NEVER returned
    // =========================================================================

    [Fact]
    public async Task PatientSearchProvider_StrictlyIsolatesTenants_CrossTenantRecordsNeverReturned()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        // Same name, code, contact in two different clinics
        var patientClinicA = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-COMMON-001",
            FirstName = "Cardo",
            LastName = "Dalisay",
            ContactNumber = "09170001111",
            DateOfBirth = new DateOnly(1980, 1, 1),
            PhilHealthNumber = "11-222333444-5"
        };

        var patientClinicB = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB, // Foreign clinic
            PatientCode = "PAT-COMMON-001",
            FirstName = "Cardo",
            LastName = "Dalisay",
            ContactNumber = "09170001111",
            DateOfBirth = new DateOnly(1980, 1, 1),
            PhilHealthNumber = "11-222333444-5"
        };

        context.Patients.AddRange(patientClinicA, patientClinicB);
        await context.SaveChangesAsync();

        // Act 1: Search as Clinic A
        var resultsA = await provider.SearchAsync("Dalisay", _clinicIdA, 50, CancellationToken.None);

        // Assert 1: Only Clinic A's patient returned
        resultsA.Should().HaveCount(1);
        resultsA[0].Id.Should().Be(patientClinicA.Id.ToString());
        resultsA[0].Title.Should().Be("Dalisay, Cardo");

        // Act 2: Search as Clinic B
        var resultsB = await provider.SearchAsync("Dalisay", _clinicIdB, 50, CancellationToken.None);

        // Assert 2: Only Clinic B's patient returned
        resultsB.Should().HaveCount(1);
        resultsB[0].Id.Should().Be(patientClinicB.Id.ToString());

        // Act 3: Search with an arbitrary unseeded Clinic ID
        var randomClinicId = Guid.NewGuid();
        var resultsEmpty = await provider.SearchAsync("Dalisay", randomClinicId, 50, CancellationToken.None);

        // Assert 3: 0 results returned
        resultsEmpty.Should().BeEmpty();
    }

    [Fact]
    public async Task BillingSearchProvider_StrictlyIsolatesTenants_CrossTenantInvoicesNeverReturned()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var provider = new BillingSearchProvider(invoiceRepo);

        // Identical invoice numbers and patient names in two different clinics
        var invoiceClinicA = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-CONFIDENTIAL-999",
            PatientName = "Victor Magtanggol",
            GrossAmount = 2500m,
            NetAmount = 2500m,
            BalanceDue = 2500m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Specialist Emergency Consultation", Category = "Service", TotalPrice = 2500m }
            }
        };

        var invoiceClinicB = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB, // Foreign clinic
            InvoiceNumber = "INV-CONFIDENTIAL-999",
            PatientName = "Victor Magtanggol",
            GrossAmount = 9000m,
            NetAmount = 9000m,
            BalanceDue = 9000m,
            Status = InvoiceStatus.Draft,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Specialist Emergency Consultation", Category = "Service", TotalPrice = 9000m }
            }
        };

        context.Invoices.AddRange(invoiceClinicA, invoiceClinicB);
        await context.SaveChangesAsync();

        // Act 1: Search as Clinic A
        var resultsA = await provider.SearchAsync("CONFIDENTIAL-999", _clinicIdA, 50, CancellationToken.None);

        // Assert 1: Only Clinic A's invoice is returned
        resultsA.Should().HaveCount(1);
        resultsA[0].Id.Should().Be(invoiceClinicA.Id.ToString());
        resultsA[0].Subtitle.Should().Contain("Net: ₱2,500.00");

        // Act 2: Search as Clinic B
        var resultsB = await provider.SearchAsync("CONFIDENTIAL-999", _clinicIdB, 50, CancellationToken.None);

        // Assert 2: Only Clinic B's invoice is returned
        resultsB.Should().HaveCount(1);
        resultsB[0].Id.Should().Be(invoiceClinicB.Id.ToString());
        resultsB[0].Subtitle.Should().Contain("Net: ₱9,000.00");

        // Act 3: Search with arbitrary unseeded Clinic ID
        var randomClinicId = Guid.NewGuid();
        var resultsEmpty = await provider.SearchAsync("CONFIDENTIAL-999", randomClinicId, 50, CancellationToken.None);

        // Assert 3: 0 results returned
        resultsEmpty.Should().BeEmpty();
    }

    // =========================================================================
    // 2. SOFT-DELETE FILTERING: Soft-deleted records (IsDeleted = true) are NEVER returned
    // =========================================================================

    [Fact]
    public async Task PatientSearchProvider_SoftDeletedPatientsAreNeverReturned()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        var activePatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-ACTIVE-001",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09171112222",
            DateOfBirth = new DateOnly(1992, 3, 15),
            IsDeleted = false
        };

        var softDeletedPatient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-DELETED-002",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09171113333",
            DateOfBirth = new DateOnly(1991, 2, 10),
            IsDeleted = true // SOFT DELETED
        };

        var softDeletedByCodeOnly = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-GHOST-CODE",
            FirstName = "Ghost",
            LastName = "Patient",
            ContactNumber = "09179998888",
            DateOfBirth = new DateOnly(1988, 8, 8),
            IsDeleted = true // SOFT DELETED
        };

        context.Patients.AddRange(activePatient, softDeletedPatient, softDeletedByCodeOnly);
        await context.SaveChangesAsync();

        // Act 1: Search by name matching both active and soft-deleted
        var nameResults = await provider.SearchAsync("Santos", _clinicIdA, 50, CancellationToken.None);

        // Assert 1: Only the active patient is returned
        nameResults.Should().HaveCount(1);
        nameResults[0].Id.Should().Be(activePatient.Id.ToString());

        // Act 2: Explicit search for the soft-deleted patient's specific code
        var codeResults = await provider.SearchAsync("GHOST-CODE", _clinicIdA, 50, CancellationToken.None);

        // Assert 2: ZERO results returned
        codeResults.Should().BeEmpty();
    }

    [Fact]
    public async Task BillingSearchProvider_SoftDeletedInvoicesAreNeverReturned()
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var provider = new BillingSearchProvider(invoiceRepo);

        var activeInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-ACTIVE-101",
            PatientName = "Josefa Llanes",
            GrossAmount = 800m,
            NetAmount = 800m,
            BalanceDue = 800m,
            Status = InvoiceStatus.Draft,
            IsDeleted = false,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Wound Dressing Service", Category = "Service", TotalPrice = 800m }
            }
        };

        var softDeletedInvoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-DELETED-102",
            PatientName = "Josefa Llanes",
            GrossAmount = 1200m,
            NetAmount = 1200m,
            BalanceDue = 1200m,
            Status = InvoiceStatus.Draft,
            IsDeleted = true, // SOFT DELETED
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Wound Dressing Service", Category = "Service", TotalPrice = 1200m }
            }
        };

        var softDeletedByNumberOnly = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-EXPUNGED-999",
            PatientName = "Expunged Patient",
            GrossAmount = 5000m,
            NetAmount = 5000m,
            BalanceDue = 5000m,
            Status = InvoiceStatus.Draft,
            IsDeleted = true, // SOFT DELETED
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Confidential Procedure", Category = "Service", TotalPrice = 5000m }
            }
        };

        context.Invoices.AddRange(activeInvoice, softDeletedInvoice, softDeletedByNumberOnly);
        await context.SaveChangesAsync();

        // Act 1: Search by patient name matching active and soft deleted
        var patientResults = await provider.SearchAsync("Josefa Llanes", _clinicIdA, 50, CancellationToken.None);

        // Assert 1: Only active invoice returned
        patientResults.Should().HaveCount(1);
        patientResults[0].Id.Should().Be(activeInvoice.Id.ToString());

        // Act 2: Explicit search for the soft-deleted invoice number
        var numberResults = await provider.SearchAsync("INV-EXPUNGED-999", _clinicIdA, 50, CancellationToken.None);

        // Assert 2: ZERO results returned
        numberResults.Should().BeEmpty();

        // Act 3: Explicit search by line item on soft deleted invoice
        var lineItemResults = await provider.SearchAsync("Confidential Procedure", _clinicIdA, 50, CancellationToken.None);

        // Assert 3: ZERO results returned
        lineItemResults.Should().BeEmpty();
    }

    // =========================================================================
    // 3. RBAC PERMISSION ENFORCEMENT: Users lacking "billing:read" or "patients:read"
    // =========================================================================

    [Fact]
    public async Task GlobalSearch_WhenUserLacksPatientsRead_ReceivesZeroResultsFromPatientsProvider()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicIdA);
        // User has billing:read but LACKS patients:read
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Returns(false);
        clinicContext.HasPermission(ClinicPermissions.BillingRead).Returns(true);

        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.Priority.Returns(10);
        patientProvider.RequiredPermission.Returns(ClinicPermissions.PatientsRead);
        patientProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                new("pat-1", "Patients", "Maria Santos", "Sub", null, null, "Patients")
            }));

        var billingProvider = Substitute.For<ISearchProvider>();
        billingProvider.Category.Returns("Billing");
        billingProvider.Priority.Returns(60);
        billingProvider.RequiredPermission.Returns(ClinicPermissions.BillingRead);
        billingProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                new("inv-1", "Billing", "INV-2026-001 - Maria Santos", "Sub", null, null, "Billing")
            }));

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { patientProvider, billingProvider },
            clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act 1: General search for "Maria"
        var generalResult = await handler.Handle(new GlobalClinicSearchQuery("Maria"), CancellationToken.None);

        // Assert 1: Only Billing returns results, Patients provider was never invoked
        generalResult.Items.Should().HaveCount(1);
        generalResult.Items[0].Category.Should().Be("Billing");
        await patientProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);

        // Act 2: Explicit targeted search for Category="Patients" while lacking patients:read
        var targetedResult = await handler.Handle(new GlobalClinicSearchQuery("Maria", Category: "Patients"), CancellationToken.None);

        // Assert 2: Returns 0 results and did not call patient provider
        targetedResult.Items.Should().BeEmpty();
        targetedResult.TotalCount.Should().Be(0);
        await patientProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Fact]
    public async Task GlobalSearch_WhenUserLacksBillingRead_ReceivesZeroResultsFromBillingProvider()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicIdA);
        // User has patients:read but LACKS billing:read
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Returns(true);
        clinicContext.HasPermission(ClinicPermissions.BillingRead).Returns(false);

        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.Priority.Returns(10);
        patientProvider.RequiredPermission.Returns(ClinicPermissions.PatientsRead);
        patientProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                new("pat-1", "Patients", "Maria Santos", "Sub", null, null, "Patients")
            }));

        var billingProvider = Substitute.For<ISearchProvider>();
        billingProvider.Category.Returns("Billing");
        billingProvider.Priority.Returns(60);
        billingProvider.RequiredPermission.Returns(ClinicPermissions.BillingRead);
        billingProvider.SearchAsync(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<int>(), Arg.Any<CancellationToken>())
            .Returns(Task.FromResult<IReadOnlyList<SearchResultItemDto>>(new List<SearchResultItemDto>
            {
                new("inv-1", "Billing", "INV-2026-001 - Maria Santos", "Sub", null, null, "Billing")
            }));

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { patientProvider, billingProvider },
            clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act 1: General search for "Maria"
        var generalResult = await handler.Handle(new GlobalClinicSearchQuery("Maria"), CancellationToken.None);

        // Assert 1: Only Patients returns results, Billing provider was never invoked
        generalResult.Items.Should().HaveCount(1);
        generalResult.Items[0].Category.Should().Be("Patients");
        await billingProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);

        // Act 2: Explicit targeted search for Category="Billing" while lacking billing:read
        var targetedResult = await handler.Handle(new GlobalClinicSearchQuery("Maria", Category: "Billing"), CancellationToken.None);

        // Assert 2: Returns 0 results and did not call billing provider
        targetedResult.Items.Should().BeEmpty();
        targetedResult.TotalCount.Should().Be(0);
        await billingProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    [Fact]
    public async Task GlobalSearch_WhenUserLacksBothPermissions_ReceivesZeroResultsFromBothProviders()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicIdA);
        // User lacks BOTH permissions
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Returns(false);
        clinicContext.HasPermission(ClinicPermissions.BillingRead).Returns(false);

        var patientProvider = Substitute.For<ISearchProvider>();
        patientProvider.Category.Returns("Patients");
        patientProvider.RequiredPermission.Returns(ClinicPermissions.PatientsRead);

        var billingProvider = Substitute.For<ISearchProvider>();
        billingProvider.Category.Returns("Billing");
        billingProvider.RequiredPermission.Returns(ClinicPermissions.BillingRead);

        var handler = new GlobalClinicSearchQueryHandler(
            new[] { patientProvider, billingProvider },
            clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Act
        var result = await handler.Handle(new GlobalClinicSearchQuery("Maria"), CancellationToken.None);

        // Assert
        result.Items.Should().BeEmpty();
        result.TotalCount.Should().Be(0);
        await patientProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
        await billingProvider.DidNotReceiveWithAnyArgs().SearchAsync(default!, default, default, default);
    }

    // =========================================================================
    // 4. BADGE SEMANTIC VARIANT MAPPING: "routine", "urgent", "emergency", "neutral"
    // =========================================================================

    [Theory]
    [InlineData("Severe Anaphylaxis to Amoxicillin", null, null, "Female", "Alert", "emergency")]
    [InlineData(null, "OSCA-99231", null, "Male", "Senior", "neutral")]
    [InlineData(null, null, "PWD-44123", "Female", "PWD", "neutral")]
    [InlineData(null, null, null, "Female", "Female", "routine")]
    [InlineData(null, null, null, "Male", "Male", "routine")]
    [InlineData(null, null, null, "Other", "Other", "routine")]
    public async Task PatientSearchProvider_BadgesMapCorrectlyToSemanticVariants(
        string? alerts,
        string? seniorId,
        string? pwdId,
        string? gender,
        string expectedBadgeText,
        string expectedBadgeVariant)
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var provider = new PatientSearchProvider(patientRepo);

        var patient = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-BADGE-TEST",
            FirstName = "Test",
            LastName = "Subject",
            ContactNumber = "09170000000",
            DateOfBirth = new DateOnly(1985, 5, 5),
            Alerts = alerts,
            SeniorCitizenId = seniorId,
            PwdId = pwdId,
            Gender = gender!
        };

        context.Patients.Add(patient);
        await context.SaveChangesAsync();

        // Act
        var results = await provider.SearchAsync("PAT-BADGE-TEST", _clinicIdA, 10, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        var item = results[0];
        item.BadgeText.Should().Be(expectedBadgeText);
        item.BadgeVariant.Should().Be(expectedBadgeVariant);

        // Verify strongly-typed Badge property synchronization
        item.Badge.Should().NotBeNull();
        item.Badge!.Text.Should().Be(expectedBadgeText);
        item.Badge.Variant.Should().Be(expectedBadgeVariant);
        SearchBadgeVariant.IsValid(item.BadgeVariant).Should().BeTrue();
    }

    [Theory]
    [InlineData(InvoiceStatus.Paid, 0, "Paid", "routine")]
    [InlineData(InvoiceStatus.Draft, 1500.50, "Bal: ₱1,501", "urgent")]
    [InlineData(InvoiceStatus.Draft, 0, "Draft", "neutral")]
    [InlineData(InvoiceStatus.Voided, 0, "Voided", "neutral")]
    [InlineData(InvoiceStatus.Refunded, 0, "Refunded", "neutral")]
    public async Task BillingSearchProvider_BadgesMapCorrectlyToSemanticVariants(
        InvoiceStatus status,
        decimal balanceDue,
        string expectedBadgeText,
        string expectedBadgeVariant)
    {
        // Arrange
        var (context, _, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);
        var provider = new BillingSearchProvider(invoiceRepo);

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-BADGE-TEST",
            PatientName = "Badge Subject",
            GrossAmount = 2000m,
            NetAmount = 2000m,
            BalanceDue = balanceDue,
            Status = status,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Test Service", Category = "Service", TotalPrice = 2000m }
            }
        };

        context.Invoices.Add(invoice);
        await context.SaveChangesAsync();

        // Act
        var results = await provider.SearchAsync("INV-BADGE-TEST", _clinicIdA, 10, CancellationToken.None);

        // Assert
        results.Should().HaveCount(1);
        var item = results[0];
        item.BadgeText.Should().Be(expectedBadgeText);
        item.BadgeVariant.Should().Be(expectedBadgeVariant);

        // Verify strongly-typed Badge property synchronization
        item.Badge.Should().NotBeNull();
        item.Badge!.Text.Should().Be(expectedBadgeText);
        item.Badge.Variant.Should().Be(expectedBadgeVariant);
        SearchBadgeVariant.IsValid(item.BadgeVariant).Should().BeTrue();
    }

    // =========================================================================
    // 5. END-TO-END INTEGRATION: GlobalClinicSearchQueryHandler with real providers
    // =========================================================================

    [Fact]
    public async Task GlobalSearch_FullIntegration_WithRealProviders_EnforcesTenantIsolationSoftDeleteAndRBAC()
    {
        // Arrange
        var clinicContext = Substitute.For<IClinicContext>();
        clinicContext.ClinicId.Returns(_clinicIdA);
        // User starts with only PatientsRead
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Returns(true);
        clinicContext.HasPermission(ClinicPermissions.BillingRead).Returns(false);

        var (context, _, sieve) = TestDbHelper.CreateTestContext(clinicContext);
        var patientRepo = TestDbHelper.CreateRepository<ClinicPatient>(context, sieve);
        var invoiceRepo = TestDbHelper.CreateRepository<Invoice>(context, sieve);

        var patientProvider = new PatientSearchProvider(patientRepo);
        var billingProvider = new BillingSearchProvider(invoiceRepo);

        var handler = new GlobalClinicSearchQueryHandler(
            new ISearchProvider[] { patientProvider, billingProvider },
            clinicContext,
            NullLogger<GlobalClinicSearchQueryHandler>.Instance);

        // Seed data
        var patientA = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-E2E-001",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09170000001",
            DateOfBirth = new DateOnly(1980, 10, 23),
            Gender = "Male",
            IsDeleted = false
        };

        var patientB = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB, // Foreign clinic
            PatientCode = "PAT-E2E-002",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09170000002",
            DateOfBirth = new DateOnly(1980, 10, 23),
            Gender = "Male",
            IsDeleted = false
        };

        var patientDeleted = new ClinicPatient
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            PatientCode = "PAT-E2E-DEL",
            FirstName = "Juan",
            LastName = "Luna",
            ContactNumber = "09170000003",
            DateOfBirth = new DateOnly(1980, 10, 23),
            Gender = "Male",
            IsDeleted = true // SOFT DELETED
        };

        var invoiceA = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-E2E-001",
            PatientName = "Juan Luna",
            GrossAmount = 1000m,
            NetAmount = 1000m,
            BalanceDue = 1000m,
            Status = InvoiceStatus.Draft,
            IsDeleted = false,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Consultation Fee", Category = "Service", TotalPrice = 1000m }
            }
        };

        var invoiceB = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-b",
            ClinicId = _clinicIdB, // Foreign clinic
            InvoiceNumber = "INV-E2E-002",
            PatientName = "Juan Luna",
            GrossAmount = 1000m,
            NetAmount = 1000m,
            BalanceDue = 1000m,
            Status = InvoiceStatus.Draft,
            IsDeleted = false,
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Consultation Fee", Category = "Service", TotalPrice = 1000m }
            }
        };

        var invoiceDeleted = new Invoice
        {
            Id = Guid.NewGuid(),
            TenantId = "tenant-a",
            ClinicId = _clinicIdA,
            InvoiceNumber = "INV-E2E-DEL",
            PatientName = "Juan Luna",
            GrossAmount = 1000m,
            NetAmount = 1000m,
            BalanceDue = 1000m,
            Status = InvoiceStatus.Draft,
            IsDeleted = true, // SOFT DELETED
            LineItems = new List<InvoiceLineItem>
            {
                new() { Description = "Consultation Fee", Category = "Service", TotalPrice = 1000m }
            }
        };

        context.Patients.AddRange(patientA, patientB, patientDeleted);
        context.Invoices.AddRange(invoiceA, invoiceB, invoiceDeleted);
        await context.SaveChangesAsync();

        // -------------------------------------------------------------
        // Step 1: User has patients:read ONLY
        // -------------------------------------------------------------
        var resultStep1 = await handler.Handle(new GlobalClinicSearchQuery("Juan"), CancellationToken.None);

        // MUST return ONLY active patient in Clinic A
        resultStep1.Items.Should().HaveCount(1);
        resultStep1.Items[0].Id.Should().Be(patientA.Id.ToString());
        resultStep1.Items[0].Category.Should().Be("Patients");

        // Billing is completely omitted (user lacks billing:read)
        resultStep1.Items.Any(i => i.Category == "Billing").Should().BeFalse();

        // -------------------------------------------------------------
        // Step 2: Grant user billing:read as well
        // -------------------------------------------------------------
        clinicContext.HasPermission(ClinicPermissions.BillingRead).Returns(true);

        var resultStep2 = await handler.Handle(new GlobalClinicSearchQuery("Juan"), CancellationToken.None);

        // MUST return active patient in Clinic A AND active invoice in Clinic A
        // Foreign clinic B records and soft-deleted records MUST NOT be returned!
        resultStep2.Items.Should().HaveCount(2);

        // Sorted by priority: Patients (Priority 10) before Billing (Priority 60)
        resultStep2.Items[0].Id.Should().Be(patientA.Id.ToString());
        resultStep2.Items[0].Category.Should().Be("Patients");

        resultStep2.Items[1].Id.Should().Be(invoiceA.Id.ToString());
        resultStep2.Items[1].Category.Should().Be("Billing");

        // Ensure Clinic B items are strictly absent
        resultStep2.Items.Any(i => i.Id == patientB.Id.ToString()).Should().BeFalse();
        resultStep2.Items.Any(i => i.Id == invoiceB.Id.ToString()).Should().BeFalse();

        // Ensure soft deleted items are strictly absent
        resultStep2.Items.Any(i => i.Id == patientDeleted.Id.ToString()).Should().BeFalse();
        resultStep2.Items.Any(i => i.Id == invoiceDeleted.Id.ToString()).Should().BeFalse();

        // -------------------------------------------------------------
        // Step 3: Revoke patients:read (user now has billing:read ONLY)
        // -------------------------------------------------------------
        clinicContext.HasPermission(ClinicPermissions.PatientsRead).Returns(false);

        var resultStep3 = await handler.Handle(new GlobalClinicSearchQuery("Juan"), CancellationToken.None);

        // MUST return ONLY active invoice in Clinic A
        resultStep3.Items.Should().HaveCount(1);
        resultStep3.Items[0].Id.Should().Be(invoiceA.Id.ToString());
        resultStep3.Items[0].Category.Should().Be("Billing");

        // -------------------------------------------------------------
        // Step 4: Revoke all permissions
        // -------------------------------------------------------------
        clinicContext.HasPermission(ClinicPermissions.BillingRead).Returns(false);

        var resultStep4 = await handler.Handle(new GlobalClinicSearchQuery("Juan"), CancellationToken.None);

        // ZERO results returned
        resultStep4.Items.Should().BeEmpty();
        resultStep4.TotalCount.Should().Be(0);
    }
}

