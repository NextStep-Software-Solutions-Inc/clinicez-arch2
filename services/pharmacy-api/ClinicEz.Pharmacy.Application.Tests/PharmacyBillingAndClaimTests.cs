using System.Net;
using System.Text.Json;
using ClinicEz.Pharmacy.Api.Middleware;
using ClinicEz.Pharmacy.Application.Common;
using ClinicEz.Pharmacy.Application.Features.Prescriptions.Commands;
using ClinicEz.Pharmacy.Application.Interop;
using ClinicEz.Pharmacy.Domain.Entities;
using ClinicEz.Pharmacy.Domain.Enums;
using ClinicEz.Pharmacy.Domain.Interfaces;
using ClinicEz.Pharmacy.Infrastructure.Context;
using ClinicEz.Pharmacy.Infrastructure.Persistence;
using ClinicEz.Pharmacy.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Transport;
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

/// <summary>
/// The pharmacy side of the billing round trip (<c>billing.payment.confirmed</c>), the policy/name snapshot taken when a prescription
/// arrives, the claim-by-QR delivery path, and the HTTP mapping of gate and claim failures.
/// </summary>
public class PharmacyBillingAndClaimTests
{
    private const string PharmacyTenant = "tenant-pharmacy";
    private const string ClinicTenant = "tenant-clinic";
    private static readonly Guid PharmacyGuid = new("aaaaaaaa-0000-0000-0000-000000000001");
    private static readonly Guid ClinicGuid = new("cccccccc-0000-0000-0000-000000000001");

    private static Party PharmacyParty => Party.ForFacility(PharmacyTenant, PharmacyGuid.ToString(), FacilityType.Pharmacy);
    private static Party BillingParty => Party.ForFacility(PharmacyTenant, PharmacyGuid.ToString(), FacilityType.Pharmacy, InteropServices.Billing);
    private static Party ClinicParty => Party.ForFacility(ClinicTenant, ClinicGuid.ToString(), FacilityType.Clinic);

    private sealed class Fixture
    {
        public required ApplicationDbContext Db { get; init; }
        public required TestPharmacyScope Scope { get; init; }
        public required FacilityCreatedHandler FacilityHandler { get; init; }
        public required PrescriptionIssuedHandler RxHandler { get; init; }
        public required BillingPaymentConfirmedHandler PaymentHandler { get; init; }
    }

    private static Fixture CreateFixture()
    {
        var scope = new TestPharmacyScope(string.Empty, Guid.Empty);
        var db = PharmacyTestDbHelper.CreateContext($"Pharmacy_BillingDb_{Guid.NewGuid()}", scope);
        var sieve = Substitute.For<ISieveProcessor>();
        var uow = new UnitOfWork(db, sieve, Substitute.For<IProductRepository>());
        var orders = new Repository<PrescriptionOrder>(db, sieve);
        var settings = new Repository<PharmacySettings>(db, sieve);

        return new Fixture
        {
            Db = db,
            Scope = scope,
            FacilityHandler = new FacilityCreatedHandler(
                settings, uow, scope, new InteropPublisher(db), NullLogger<FacilityCreatedHandler>.Instance),
            RxHandler = new PrescriptionIssuedHandler(
                orders, new Repository<PharmacyInventoryItem>(db, sieve), settings, uow, scope, NullLogger<PrescriptionIssuedHandler>.Instance),
            PaymentHandler = new BillingPaymentConfirmedHandler(
                orders, settings, uow, scope, NullLogger<BillingPaymentConfirmedHandler>.Instance)
        };
    }

    private static InteropMessageContext Ctx(Party from, Party to, string type, Guid? correlationId = null) =>
        new(InteropEnvelope.Create(type, from, to, correlationId ?? Guid.NewGuid(), new object()));

    private static async Task ProvisionAsync(Fixture f)
    {
        await f.FacilityHandler.HandleAsync(
            new FacilityCreatedEvent
            {
                TenantId = PharmacyTenant,
                FacilityType = FacilityType.Pharmacy,
                ResourceId = PharmacyGuid,
                Name = "Rizal Community Pharmacy",
                PlanTier = "Community"
            },
            Ctx(Party.Portal, PharmacyParty, InteropTypes.FacilityLicenseIssued),
            CancellationToken.None);
        f.Scope.Enter(string.Empty, Guid.Empty);
    }

