using ClinicEz.PhilHealthProxy.Api;
using ClinicEz.PhilHealthProxy.Api.Middlewares;
using ClinicEz.PhilHealthProxy.Application;
using ClinicEz.PhilHealthProxy.Infrastructure;
using Scalar.AspNetCore;

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
    app.MapOpenApi();
    app.MapScalarApiReference(opts => opts.WithTitle("ClinicEz PhilHealth Proxy API"));

    try
    {
        using var scope = app.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ClinicEz.PhilHealthProxy.Infrastructure.Persistence.ApplicationDbContext>();
        dbContext.Database.EnsureCreated();
    }
    catch (Exception ex)
    {
        var logger = app.Services.GetRequiredService<ILogger<Program>>();
        logger.LogWarning(ex, "[PhilHealthProxy] Could not auto-create database tables on startup. Verify PostgreSQL ConnectionString.");
    }
}

app.UseHttpsRedirection();
app.UseExceptionHandler();
app.UseMiddleware<TenantResolutionMiddleware>();
app.MapControllers();

app.Run();

// Exposed for WebApplicationFactory<Program> in integration-test projects.
public partial class Program { }
