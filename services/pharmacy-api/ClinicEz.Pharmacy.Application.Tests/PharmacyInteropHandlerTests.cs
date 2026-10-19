using ClinicEz.Pharmacy.Application.Features.Prescriptions.Queries;
using ClinicEz.Pharmacy.Application.Interop;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Sieve.Services;

namespace ClinicEz.Pharmacy.Application.Tests;

public class PharmacyInteropHandlerTests
{
    private const string PharmacyTenant = "tenant-pharmacy";
    private const string ClinicTenant = "tenant-clinic";
    private static readonly Guid PharmacyGuid = new("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid ClinicGuid = new("cccccccc-0000-0000-0000-000000000001");

    private static Party PharmacyParty => Party.ForFacility(PharmacyTenant, PharmacyGuid.ToString(), FacilityType.Pharmacy);
    private static Party ClinicParty => Party.ForFacility(ClinicTenant, ClinicGuid.ToString(), FacilityType.Clinic);

    private sealed class Fixture
    {
        public required ApplicationDbContext Db { get; init; }
        public required TestPharmacyScope Scope { get; init; }
        public required FacilityCreatedHandler FacilityHandler { get; init; }
        public required PrescriptionIssuedHandler RxHandler { get; init; }
        public required Repository<PrescriptionOrder> Orders { get; init; }
    }

    private static Fixture CreateFixture()
    {
        // Starts with no scope at all, exactly like a background handler before it reads the envelope.
        var scope = new TestPharmacyScope(string.Empty, Guid.Empty);
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_InteropDb_{Guid.NewGuid()}", scope);
        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());
        var orders = new Repository<PrescriptionOrder>(db, sieve);
        var inventory = new Repository<PharmacyInventoryItem>(db, sieve);
        var settings = new Repository<PharmacySettings>(db, sieve);

        return new Fixture
        {
            Db = db,
            Scope = scope,
            Orders = orders,
            FacilityHandler = new FacilityCreatedHandler(
                settings, uow, scope, new InteropPublisher(db), NullLogger<FacilityCreatedHandler>.Instance),
            RxHandler = new PrescriptionIssuedHandler(
                orders, inventory, settings, uow, scope, NullLogger<PrescriptionIssuedHandler>.Instance)
        };
    }

    private static InteropMessageContext Ctx(Party from, Party to, string type, Guid? correlationId = null) =>
        new(InteropEnvelope.Create(type, from, to, correlationId ?? Guid.NewGuid(), new object()));

    private static FacilityCreatedEvent Facility(FacilityType type = FacilityType.Pharmacy, Guid? id = null) => new()
    {
        TenantId = PharmacyTenant,
        FacilityType = type,
        ResourceId = id ?? PharmacyGuid,
        Name = "Rizal Community Pharmacy",
        PlanTier = "Community"
    };

    private static async Task ProvisionAsync(Fixture f)
    {
        await f.FacilityHandler.HandleAsync(
            Facility(),
            Ctx(Party.Portal, PharmacyParty, InteropTypes.FacilityLicenseIssued),
            CancellationToken.None);
        f.Scope.Enter(string.Empty, Guid.Empty);
    }

    private static PrescriptionIssuedEvent Rx(
        string number,
        Guid? prescriptionId = null,
        string genericName = "Amlodipine",
        int quantity = 30,
        string? branchId = null) => new()
    {
        PrescriptionId = prescriptionId ?? Guid.NewGuid(),
        PrescriptionNumber = number,
        OrderingFacilityId = "payload-claims-this-clinic",
        OrderingFacilityName = "Downtown Medical Clinic",
        TenantId = "payload-claims-this-tenant",
        BranchId = branchId,
        PrescriberDoctor = new PrescriberDoctorDto { DoctorName = "Dr. Reyes", PrcLicenseNumber = "PRC-001" },
        Patient = new PrescriptionPatientDto { PatientId = Guid.NewGuid(), FullName = "Juan Dela Cruz" },
        Items = new List<PrescriptionItemDto>
        {
            new() { GenericName = genericName, Dosage = "5mg", Quantity = quantity }
        }
    };

    private static Task IssueAsync(Fixture f, PrescriptionIssuedEvent rx, Party? from = null, Party? to = null, Guid? correlationId = null) =>
        f.RxHandler.HandleAsync(
            rx,
            Ctx(from ?? ClinicParty, to ?? PharmacyParty, InteropTypes.RxIssued, correlationId ?? rx.PrescriptionId),
            CancellationToken.None);

