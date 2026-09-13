using ClinicEz.PhilHealthProxy.Api;
using ClinicEz.PhilHealthProxy.Api.Middlewares;
using ClinicEz.PhilHealthProxy.Application;
using ClinicEz.PhilHealthProxy.Infrastructure;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;

builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
builder.Configuration.AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true, reloadOnChange: true);
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, optional: true);

builder.Services
    .AddApiServices()
    .AddApplicationServices()
    .AddInfrastructureServices(builder.Configuration, builder.Environment);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseExceptionHandler();
app.UseMiddleware<TenantResolutionMiddleware>();
app.MapControllers();

app.Run();

// Exposed for WebApplicationFactory<Program> in integration-test projects.
public partial class Program { }
