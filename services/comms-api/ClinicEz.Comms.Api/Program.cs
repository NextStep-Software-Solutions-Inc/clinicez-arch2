using ClinicEz.Comms.Application;
using ClinicEz.Comms.Infrastructure;
using ClinicEz.Comms.Infrastructure.Hubs;
using ClinicEz.Comms.Infrastructure.Middleware;
using ClinicEz.Comms.Infrastructure.Persistence;
using ClinicEz.Shared.Persistence;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;

builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
builder.Configuration.AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true, reloadOnChange: true);
builder.Configuration.AddEnvironmentVariables();
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, optional: true);

builder.Services.AddCommsApplication();
builder.Services.AddCommsInfrastructure(builder.Configuration);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddOpenApi();

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.SetIsOriginAllowed(_ => true)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    try
    {
        using var scope = app.Services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<CommsDbContext>();
        dbContext.EnsureDevelopmentDatabaseCreatedAndMigrated(app.Environment);
    }
    catch (Exception ex)
    {
        Console.WriteLine($"[DB_INIT_NOTE] {ex.Message}");
    }

    app.MapOpenApi().AllowAnonymous();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Communications API")).AllowAnonymous();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<TenantMigrationWritePauseMiddleware>();

app.MapControllers();
app.MapHub<CommsHub>("/hubs/comms");

app.Run();
