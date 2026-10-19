using ClinicEz.Billing.Application;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Infrastructure;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using ClinicEz.Shared.LocalAuth;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Billing.Tests.TestSupport;

internal sealed class TestClock : TimeProvider
{
    private DateTimeOffset _now = new(2026, 3, 10, 2, 0, 0, TimeSpan.Zero);

    public override DateTimeOffset GetUtcNow() => _now;

    public void Advance(TimeSpan by) => _now += by;

    public void Set(DateTimeOffset value) => _now = value;
}

/// <summary>Stands in for the HTTP-bound <c>BillingContext</c>: tests choose who is "signed in".</summary>
internal sealed class TestBillingContext : IBillingContext
{
    public BillingCaller? Caller { get; set; }

    public string? TenantId => Caller?.TenantId;

    public BillingCaller RequireStaff() => Caller ?? throw new ForbiddenException("A signed-in cashier session is required for this action.");

    public BillingCaller? TryGetStaff() => Caller;

    public bool HasPermission(string permission) => Caller?.Has(permission) ?? false;
}

/// <summary>Makes the next saves fail, to prove business rows and outbox rows commit (or roll back) together.</summary>
internal sealed class FailingSaveInterceptor : SaveChangesInterceptor
{
    public bool Fail { get; set; }

    public override ValueTask<InterceptionResult<int>> SavingChangesAsync(
        DbContextEventData eventData, InterceptionResult<int> result, CancellationToken cancellationToken = default)
    {
        if (Fail) throw new DbUpdateException("Simulated database failure.");
        return base.SavingChangesAsync(eventData, result, cancellationToken);
    }
}

/// <summary>billing-api wired exactly like the service (same DI extensions), on the in-process hub and an in-memory database.</summary>
internal sealed class BillingHost : IDisposable
{
    public const string TenantA = "tenant-a";
    public const string TenantB = "tenant-b";
    public const string Clinic = "clinic-1";
    public const string Lab = "lab-1";
    public const string Pharmacy = "pharmacy-1";

    public ServiceProvider Provider { get; }
    public TestClock Clock { get; } = new();
    public TestBillingContext Context { get; } = new();
    public FailingSaveInterceptor Interceptor { get; } = new();

    public InProcessHub Hub => Provider.GetRequiredService<InProcessHub>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();
    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();

