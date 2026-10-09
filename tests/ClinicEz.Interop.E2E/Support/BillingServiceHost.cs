using ClinicEz.Billing.Application;
using ClinicEz.Billing.Application.Abstractions;
using ClinicEz.Billing.Application.Dtos;
using ClinicEz.Billing.Application.Services;
using ClinicEz.Billing.Domain.Entities;
using ClinicEz.Billing.Domain.Constants;
using ClinicEz.Billing.Domain.Enums;
using ClinicEz.Billing.Infrastructure;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.LocalAuth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>Stands in for the HTTP-bound <c>BillingContext</c>: tests choose who is "signed in".</summary>
public sealed class SignedInBillingContext : IBillingContext
{
    public BillingCaller? Caller { get; set; }

    public string? TenantId => Caller?.TenantId;

    public BillingCaller RequireStaff() => Caller ?? throw new ForbiddenException("A signed-in cashier session is required for this action.");

    public BillingCaller? TryGetStaff() => Caller;

    public bool HasPermission(string permission) => Caller?.Has(permission) ?? false;
}

/// <summary>billing-api composed by its real <c>AddApplicationServices</c> + <c>AddInfrastructureServices</c> (database swapped for in-memory).</summary>
public sealed class BillingServiceHost : ServiceHostBase
{
    public SignedInBillingContext Context { get; } = new();

    public BillingServiceHost(HubFixture hub) : base(InteropServices.Billing)
    {
        var settings = BaseConfig(InteropServices.Billing, "billing");
        settings["Jwt:Audience"] = "clinicez-billing";
        settings["Jwt:SigningKey"] = Convert.ToBase64String(new byte[64].Select((_, i) => (byte)(i + 1)).ToArray());
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        var dbName = $"e2e-billing-{Guid.NewGuid():N}";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddApplicationServices();
        services.AddInfrastructureServices(config, o => o.UseInMemoryDatabase(dbName));
        services.AddFacilityLocalAuth(config, "clinicez-billing", BillingTokenEvents.OnTokenValidated);
        services.AddSingleton<IBillingContext>(Context);
        RouteHttpToHub(services, hub);

        Provider = services.BuildServiceProvider();
    }

    /// <summary>Signs a cashier of the facility in (the caller every following billing call runs as).</summary>
    public BillingCaller SignIn(string tenantId, string facilityId, StaffRole role = StaffRole.Cashier)
    {
        var caller = new BillingCaller(tenantId, facilityId, Guid.NewGuid(), $"{role} {facilityId}", role, BillingRolePermissions.For(role));
        Context.Caller = caller;
        return caller;
    }

    public void SignOut() => Context.Caller = null;

    public async Task<TResult> WithAsync<TService, TResult>(Func<TService, Task<TResult>> action) where TService : notnull
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<TService>());
    }

    public async Task<T> DbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    /// <summary>The invoice a facility's <c>billing.invoice.requested</c> became, found by the request id the facility sent.</summary>
    public Task<Invoice> InvoiceForAsync(Fac facility, Guid invoiceRequestId) => DbAsync(db =>
        db.Invoices.IgnoreQueryFilters().SingleAsync(i =>
            i.TenantId == facility.Tenant && i.FacilityId == facility.FacilityId && i.InvoiceRequestId == invoiceRequestId));

    public Task<ShiftDto> OpenShiftAsync(decimal openingFloat = 1000m) =>
        WithAsync<ShiftService, ShiftDto>(s => s.OpenAsync(new OpenShiftRequest(openingFloat), default));

    public Task<PaymentDto> PayAsync(Guid anchorInvoiceId, decimal amount) =>
        WithAsync<PaymentService, PaymentDto>(p => p.TakeAsync(
            new TakePaymentRequest(PaymentMethod.Cash, amount, null, null, null, anchorInvoiceId, null),
            Guid.NewGuid().ToString("N"), default));

    public Task<InvoiceDto> VoidAsync(Guid invoiceId, string reason) =>
        WithAsync<CorrectionService, InvoiceDto>(c => c.VoidAsync(invoiceId, new VoidRequest(reason), default));

    public Task<RefundDto> RefundAsync(Guid invoiceId, string reason, decimal? amount = null) =>
        WithAsync<CorrectionService, RefundDto>(c => c.RefundAsync(invoiceId, new RefundRequest(reason, amount, null, null), default));
}
