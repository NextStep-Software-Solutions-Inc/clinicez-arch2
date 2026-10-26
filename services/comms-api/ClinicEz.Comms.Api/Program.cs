using ClinicEz.Comms.Application;
using ClinicEz.Comms.Infrastructure;
using ClinicEz.Comms.Infrastructure.Hubs;
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
    app.MapOpenApi().AllowAnonymous();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Communications API")).AllowAnonymous();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "comms-api" })).AllowAnonymous();
app.MapControllers();
app.MapHub<CommsHub>("/hubs/comms");

app.Run();

public partial class Program { }