    private static PrescriptionIssuedEvent Rx(string number) => new()
    {
        PrescriptionId = Guid.NewGuid(),
        PrescriptionNumber = number,
        OrderingFacilityName = "Downtown Medical Clinic",
        VisitKey = "visit-42",
        PrescriberDoctor = new PrescriberDoctorDto { DoctorName = "Dr. Reyes", PrcLicenseNumber = "PRC-001" },
        Patient = new PrescriptionPatientDto { PatientId = Guid.NewGuid(), FullName = "Juan Dela Cruz" },
        Items = new List<PrescriptionItemDto> { new() { GenericName = "Amlodipine", Dosage = "5mg", Quantity = 30 } }
    };

    private static async Task<PrescriptionOrder> SeedAwaitingPaymentAsync(Fixture f)
    {
        var order = new PrescriptionOrder
        {
            Id = Guid.NewGuid(),
            TenantId = PharmacyTenant,
            PharmacyId = PharmacyGuid.ToString(),
            PharmacyName = "Rizal Community Pharmacy",
            OrderingTenantId = ClinicTenant,
            OrderingFacilityId = ClinicGuid.ToString(),
            PrescriptionNumber = "RX-PAY-001",
            PatientName = "Juan Dela Cruz",
            Status = PrescriptionStatus.Accepted,
            PaymentPolicy = PharmacyPaymentPolicy.Prepaid,
            PaymentStatus = PrescriptionPaymentStatus.AwaitingPayment,
            QuotedAmount = 255m
        };
        f.Db.PrescriptionOrders.Add(order);
        await f.Db.SaveChangesAsync();
        return order;
    }

    private static BillingPaymentConfirmedPayload Payment(Guid orderId, decimal paid = 255m, bool fullyPaid = true, string sourceType = "Prescription") => new()
    {
        InvoiceRequestId = orderId,
        InvoiceId = Guid.NewGuid(),
        SourceType = sourceType,
        SourceId = orderId,
        AmountDue = 255m,
        AmountPaid = paid,
        FullyPaid = fullyPaid,
        ReceiptNumber = "OR-0001",
        PaidAtUtc = new DateTime(2026, 10, 9, 8, 30, 0, DateTimeKind.Utc)
    };

    private static Task ConfirmAsync(Fixture f, BillingPaymentConfirmedPayload payload, Party? from = null, Party? to = null) =>
        f.PaymentHandler.HandleAsync(
            payload,
            Ctx(from ?? BillingParty, to ?? PharmacyParty, InteropTypes.BillingPaymentConfirmed),
            CancellationToken.None);

    // ── billing.payment.confirmed ───────────────────────────────────────────────────────

    [Fact]
    public async Task PaymentConfirmed_FullyPaid_MarksTheOrderPaid()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var order = await SeedAwaitingPaymentAsync(f);

        await ConfirmAsync(f, Payment(order.Id));

