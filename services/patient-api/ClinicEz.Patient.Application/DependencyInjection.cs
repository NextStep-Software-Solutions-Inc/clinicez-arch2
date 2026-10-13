using FluentValidation;
using MediatR;
using Microsoft.Extensions.DependencyInjection;
using ClinicEz.Patient.Application.Common.Behaviors;
using System.Reflection;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Documents;
using ClinicEz.Patient.Application.Features.Documents.Interop;
using ClinicEz.Patient.Application.Features.Sharing;
using Microsoft.Extensions.DependencyInjection.Extensions;

namespace ClinicEz.Patient.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddMediatR(config =>
            config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly()));

        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());

        // MediatR validation pipeline behavior
        services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

        services.TryAddSingleton(TimeProvider.System);
        services.AddSingleton<IShareTokenService, ShareTokenService>();
        services.AddSingleton<IShareCodeService, ShareCodeService>();
        services.AddScoped<PatientShareSnapshotBuilder>();
        services.AddScoped<PatientDocumentMapper>();
        services.AddScoped<PatientDocumentNotifier>();
        services.AddSingleton<ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake.IPatientClaimConflictResolver, ClinicEz.Patient.Application.Features.Patients.Commands.ClaimIntake.PatientClaimConflictResolver>();

        return services;
    }
}
