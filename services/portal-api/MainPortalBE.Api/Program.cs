using MainPortalBE.Api;
using MainPortalBE.Application;
using MainPortalBE.Infrastructure;
using MainPortalBE.Infrastructure.Persistence;
using MainPortalBE.Domain.Interfaces;
using Microsoft.EntityFrameworkCore;
using Hangfire;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using System.Linq;
using Scalar.AspNetCore;
using MainPortalBE.Api.Extensions;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;
builder.Configuration.AddJsonFile("appsettings.json", false, true);
builder.Configuration.AddJsonFile($"appsettings.{env.EnvironmentName}.json", true, true);
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, true);

// 0. Add Authentication and Authorization Services
// IMPORTANT: This block must define the authentication scheme
builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
        options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
    })
    .AddJwtBearer(options =>
    {
        // These values MUST be correctly configured in appsettings.json
        options.Authority = builder.Configuration["Clerk:Authority"];

        // This parameter block configures how the token is validated
        options.TokenValidationParameters = new TokenValidationParameters
        {
            NameClaimType = ClaimTypes.NameIdentifier,
            ValidateAudience = false
        };
        options.Events = new JwtBearerEvents
        {
            OnAuthenticationFailed = context =>
            {
                Console.WriteLine($"JWT AUTH FAILURE: Token validation failed with exception: {context.Exception.Message}");
                return Task.CompletedTask;
            },
            // Additional validation for AZP claim
            OnTokenValidated = context =>
            {
                var azp = context.Principal?.FindFirstValue("azp");
                var authorizedParties = builder.Configuration.GetSection("Clerk:AuthorizedParties").Get<List<string>>();

                bool isAuthorized = false;

                if (!string.IsNullOrEmpty(azp) && authorizedParties != null)
                {
                    isAuthorized = authorizedParties.Any(party => 
                        party == azp || 
                        (party.Contains('*') && System.Text.RegularExpressions.Regex.IsMatch(
                            azp, 
                            "^" + System.Text.RegularExpressions.Regex.Escape(party).Replace("\\*", ".*") + "$", 
                            System.Text.RegularExpressions.RegexOptions.IgnoreCase)));
                }

                if (!isAuthorized)
                {
                    context.Fail("AZP Claim is invalid or missing");
                }

                return Task.CompletedTask;
            }
        };
    });
builder.Services.AddAuthorization();

// 1. Add services from our other layers
builder.Services
    .AddApiServices()
    .AddApplicationServices()
    .AddInfrastructureServices(builder.Configuration, builder.Environment);

var app = builder.Build();
bool isDevelopment = app.Environment.IsDevelopment();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();

    try
    {
        // Apply clean migrations
        dbContext.Database.Migrate();
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[Migration Error] Exception type: {ex.GetType().FullName}");
        Console.WriteLine($"[Migration Error] Exception message: {ex.Message}");
        try
        {
            var services = ((Microsoft.EntityFrameworkCore.Infrastructure.IInfrastructure<IServiceProvider>)dbContext).Instance;
            var modelDiffer = (Microsoft.EntityFrameworkCore.Migrations.IMigrationsModelDiffer)services.GetService(typeof(Microsoft.EntityFrameworkCore.Migrations.IMigrationsModelDiffer))!;
            var migrationsAssembly = (Microsoft.EntityFrameworkCore.Migrations.IMigrationsAssembly)services.GetService(typeof(Microsoft.EntityFrameworkCore.Migrations.IMigrationsAssembly))!;
            var modelRuntimeInitializer = (Microsoft.EntityFrameworkCore.Infrastructure.IModelRuntimeInitializer)services.GetService(typeof(Microsoft.EntityFrameworkCore.Infrastructure.IModelRuntimeInitializer))!;
            
            var currentModel = dbContext.Model.GetRelationalModel();
            var snapshotModel = migrationsAssembly.ModelSnapshot?.Model;
            Microsoft.EntityFrameworkCore.Metadata.IRelationalModel? snapshotRelationalModel = null;

            if (snapshotModel is Microsoft.EntityFrameworkCore.Metadata.IMutableModel mutableModel)
            {
                snapshotModel = mutableModel.FinalizeModel();
            }

            if (snapshotModel is not null)
            {
                snapshotModel = modelRuntimeInitializer.Initialize(snapshotModel);
                snapshotRelationalModel = snapshotModel.GetRelationalModel();
            }

            var diffs = modelDiffer.GetDifferences(snapshotRelationalModel, currentModel);
            Console.WriteLine($"[Migration Error] Detected {diffs.Count} model differences:");
            foreach (var diff in diffs)
            {
                Console.WriteLine($" - Operation: {diff.GetType().Name} : {diff}");
            }
        }
        catch (Exception diagEx)
        {
            Console.WriteLine($"[Migration Error] Failed to extract EF diagnostics: {diagEx.Message}");
        }
        throw;
    }

    if (isDevelopment)
    {
        var seeders = scope.ServiceProvider.GetServices<IBaseSeeder>();
        foreach (var seeder in seeders) seeder.SeedAsync().GetAwaiter().GetResult();
    }
}

// Configure the HTTP request pipeline.
if (isDevelopment)
{
    app.MapOpenApi();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Main Portal API"));
}

// 4. Add middleware
app.UseHttpsRedirection();
app.UseExceptionHandler(); // Use our global exception handler
app.UseHangfireDashboard(); // Add Hangfire Dashboard endpoint
app.UseCors(isDevelopment ? "development" : "production");

// IMPORTANT: Authentication MUST run before Authorization
app.UseAuthentication();
app.UseAuthorization();

// 5. Tell the app to use controllers
app.MapApiEndpoints();
app.Run();
