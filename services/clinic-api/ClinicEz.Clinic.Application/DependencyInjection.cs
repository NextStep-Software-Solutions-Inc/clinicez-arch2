using ClinicEz.Clinic.Application.Behaviors;
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
            config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));

        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(AuditLoggingBehavior<,>));
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        services.AddScoped<ClinicEz.Clinic.Application.Features.Yakap.Services.IYakapClinicalMapper, ClinicEz.Clinic.Application.Features.Yakap.Services.YakapClinicalMapper>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Schedules.Services.ISlotAvailabilityService, ClinicEz.Clinic.Application.Features.Schedules.Services.SlotAvailabilityService>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Patients.Services.ILegacyPatientProfileIngestionService, ClinicEz.Clinic.Application.Features.Patients.Services.LegacyPatientProfileIngestionService>();
        services.AddScoped<ClinicEz.Clinic.Application.Features.Queue.Services.IQueueNotificationDispatcher, ClinicEz.Clinic.Application.Features.Queue.Services.QueueNotificationDispatcher>();

        return services;
    }
}


