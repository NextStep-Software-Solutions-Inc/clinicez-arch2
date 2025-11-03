using CLINICEZ.TenantManagement.Api;
using CLINICEZ.TenantManagement.Application;
using CLINICEZ.TenantManagement.Infrastructure;
using Hangfire;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;

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
            //OnAuthenticationFailed = context =>
            //{
            //    Console.WriteLine($"JWT AUTH FAILURE: Token validation failed with exception: {context.Exception.Message}");
            //    return Task.CompletedTask;
            //},
            // Additional validation for AZP claim
            OnTokenValidated = context =>
            {
                var azp = context.Principal?.FindFirstValue("azp");
                var authorizedParties = builder.Configuration.GetSection("Clerk:AuthorizedParties").Get<List<string>>();

                if (string.IsNullOrEmpty(azp) || authorizedParties == null || !authorizedParties.Contains(azp))
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

// Configure the HTTP request pipeline.
if (isDevelopment)
{
    app.UseSwagger();
    app.UseSwaggerUI(s =>
    {
        s.DocExpansion(Swashbuckle.AspNetCore.SwaggerUI.DocExpansion.None);
        s.ConfigObject.AdditionalItems.Add("persistAuthorization", "true");
        s.ConfigObject.DeepLinking = true;
        s.ConfigObject.DisplayRequestDuration = true;
    });
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
app.MapControllers();
app.Run();