    public BillingHost()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DbSchema"] = "public",
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Billing,
            ["Messaging:Enabled"] = "false",
            ["Jwt:Audience"] = "clinicez-billing",
            ["Jwt:SigningKey"] = Convert.ToBase64String(new byte[64].Select((_, i) => (byte)(i + 1)).ToArray())
        }).Build();

        var dbName = $"Billing_Db_{Guid.NewGuid()}";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton<TimeProvider>(Clock);
        services.AddApplicationServices();
        services.AddInfrastructureServices(config, o => o.UseInMemoryDatabase(dbName).AddInterceptors(Interceptor));
        services.AddFacilityLocalAuth(config, "clinicez-billing", BillingTokenEvents.OnTokenValidated);
        services.AddSingleton<IBillingContext>(Context);
        Provider = services.BuildServiceProvider();
    }

    /// <summary>Signs a cashier in (sets the current caller) and returns it.</summary>
    public BillingCaller As(string tenantId, string facilityId, StaffRole role = StaffRole.Cashier, string? name = null, Guid? userId = null)
    {
        var caller = new BillingCaller(tenantId, facilityId, userId ?? Guid.NewGuid(), name ?? $"{role} {facilityId}", role, BillingRolePermissions.For(role));
        Context.Caller = caller;
        return caller;
    }

    public void SignOut() => Context.Caller = null;

    public async Task<TResult> With<TService, TResult>(Func<TService, Task<TResult>> action) where TService : notnull
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<TService>());
    }

    public Task<TResult> Db<TResult>(Func<ApplicationDbContext, Task<TResult>> action) => With(action);

    public Task<List<InteropOutboxMessage>> OutboxAsync() => Db(db => db.InteropOutbox.AsNoTracking().OrderBy(o => o.CreatedAtUtc).ToListAsync());

    public Task<List<Invoice>> InvoicesAsync() => Db(db => db.Invoices.IgnoreQueryFilters().AsNoTracking().Include(i => i.Lines).Include(i => i.Discounts).ToListAsync());

    public Task<List<AuditEntry>> AuditAsync() => Db(db => db.AuditEntries.IgnoreQueryFilters().AsNoTracking().OrderBy(a => a.AtUtc).ToListAsync());

    public async Task<Invoice> InvoiceAsync(Guid id) => (await InvoicesAsync()).Single(i => i.Id == id);

    public static BillingInvoiceRequestedPayload Request(
        string tenantId, string facilityId, FacilityType type, Guid? requestId = null, string? visitKey = "visit-1", string patient = "Juan Dela Cruz",
        Guid? patientId = null, string? branchId = "branch-1", string sourceType = "Consultation", IReadOnlyList<BillingLineDto>? lines = null) =>
        new()
        {
            InvoiceRequestId = requestId ?? Guid.NewGuid(),
            TenantId = tenantId,
            FacilityId = facilityId,
            FacilityType = type,
            BranchId = branchId,
            PatientId = patientId,
            PatientName = patient,
            VisitKey = visitKey,
            SourceType = sourceType,
            SourceId = Guid.NewGuid(),
            Lines = lines is { Count: > 0 } ? lines.ToList() : new List<BillingLineDto> { Line("CONSULT", "Consultation", 1, 500m) }
        };

    public static BillingLineDto Line(string code, string description, int quantity, decimal unitPrice) =>
        new() { Code = code, Description = description, Quantity = quantity, UnitPrice = unitPrice };

    /// <summary>The request envelope exactly as a facility's interop SDK would send it to its cell's billing mailbox.</summary>
    public static InteropEnvelope Envelope(BillingInvoiceRequestedPayload payload) =>
        InteropEnvelope.Create(
            InteropTypes.BillingInvoiceRequested,
            Party.ForFacility(payload.TenantId, payload.FacilityId, payload.FacilityType),
            Party.ForFacility(payload.TenantId, payload.FacilityId, payload.FacilityType, InteropServices.Billing),
            payload.InvoiceRequestId,
            payload);

    public async Task<Invoice> ReceiveAsync(BillingInvoiceRequestedPayload payload)
    {
        var result = await Dispatcher.DispatchAsync(Envelope(payload), default);
        if (result.Outcome != DispatchOutcome.Handled) throw new InvalidOperationException($"Dispatch was {result.Outcome}: {result.Error}");

        return (await InvoicesAsync()).Single(i => i.TenantId == payload.TenantId && i.FacilityId == payload.FacilityId && i.InvoiceRequestId == payload.InvoiceRequestId);
    }

    public async Task<Invoice> ReceiveAsync(string tenantId, string facilityId, FacilityType type, string? visitKey, decimal amount, Guid? patientId = null, string patient = "Juan Dela Cruz") =>
        await ReceiveAsync(Request(tenantId, facilityId, type, null, visitKey, patient, patientId, "branch-1", type.ToString(), new[] { Line("SVC", "Service", 1, amount) }));

    public Task<ShiftDto> OpenShiftAsync(decimal openingFloat = 1000m) =>
        With<ShiftService, ShiftDto>(s => s.OpenAsync(new OpenShiftRequest(openingFloat), default));

    public Task<PaymentDto> PayAsync(Guid anchorInvoiceId, decimal amount, PaymentMethod method = PaymentMethod.Cash, string? key = null, string? reference = null, decimal? tendered = null) =>
        With<PaymentService, PaymentDto>(p => p.TakeAsync(
            new TakePaymentRequest(method, amount, reference, tendered, method == PaymentMethod.Insurance ? InsurerKind.PhilHealth : null, anchorInvoiceId, null),
            key ?? Guid.NewGuid().ToString("N"), default));

    public async Task<List<InteropEnvelope>> RelayAsync()
    {
        await Relay.RunOnceAsync(default);
        return Hub.Sent.ToList();
    }

    public void Dispose() => Provider.Dispose();
}