    [Fact]
    public async Task FacilityLicenseIssued_ProvisionsThePharmacy_AndQueuesProvisionedAckToPortal()
    {
        var f = CreateFixture();

        await f.FacilityHandler.HandleAsync(
            Facility(),
            Ctx(Party.Portal, PharmacyParty, InteropTypes.FacilityLicenseIssued),
            CancellationToken.None);

        var settings = await f.Db.PharmacySettings.IgnoreQueryFilters().SingleAsync();
        settings.TenantId.Should().Be(PharmacyTenant);
        settings.PharmacyId.Should().Be(PharmacyGuid);
        settings.PharmacyName.Should().Be("Rizal Community Pharmacy");
        f.Scope.TenantId.Should().Be(PharmacyTenant);
        f.Scope.PharmacyId.Should().Be(PharmacyGuid);

        var outbox = await f.Db.InteropOutbox.SingleAsync();
        outbox.Type.Should().Be(InteropTypes.FacilityProvisioned);
        var envelope = InteropEnvelope.FromJson(outbox.EnvelopeJson);
        envelope.To.Should().Be(Party.Portal);
        envelope.From.Should().Be(PharmacyParty);
        envelope.GetPayload<FacilityProvisionedEvent>().Success.Should().BeTrue();
    }

    [Fact]
    public async Task FacilityLicenseIssued_Twice_StillYieldsOneSettingsRow()
    {
        var f = CreateFixture();
        var ctx = Ctx(Party.Portal, PharmacyParty, InteropTypes.FacilityLicenseIssued);

        await f.FacilityHandler.HandleAsync(Facility(), ctx, CancellationToken.None);
        await f.FacilityHandler.HandleAsync(Facility(), ctx, CancellationToken.None);

        (await f.Db.PharmacySettings.IgnoreQueryFilters().CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task FacilityLicenseIssued_FromAnythingButTheControlPlane_IsIgnored()
    {
        var f = CreateFixture();

        await f.FacilityHandler.HandleAsync(
            Facility(),
            Ctx(ClinicParty, PharmacyParty, InteropTypes.FacilityLicenseIssued),
            CancellationToken.None);

        (await f.Db.PharmacySettings.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
        (await f.Db.InteropOutbox.AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task FacilityLicenseIssued_AddressedToADifferentFacility_IsIgnored()
    {
        var f = CreateFixture();
        var otherPharmacy = Party.ForFacility(PharmacyTenant, Guid.NewGuid().ToString(), FacilityType.Pharmacy);

        await f.FacilityHandler.HandleAsync(
            Facility(),
            Ctx(Party.Portal, otherPharmacy, InteropTypes.FacilityLicenseIssued),
            CancellationToken.None);

        (await f.Db.PharmacySettings.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task FacilityLicenseIssued_ForAClinic_IsIgnoredByThePharmacy()
    {
        var f = CreateFixture();

        await f.FacilityHandler.HandleAsync(
            Facility(FacilityType.Clinic),
            Ctx(Party.Portal, PharmacyParty, InteropTypes.FacilityLicenseIssued),
            CancellationToken.None);

        (await f.Db.PharmacySettings.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task RxIssued_Ingests_StoresOrderingPartyFromTheEnvelope_AndPricesFromInventory()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        f.Db.InventoryItems.Add(new PharmacyInventoryItem
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            Sku = "SKU-AMLO",
            GenericName = "Amlodipine",
            Strength = "5mg",
            DosageForm = "Tablet",
            UnitPrice = 8.50m,
            CurrentStock = 100
        });
        await f.Db.SaveChangesAsync();

        var rx = Rx("RX-INTEROP-001");
        var correlationId = Guid.NewGuid();
        await IssueAsync(f, rx, correlationId: correlationId);

        var order = await f.Db.PrescriptionOrders.IgnoreQueryFilters().Include(o => o.Items).SingleAsync();
        order.TenantId.Should().Be(PharmacyTenant);
        order.PharmacyId.Should().Be(PharmacyGuid.ToString());
        order.OrderingTenantId.Should().Be(ClinicTenant, "the authenticated envelope sender wins over the payload claim");
        order.OrderingFacilityId.Should().Be(ClinicGuid.ToString());
        order.CorrelationId.Should().Be(correlationId);
        order.ExternalPrescriptionId.Should().Be(rx.PrescriptionId);
        order.Status.Should().Be(PrescriptionStatus.Pending);
        order.Items.Should().ContainSingle();
        order.Items.Single().UnitPrice.Should().Be(8.50m);
        order.TotalAmount.Should().Be(255.00m);
    }

    [Fact]
    public async Task RxIssued_DuplicateDelivery_CreatesExactlyOneOrder()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var rx = Rx("RX-INTEROP-DUP");

        await IssueAsync(f, rx);
        await IssueAsync(f, rx);

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task RxIssued_SamePrescriptionNumberFromDifferentClinics_CreatesTwoOrders()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var otherClinic = Party.ForFacility("tenant-other-clinic", Guid.NewGuid().ToString(), FacilityType.Clinic);

        await IssueAsync(f, Rx("RX-0001", prescriptionId: Guid.NewGuid()));
        await IssueAsync(f, Rx("RX-0001", prescriptionId: Guid.NewGuid()), from: otherClinic);

        var orders = await f.Db.PrescriptionOrders.IgnoreQueryFilters().ToListAsync();
        orders.Should().HaveCount(2);
        orders.Select(o => o.OrderingTenantId).Should().BeEquivalentTo(ClinicTenant, "tenant-other-clinic");
    }

    [Fact]
    public async Task RxIssued_ToAPharmacyThatIsNotProvisionedHere_IsIgnored()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var stranger = Party.ForFacility("tenant-stranger", Guid.NewGuid().ToString(), FacilityType.Pharmacy);

        await IssueAsync(f, Rx("RX-STRANGER"), to: stranger);

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task RxIssued_WithoutProvisioning_IsIgnored()
    {
        var f = CreateFixture();

        await IssueAsync(f, Rx("RX-NO-PROVISION"));

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task RxIssued_FromANonFacilitySender_IsIgnored()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);

        await IssueAsync(f, Rx("RX-FROM-PORTAL"), from: Party.Portal);

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task RxIssued_AddressedToANonGuidFacilityId_IsIgnored()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var malformed = Party.ForFacility(PharmacyTenant, "pharmacy-main", FacilityType.Pharmacy);

        await IssueAsync(f, Rx("RX-MALFORMED"), to: malformed);

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task RxIssued_Should_Ingest_BranchId_And_Filter_By_Branch()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var branchAId = Guid.NewGuid().ToString();
        var branchBId = Guid.NewGuid().ToString();

        await IssueAsync(f, Rx("RX-BRANCH-A-01", genericName: "Amoxicillin", quantity: 21, branchId: branchAId));
        await IssueAsync(f, Rx("RX-BRANCH-B-01", genericName: "Paracetamol", quantity: 10, branchId: branchBId));

        f.Scope.Enter(PharmacyTenant, PharmacyGuid);
        var savedA = await f.Db.PrescriptionOrders.FirstOrDefaultAsync(p => p.PrescriptionNumber == "RX-BRANCH-A-01");
        savedA.Should().NotBeNull();
        savedA!.BranchId.Should().Be(branchAId);

        var queryHandler = new GetPrescriptionsQueueQueryHandler(f.Orders);
        var queueA = await queryHandler.Handle(new GetPrescriptionsQueueQuery(BranchId: branchAId), CancellationToken.None);
        queueA.Should().HaveCount(1);
        queueA[0].PrescriptionNumber.Should().Be("RX-BRANCH-A-01");
        queueA[0].BranchId.Should().Be(branchAId);
    }

    [Fact]
    public async Task Dispatcher_RoutesBothTypes_EntersTheEnvelopeScope_AndDeduplicatesRedelivery()
    {
        var dbName = $"Pharmacy_E2E_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Pharmacy,
            ["Messaging:Enabled"] = "false",
            ["DbSchema"] = "public"
        }).Build();

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddHttpContextAccessor();
        services.AddScoped<PharmacyContext>();
        services.AddScoped<IPharmacyContext>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddScoped<IPharmacyScopeSetter>(sp => sp.GetRequiredService<PharmacyContext>());
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddSingleton(Substitute.For<ISieveProcessor>());
        services.AddScoped(_ => Substitute.For<IProductRepository>());
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddInterop<ApplicationDbContext>(config, h => h
            .Handle<FacilityCreatedEvent, FacilityCreatedHandler>(InteropTypes.FacilityLicenseIssued)
            .Handle<PrescriptionIssuedEvent, PrescriptionIssuedHandler>(InteropTypes.RxIssued));
        await using var provider = services.BuildServiceProvider();
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();

        var license = InteropEnvelope.Create(
            InteropTypes.FacilityLicenseIssued, Party.Portal, PharmacyParty, PharmacyGuid, Facility());
        (await dispatcher.DispatchAsync(license, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);

        var rx = Rx("RX-E2E-001");
        var rxEnvelope = InteropEnvelope.Create(InteropTypes.RxIssued, ClinicParty, PharmacyParty, rx.PrescriptionId, rx);
        (await dispatcher.DispatchAsync(rxEnvelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await dispatcher.DispatchAsync(rxEnvelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        var order = await db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync();
        order.TenantId.Should().Be(PharmacyTenant);
        order.PharmacyId.Should().Be(PharmacyGuid.ToString());
        order.OrderingFacilityId.Should().Be(ClinicGuid.ToString());
        order.CorrelationId.Should().Be(rx.PrescriptionId);
        (await db.InteropInbox.CountAsync()).Should().Be(2);
        (await db.InteropOutbox.CountAsync()).Should().Be(1, "only the facility.provisioned acknowledgement is queued");
    }
}
