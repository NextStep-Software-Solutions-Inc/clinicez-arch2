using Hangfire;
using Hangfire.Dashboard;
using ClinicEz.Patient.Api;
using ClinicEz.Patient.Api.Extensions;
using ClinicEz.Patient.Api.Hubs;
using ClinicEz.Patient.Api.Infrastructure;
using ClinicEz.Patient.Api.Middleware;
using ClinicEz.Patient.Application;
using ClinicEz.Patient.Infrastructure;
using Scalar.AspNetCore;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddUserSecrets<Program>(optional: true)
    .AddEnvironmentVariables();

// ── JSON: camelCase properties + PascalCase enum member names; numeric enum values are rejected ────
builder.Services.ConfigureHttpJsonOptions(opts => ApiJson.Configure(opts.SerializerOptions));

builder.Services
    .AddApiServices(builder.Configuration, builder.Environment)
    .AddApplicationServices()
    .AddInfrastructureServices(builder.Configuration, builder.Environment);

builder.Services.Configure<ForwardedHeadersOptions>(options =>
{
    options.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    // Since we are deploying to an environment where we don't know the load balancer's IP,
    // we clear the known networks/proxies to accept the forwarded headers.
    options.KnownIPNetworks.Clear();
    options.KnownProxies.Clear();
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Patient App API"));
}

app.UseForwardedHeaders();
app.UseCors();
app.UseHttpsRedirection();
app.UseExceptionHandler();

app.UseAuthentication();
app.UseAuthorization();

// Object-level authorisation: callers may only address their own patient record.
// Runs after authentication/authorisation so the caller identity is known.
app.UseMiddleware<PatientOwnershipMiddleware>();

// Hangfire dashboard — protected by HTTP Basic Auth (credentials from config)
var hangfireAuth = app.Services.GetRequiredService<HangfireDashboardBasicAuthFilter>();
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [hangfireAuth],
    IsReadOnlyFunc = _ => !app.Environment.IsDevelopment(),
});

RecurringJob.AddOrUpdate<ClinicEz.Patient.Infrastructure.Services.Jobs.IFileUploadReconciliationJob>(
    "reconcile-file-uploads",
    job => job.ReconcilePendingUploadsAsync(CancellationToken.None),
    "*/15 * * * *"); // Run every 15 minutes

// Auto-maps all IEndpoint implementations under /api/v1
app.MapApiEndpoints();

// SignalR hub for real-time sync state & session management
app.MapHub<SyncHub>("/hubs/sync");

app.Run();

// Anchor for WebApplicationFactory in integration tests
public partial class Program { }
