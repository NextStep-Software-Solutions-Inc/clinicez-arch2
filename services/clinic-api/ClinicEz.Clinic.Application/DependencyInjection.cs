using ClinicEz.Clinic.Application.Behaviors;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Shared.Search;
using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using Sieve.Services;
using System.Reflection;

namespace ClinicEz.Clinic.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<ISieveProcessor, SieveProcessor>();

        services.AddMediatR(config =>
            { config.LicenseKey = ClinicEz.Shared.Common.MediatRLicense.Resolve(); config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()); });

        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

        // Register pluggable search providers via reflection assembly scanning
        services.AddPluggableSearch(Assembly.GetExecutingAssembly());

        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(AuditLoggingBehavior<,>));
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        services.AddSingleton<ClinicEz.Clinic.Application.Features.Yakap.Services.IPhilHealthPayloadEncryptor, ClinicEz.Clinic.Application.Features.Yakap.Services.PhilHealthPayloadEncryptor>();
        services.AddTransient<ClinicEz.Clinic.Application.Features.Yakap.WireBuilders.YakapFpeWireBuilder>();
        services.AddTransient<ClinicEz.Clinic.Application.Features.Yakap.WireBuilders.YakapConsultationWireBuilder>();
        services.AddTransient<ClinicEz.Clinic.Application.Features.Yakap.WireBuilders.YakapDiagnosticRequestWireBuilder>();
        services.AddTransient<ClinicEz.Clinic.Application.Features.Yakap.WireBuilders.YakapDiagnosticResultsWireBuilder>();
        services.AddTransient<ClinicEz.Clinic.Application.Features.Yakap.WireBuilders.YakapMedicineWireBuilder>();
        services.AddTransient<ClinicEz.Clinic.Application.Features.Yakap.WireBuilders.YakapReferralWireBuilder>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Schedules.Services.ISlotAvailabilityService, ClinicEz.Clinic.Application.Features.Schedules.Services.SlotAvailabilityService>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Queue.Services.IQueueNotificationDispatcher, ClinicEz.Clinic.Application.Features.Queue.Services.QueueNotificationDispatcher>();
        services.AddScoped<IAppointmentNotificationDispatcher, AppointmentNotificationDispatcher>();

        return services;
    }
}


