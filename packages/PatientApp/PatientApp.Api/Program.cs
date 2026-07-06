using System.Text.Json;
using System.Text.Json.Serialization;
using Hangfire;
using Hangfire.Dashboard;
using PatientApp.Api;
using PatientApp.Api.Extensions;
using PatientApp.Api.Hubs;
using PatientApp.Api.Infrastructure;
using PatientApp.Api.Middleware;
using PatientApp.Application;
using PatientApp.Infrastructure;
using Scalar.AspNetCore;
using Microsoft.AspNetCore.HttpOverrides;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration
    .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true)
    .AddJsonFile($"appsettings.{builder.Environment.EnvironmentName}.json", optional: true, reloadOnChange: true)
    .AddUserSecrets<Program>(optional: true)
    .AddEnvironmentVariables();

// ── JSON: camelCase properties + lowercase enum strings (matches mobile expectations) ────
builder.Services.ConfigureHttpJsonOptions(opts =>
{
    opts.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
    opts.SerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    opts.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services
    .AddApiServices()
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
    app.MapScalarApiReference(opts => opts.WithTitle("ClinicEZ Patient App API"));
}

app.UseForwardedHeaders();
app.UseCors(policy => policy.AllowAnyOrigin().AllowAnyMethod().AllowAnyHeader());
app.UseHttpsRedirection();
app.UseExceptionHandler();

app.UseAuthentication();
app.UseAuthorization();

// E2E payload encryption — only active when Encryption:Enabled = true (Production).
// Decrypts request bodies and encrypts response bodies using AES-256-GCM.
// Bypassed entirely in Development (Encryption:Enabled = false in appsettings.Development.json).
if (app.Configuration.GetValue<bool>("Encryption:Enabled"))
    app.UseMiddleware<PayloadEncryptionMiddleware>();

// Hangfire dashboard — protected by HTTP Basic Auth (credentials from config)
var hangfireAuth = app.Services.GetRequiredService<HangfireDashboardBasicAuthFilter>();
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [hangfireAuth],
    IsReadOnlyFunc = _ => !app.Environment.IsDevelopment(),
});

// Auto-maps all IEndpoint implementations under /api/v1
app.MapApiEndpoints();

// SignalR hub for real-time sync state & session management
app.MapHub<SyncHub>("/hubs/sync");

app.Run();

// Anchor for WebApplicationFactory in integration tests
public partial class Program { }