        var saved = await f.Db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync();
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
        saved.PaidAmount.Should().Be(255m);
        saved.PaidAt.Should().Be(new DateTime(2026, 10, 9, 8, 30, 0, DateTimeKind.Utc));
        saved.PaymentReceiptNumber.Should().Be("OR-0001");
        PrescriptionDispenseGate.BlockedReason(saved).Should().BeNull("a paid Prepaid order may now be dispensed");
    }

    [Fact]
    public async Task PaymentConfirmed_PartialPayment_RecordsTheAmountButKeepsWaiting()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var order = await SeedAwaitingPaymentAsync(f);

        await ConfirmAsync(f, Payment(order.Id, paid: 100m, fullyPaid: false));

        var saved = await f.Db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync();
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        saved.PaidAmount.Should().Be(100m);
        saved.PaidAt.Should().BeNull();
    }

    [Fact]
    public async Task PaymentConfirmed_Duplicate_ChangesNothing()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var order = await SeedAwaitingPaymentAsync(f);
        await ConfirmAsync(f, Payment(order.Id));
        var firstSave = await f.Db.PrescriptionOrders.IgnoreQueryFilters().AsNoTracking().SingleAsync();

        await ConfirmAsync(f, Payment(order.Id, paid: 999m));

        var saved = await f.Db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync();
        saved.PaidAmount.Should().Be(firstSave.PaidAmount);
        saved.UpdatedAt.Should().Be(firstSave.UpdatedAt);
    }

    [Fact]
    public async Task PaymentConfirmed_IsIgnored_ForAnythingButThisPharmacysBillingService()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var order = await SeedAwaitingPaymentAsync(f);
        var otherFacilityBilling = Party.ForFacility(PharmacyTenant, Guid.NewGuid().ToString(), FacilityType.Pharmacy, InteropServices.Billing);
        var otherTenantBilling = Party.ForFacility("tenant-other", PharmacyGuid.ToString(), FacilityType.Pharmacy, InteropServices.Billing);
        var stranger = Party.ForFacility(PharmacyTenant, Guid.NewGuid().ToString(), FacilityType.Pharmacy);

        await ConfirmAsync(f, Payment(order.Id), from: PharmacyParty);
        await ConfirmAsync(f, Payment(order.Id), from: ClinicParty);
        await ConfirmAsync(f, Payment(order.Id), from: Party.Portal);
        await ConfirmAsync(f, Payment(order.Id), from: otherFacilityBilling);
        await ConfirmAsync(f, Payment(order.Id), from: otherTenantBilling);
        await ConfirmAsync(f, Payment(order.Id), to: ClinicParty);
        await ConfirmAsync(f, Payment(order.Id), to: stranger);
        await ConfirmAsync(f, Payment(order.Id, sourceType: "LabOrder"));

        var saved = await f.Db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync();
        saved.PaymentStatus.Should().Be(PrescriptionPaymentStatus.AwaitingPayment);
        saved.PaidAmount.Should().BeNull();
    }

    [Fact]
    public async Task PaymentConfirmed_ForAnUnknownOrder_OrAnUnprovisionedPharmacy_IsIgnored()
    {
        var f = CreateFixture();

        await ConfirmAsync(f, Payment(Guid.NewGuid()));
        await ProvisionAsync(f);
        await ConfirmAsync(f, Payment(Guid.NewGuid()));

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().AnyAsync()).Should().BeFalse();
    }

    [Fact]
    public async Task Dispatcher_RoutesPaymentConfirmed_ToTheHandler_InThePharmacyScope()
    {
        var dbName = $"Pharmacy_BillingE2E_{Guid.NewGuid()}";
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Pharmacy,
            ["Messaging:Enabled"] = "false",
            ["DbSchema"] = "pharmacy_dashboard"
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
            .Handle<BillingPaymentConfirmedPayload, BillingPaymentConfirmedHandler>(InteropTypes.BillingPaymentConfirmed));
        await using var provider = services.BuildServiceProvider();
        var dispatcher = provider.GetRequiredService<InteropDispatcher>();

        var license = InteropEnvelope.Create(
            InteropTypes.FacilityLicenseIssued, Party.Portal, PharmacyParty, PharmacyGuid,
            new FacilityCreatedEvent { TenantId = PharmacyTenant, FacilityType = FacilityType.Pharmacy, ResourceId = PharmacyGuid, Name = "Rizal Community Pharmacy" });
        (await dispatcher.DispatchAsync(license, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);

        var orderId = Guid.NewGuid();
        using (var seedScope = provider.CreateScope())
        {
            var seedDb = seedScope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
            seedDb.PrescriptionOrders.Add(new PrescriptionOrder
            {
                Id = orderId,
                TenantId = PharmacyTenant,
                PharmacyId = PharmacyGuid.ToString(),
                PharmacyName = "Rizal Community Pharmacy",
                PrescriptionNumber = "RX-E2E-PAY",
                PatientName = "Juan Dela Cruz",
                Status = PrescriptionStatus.Accepted,
                PaymentPolicy = PharmacyPaymentPolicy.Prepaid,
                PaymentStatus = PrescriptionPaymentStatus.AwaitingPayment
            });
            await seedDb.SaveChangesAsync();
        }

        var envelope = InteropEnvelope.Create(InteropTypes.BillingPaymentConfirmed, BillingParty, PharmacyParty, orderId, Payment(orderId));
        (await dispatcher.DispatchAsync(envelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await dispatcher.DispatchAsync(envelope, CancellationToken.None)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        using var scope = provider.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        (await db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync()).PaymentStatus.Should().Be(PrescriptionPaymentStatus.Paid);
    }

    // ── snapshot at receipt + claim delivery ────────────────────────────────────────────

    [Fact]
    public async Task RxIssued_SnapshotsThePharmacyNamePaymentPolicyAndVisitKey_OntoTheOrder()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var rx = Rx("RX-SNAPSHOT");

        await f.RxHandler.HandleAsync(rx, Ctx(ClinicParty, PharmacyParty, InteropTypes.RxIssued, rx.PrescriptionId), CancellationToken.None);

        var order = await f.Db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync();
        order.PharmacyName.Should().Be("Rizal Community Pharmacy");
        order.PaymentPolicy.Should().Be(PharmacyPaymentPolicy.Prepaid, "a newly provisioned pharmacy defaults to Prepaid");
        order.PaymentStatus.Should().Be(PrescriptionPaymentStatus.NotRequired, "payment is only requested once the prescription is accepted");
        order.VisitKey.Should().Be("visit-42");
    }

    [Fact]
    public async Task RxIssued_UsesThePolicyConfiguredAtTheTimeItArrives()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var settings = await f.Db.PharmacySettings.IgnoreQueryFilters().SingleAsync();
        settings.PaymentPolicy = PharmacyPaymentPolicy.Postpaid;
        await f.Db.SaveChangesAsync();
        var rx = Rx("RX-POSTPAID");

        await f.RxHandler.HandleAsync(rx, Ctx(ClinicParty, PharmacyParty, InteropTypes.RxIssued, rx.PrescriptionId), CancellationToken.None);

        (await f.Db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync()).PaymentPolicy.Should().Be(PharmacyPaymentPolicy.Postpaid);
    }

    [Fact]
    public async Task ClaimedPrescription_IsRedeemedThroughTheHub_AndIngestedWithTheIssuingClinicAsTheOrderingParty()
    {
        var f = CreateFixture();
        await ProvisionAsync(f);
        var hub = new InProcessHub();
        var claims = new InProcessHubClaimsClient(hub);
        var rx = Rx("RX-CLAIMED");
        var slip = await claims.CreateAsync(
            new ClaimSlipRequest(InteropEnvelope.Create(
                InteropTypes.RxIssued,
                ClinicParty,
                new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Pharmacy },
                rx.PrescriptionId,
                rx)),
            CancellationToken.None);
        var claim = new ClaimPrescriptionCommandHandler(claims, new TestPharmacyScope(PharmacyTenant, PharmacyGuid));

        var result = await claim.Handle(new ClaimPrescriptionCommand($"  {slip.Token}  "), CancellationToken.None);

        result.PrescriptionId.Should().Be(rx.PrescriptionId);
        result.ClaimId.Should().Be(slip.ClaimId);
        result.IssuerTenantId.Should().Be(ClinicTenant);
        result.IssuerFacilityId.Should().Be(ClinicGuid.ToString());
        var delivered = hub.Pull(InteropServices.Pharmacy, 10).Should().ContainSingle().Subject.Envelope;
        delivered.To.Should().Be(PharmacyParty);
        delivered.From.Should().Be(ClinicParty);

        await f.RxHandler.HandleAsync(
            delivered.GetPayload<PrescriptionIssuedEvent>(),
            new InteropMessageContext(delivered),
            CancellationToken.None);

        var order = await f.Db.PrescriptionOrders.IgnoreQueryFilters().SingleAsync();
        order.OrderingTenantId.Should().Be(ClinicTenant);
        order.OrderingFacilityId.Should().Be(ClinicGuid.ToString());
        order.CorrelationId.Should().Be(rx.PrescriptionId);
        order.ExternalPrescriptionId.Should().Be(rx.PrescriptionId);
        order.TenantId.Should().Be(PharmacyTenant);
        order.PharmacyId.Should().Be(PharmacyGuid.ToString());
    }

    [Fact]
    public async Task Claim_ReusingAToken_IsRefusedByTheHub()
    {
        var hub = new InProcessHub();
        var claims = new InProcessHubClaimsClient(hub);
        var rx = Rx("RX-ONCE");
        var slip = await claims.CreateAsync(
            new ClaimSlipRequest(InteropEnvelope.Create(
                InteropTypes.RxIssued, ClinicParty, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Pharmacy }, rx.PrescriptionId, rx)),
            CancellationToken.None);
        var handler = new ClaimPrescriptionCommandHandler(claims, new TestPharmacyScope(PharmacyTenant, PharmacyGuid));

        await handler.Handle(new ClaimPrescriptionCommand(slip.Token), CancellationToken.None);
        var again = async () => await handler.Handle(new ClaimPrescriptionCommand(slip.Token), CancellationToken.None);

        (await again.Should().ThrowAsync<HubClaimException>()).Which.StatusCode.Should().Be(HttpStatusCode.Conflict);
    }

    [Fact]
    public async Task Claim_OfAnUnknownOrExpiredToken_SurfacesTheHubFailure()
    {
        var hub = new InProcessHub();
        var claims = new InProcessHubClaimsClient(hub);
        var rx = Rx("RX-EXPIRED");
        var expired = await claims.CreateAsync(
            new ClaimSlipRequest(
                InteropEnvelope.Create(InteropTypes.RxIssued, ClinicParty, new Party { Kind = PartyKind.Facility, FacilityType = FacilityType.Pharmacy }, rx.PrescriptionId, rx),
                TtlHours: 0),
            CancellationToken.None);
        var handler = new ClaimPrescriptionCommandHandler(claims, new TestPharmacyScope(PharmacyTenant, PharmacyGuid));

        var unknown = async () => await handler.Handle(new ClaimPrescriptionCommand("no-such-token"), CancellationToken.None);
        var gone = async () => await handler.Handle(new ClaimPrescriptionCommand(expired.Token), CancellationToken.None);

        (await unknown.Should().ThrowAsync<HubClaimException>()).Which.StatusCode.Should().Be(HttpStatusCode.NotFound);
        (await gone.Should().ThrowAsync<HubClaimException>()).Which.StatusCode.Should().Be(HttpStatusCode.Gone);
    }

    [Fact]
    public async Task Claim_WithoutAPharmacyWorkspace_IsForbidden_AndNeverCallsTheHub()
    {
        var claims = Substitute.For<IHubClaimsClient>();
        var handler = new ClaimPrescriptionCommandHandler(claims, new TestPharmacyScope(string.Empty, Guid.Empty));

        var act = async () => await handler.Handle(new ClaimPrescriptionCommand("token"), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>();
        claims.ReceivedCalls().Should().BeEmpty();
    }

    [Fact]
    public async Task Claim_RedeemsForTheStaffMembersOwnPharmacy()
    {
        var claims = Substitute.For<IHubClaimsClient>();
        claims.RedeemAsync(default!, default!, default).ReturnsForAnyArgs(
            new ClaimRedeemResult(Guid.NewGuid(), Guid.NewGuid(), Guid.NewGuid(), InteropTypes.RxIssued, ClinicTenant, ClinicGuid.ToString()));
        var handler = new ClaimPrescriptionCommandHandler(claims, new TestPharmacyScope(PharmacyTenant, PharmacyGuid));

        await handler.Handle(new ClaimPrescriptionCommand("token-1"), CancellationToken.None);

        await claims.Received(1).RedeemAsync(
            "token-1", new ClaimRedeemRequest(PharmacyTenant, PharmacyGuid.ToString()), Arg.Any<CancellationToken>());
    }

    // ── HTTP mapping of gate and claim failures ─────────────────────────────────────────

    private static async Task<(bool Handled, int Status, string Code)> HandleAsync(Exception exception)
    {
        var context = new DefaultHttpContext();
        context.Response.Body = new MemoryStream();

        var handled = await new PharmacyExceptionHandler().TryHandleAsync(context, exception, CancellationToken.None);

        context.Response.Body.Position = 0;
        var code = string.Empty;
        if (handled)
        {
            using var json = await JsonDocument.ParseAsync(context.Response.Body);
            code = json.RootElement.GetProperty("errors")[0].GetProperty("code").GetString()!;
        }

        return (handled, context.Response.StatusCode, code);
    }

    [Theory]
    [InlineData(PharmacyErrorCodes.PaymentRequired)]
    [InlineData(PharmacyErrorCodes.AcceptanceRequired)]
    [InlineData(PharmacyErrorCodes.InvalidState)]
    public async Task GateConflicts_AreHttp409_WithTheirStableCode(string code)
    {
        var result = await HandleAsync(new PharmacyConflictException(code, "blocked"));

        result.Should().Be((true, 409, code));
    }

    [Theory]
    [InlineData(HttpStatusCode.NotFound, 404, "claim_not_found")]
    [InlineData(HttpStatusCode.Conflict, 409, "claim_already_redeemed")]
    [InlineData(HttpStatusCode.Gone, 410, "claim_expired")]
    [InlineData(HttpStatusCode.Forbidden, 403, "claim_forbidden")]
    [InlineData(HttpStatusCode.UnprocessableEntity, 422, "claim_wrong_facility_type")]
    [InlineData(HttpStatusCode.InternalServerError, 502, "claim_unavailable")]
    public async Task HubClaimFailures_MapToTheirHttpStatusAndCode(HttpStatusCode hubStatus, int status, string code)
    {
        var result = await HandleAsync(new HubClaimException(hubStatus, "hub said no"));

        result.Should().Be((true, status, code));
    }

    [Fact]
    public async Task OtherExceptions_AreLeftToTheGlobalHandler()
    {
        var result = await HandleAsync(new InvalidOperationException("boom"));

        result.Handled.Should().BeFalse();
    }
}
