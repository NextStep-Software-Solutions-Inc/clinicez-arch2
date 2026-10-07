using System.Threading.RateLimiting;
using Scalar.AspNetCore;
using ClinicEz.Clinic.Api;
using ClinicEz.Clinic.Api.Authorization;
using ClinicEz.Clinic.Application;
using ClinicEz.Clinic.Infrastructure;
using ClinicEz.Clinic.Infrastructure.Auth;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Middlewares;
using Hangfire;
using Microsoft.AspNetCore.RateLimiting;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;
builder.Configuration.AddJsonFile("appsettings.json", false, true);
builder.Configuration.AddJsonFile($"appsettings.{env.EnvironmentName}.json", true, true);
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, true);

// 1. Add services from our other layers
builder.Services
    .AddApiServices()
    .AddApplicationServices()
    .AddInfrastructureServices(builder.Configuration, builder.Environment)
    .AddClinicEzCors(builder.Configuration, builder.Environment);

// 2. Facility-local authentication: JWT issued and validated by this service (no internet / identity provider required).
//    Secure by default: every endpoint requires a valid session unless explicitly [AllowAnonymous].
builder.Services.AddFacilityLocalAuth(
    builder.Configuration,
    audience: "clinicez-clinic",
    onTokenValidated: ClinicTokenEvents.OnTokenValidated);
builder.Services.AddScoped<SimulationEnabledFilter>();
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(FacilityLocalAuthExtensions.AuthRateLimitPolicy, httpContext =>
        RateLimitPartition.GetFixedWindowLimiter(
            httpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = builder.Configuration.GetValue("Auth:RateLimitPerMinute", 30),
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0
            }));
});

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Clinic Dashboard API")).AllowAnonymous();
}

// 4. Add middleware
app.UseCors();
app.UseHttpsRedirection();
app.UseExceptionHandler(); // Use our global exception handler
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<ClinicScopeMiddleware>();
app.UseMiddleware<ClinicEz.Clinic.Infrastructure.Idempotency.IdempotencyMiddleware>();
app.UseHangfireDashboard(); // Add Hangfire Dashboard endpoint

// 5. Tell the app to use controllers
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
app.MapControllers();

app.Run();
