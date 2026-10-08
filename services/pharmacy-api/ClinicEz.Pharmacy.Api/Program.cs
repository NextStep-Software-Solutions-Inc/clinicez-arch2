using System.Threading.RateLimiting;
using Scalar.AspNetCore;
using ClinicEz.Pharmacy.Api;
using ClinicEz.Pharmacy.Application;
using ClinicEz.Pharmacy.Infrastructure;
using ClinicEz.Pharmacy.Infrastructure.Auth;
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
//    The pharmacy has its own audience, issuer and signing key, so a clinic token is never accepted here.
//    Secure by default: every endpoint requires a valid session (or the internal service key) unless explicitly [AllowAnonymous].
builder.Services.AddFacilityLocalAuth(
    builder.Configuration,
    audience: "clinicez-pharmacy",
    onTokenValidated: PharmacyTokenEvents.OnTokenValidated);
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
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Pharmacy Dashboard API")).AllowAnonymous();
}

// 4. Add middleware
app.UseCors();
app.UseHttpsRedirection();
app.UseExceptionHandler(); // Use our global exception handler
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseInternalServiceGuard(); // internal-key principal is default-denied except on permission-guarded endpoints
app.UseMiddleware<PharmacyScopeMiddleware>();
app.UseHangfireDashboard("/hangfire", new DashboardOptions { Authorization = [new HangfireDashboardAuthFilter(app.Configuration)] }); // Basic Auth; denied when no password is configured

// 5. Tell the app to use controllers
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
app.MapControllers();

app.Run();