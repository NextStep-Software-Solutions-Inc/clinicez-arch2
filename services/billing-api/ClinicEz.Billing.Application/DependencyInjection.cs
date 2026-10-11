using ClinicEz.Billing.Application.Services;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicEz.Billing.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.TryAddSingleton(TimeProvider.System);

        services.AddScoped<DocumentNumbers>();
        services.AddScoped<AuditTrail>();
        services.AddScoped<VisitBillService>();
        services.AddScoped<DiscountService>();
        services.AddScoped<InvoiceService>();
        services.AddScoped<PaymentService>();
        services.AddScoped<CorrectionService>();
        services.AddScoped<ShiftService>();
        services.AddScoped<ReportService>();
        return services;
    }
}
