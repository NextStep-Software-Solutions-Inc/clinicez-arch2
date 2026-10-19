using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using Sieve.Services;
using System.Reflection;
namespace ClinicEz.Portal.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplicationServices(this IServiceCollection services)
    {
        services.AddScoped<ISieveProcessor, SieveProcessor>();
        services.AddScoped<Features.Workspace.IWorkspaceAccessService, Features.Workspace.WorkspaceAccessService>();
        services.AddScoped<Features.Integrations.IWebhookDispatcher, Features.Integrations.WebhookDispatcher>();
        services.AddScoped<Features.Integrations.IApiKeyValidator, Features.Integrations.ApiKeyValidator>();
        services.AddScoped<Features.Billing.Services.IDocumentNumberGenerator, Features.Billing.Services.DocumentNumberGenerator>();
        services.AddValidatorsFromAssembly(Assembly.GetExecutingAssembly());
        services.AddMediatR(config =>
        {
            config.RegisterServicesFromAssembly(Assembly.GetExecutingAssembly());
            config.AddBehavior(typeof(MediatR.IPipelineBehavior<,>), typeof(Common.Behaviors.ValidationBehavior<,>));
        });

        return services;
    }
}