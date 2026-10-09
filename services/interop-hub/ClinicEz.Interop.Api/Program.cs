using System.Text.Json.Serialization;
using ClinicEz.Interop.Api.Endpoints;
using ClinicEz.Interop.Api.Security;
using ClinicEz.Interop.Application;
using ClinicEz.Interop.Application.Bootstrap;
using ClinicEz.Interop.Infrastructure;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, true);

// Wire contract: same JSON conventions as ClinicEz.Shared.Interop.InteropJson, so SDK clients and the hub agree byte-for-byte.
builder.Services.ConfigureHttpJsonOptions(o =>
{
    o.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
    o.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
});

builder.Services
    .AddInteropHubApplication()
    .AddInteropHubInfrastructure(builder.Configuration);

// Client-credential authentication (X-Hub-Client / X-Hub-Secret). Everything requires a valid client unless it is [AllowAnonymous] (health).
builder.Services.AddAuthentication(HubClientAuthenticationHandler.SchemeName)
    .AddScheme<AuthenticationSchemeOptions, HubClientAuthenticationHandler>(HubClientAuthenticationHandler.SchemeName, null);
builder.Services.AddAuthorizationBuilder()
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder(HubClientAuthenticationHandler.SchemeName).RequireAuthenticatedUser().Build())
    .AddPolicy(HubClientAuthenticationHandler.ControlPlanePolicy, policy => policy
        .AddAuthenticationSchemes(HubClientAuthenticationHandler.SchemeName)
        .RequireAssertion(context => HubClientAuthenticationHandler.IsControlPlane(context.User)));

builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<HubExceptionHandler>();
builder.Services.AddOpenApi();

var app = builder.Build();

var options = app.Services.GetRequiredService<IOptions<HubOptions>>().Value;
if (app.Environment.IsDevelopment() || options.Database.AutoMigrate)
    await app.Services.InitializeDatabaseAsync();

using (var scope = app.Services.CreateScope())
    await scope.ServiceProvider.GetRequiredService<HubBootstrapper>().ApplyAsync(app.Environment.IsDevelopment(), CancellationToken.None);

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi().AllowAnonymous();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Interop Hub API")).AllowAnonymous();
}

app.UseExceptionHandler();
app.UseAuthentication();
app.UseAuthorization();
app.MapHubEndpoints(options);

app.Run();

public partial class Program;
