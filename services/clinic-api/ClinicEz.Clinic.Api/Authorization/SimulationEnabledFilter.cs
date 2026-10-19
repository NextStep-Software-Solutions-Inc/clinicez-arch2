using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace ClinicEz.Clinic.Api.Authorization;

/// <summary>
/// Hides sandbox/simulation endpoints (e.g. the PhilHealth SOAP simulator) unless <c>Features:YakapSimulation</c> is
/// <c>true</c>. Enabled only in Development/Staging appsettings; production returns 404.
/// </summary>
public sealed class SimulationEnabledFilter : IResourceFilter
{
    private readonly IConfiguration _configuration;

    public SimulationEnabledFilter(IConfiguration configuration) => _configuration = configuration;

    public void OnResourceExecuting(ResourceExecutingContext context)
    {
        if (!_configuration.GetValue<bool>("Features:YakapSimulation"))
        {
            context.Result = new NotFoundResult();
        }
    }

    public void OnResourceExecuted(ResourceExecutedContext context)
    {
    }
}
