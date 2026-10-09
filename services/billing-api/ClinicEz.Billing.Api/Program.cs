using System.Threading.RateLimiting;
using ClinicEz.Billing.Api;
using ClinicEz.Billing.Application;
using ClinicEz.Billing.Infrastructure;
using ClinicEz.Billing.Infrastructure.Auth;
using ClinicEz.Billing.Infrastructure.Persistence;
using ClinicEz.Shared.Licensing;
using ClinicEz.Shared.LocalAuth;
using ClinicEz.Shared.Middlewares;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;
builder.Configuration.AddJsonFile("appsettings.json", false, true);
builder.Configuration.AddJsonFile($"appsettings.{env.EnvironmentName}.json", true, true);
// CreateBuilder put the environment variables before the files added here, so the files would override them; re-add them last.
builder.Configuration.AddEnvironmentVariables();
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, true);

// 1. Add services from our other layers
builder.Services
    .AddApiServices()
    .AddApplicationServices()
    .AddInfrastructureServices(builder.Configuration)
    .AddClinicEzCors(builder.Configuration, builder.Environment);

// 2. Cell-local authentication: JWT issued and validated by this service (no internet / identity provider required).
//    Billing has its own user store, audience and signing key, so a clinic or laboratory token is never accepted here.
//    Secure by default: every endpoint requires a valid session unless explicitly [AllowAnonymous].
builder.Services.AddFacilityLocalAuth(
    builder.Configuration,
    audience: "clinicez-billing",
    onTokenValidated: BillingTokenEvents.OnTokenValidated);
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

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    scope.ServiceProvider.GetRequiredService<ApplicationDbContext>().Database.Migrate();

    app.MapOpenApi().AllowAnonymous();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Billing (Cashiering) API")).AllowAnonymous();
}

// 3. Add middleware
app.UseCors();
app.UseHttpsRedirection();
app.UseExceptionHandler(); // Use our global exception handler
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseInternalServiceGuard(); // internal-key principal is default-denied except on permission-guarded endpoints
app.UseMiddleware<BillingScopeMiddleware>();
app.UseReadOnlyGrace();

// 4. Tell the app to use controllers
app.MapGet("/health", () => Results.Ok(new { status = "healthy" })).AllowAnonymous();
app.MapControllers();

app.Run();
