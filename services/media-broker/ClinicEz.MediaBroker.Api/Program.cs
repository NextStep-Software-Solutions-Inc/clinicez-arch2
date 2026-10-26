using ClinicEz.MediaBroker.Application;
using ClinicEz.MediaBroker.Infrastructure;
using Scalar.AspNetCore;

var builder = WebApplication.CreateBuilder(args);
var env = builder.Environment;

builder.Configuration.AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
builder.Configuration.AddJsonFile($"appsettings.{env.EnvironmentName}.json", optional: true, reloadOnChange: true);
builder.Configuration.AddEnvironmentVariables();
builder.Configuration.AddUserSecrets(typeof(Program).Assembly, optional: true);

builder.Services.AddMediaBrokerApplication(builder.Configuration);
builder.Services.AddMediaBrokerInfrastructure(builder.Configuration);

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
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Media Broker API")).AllowAnonymous();
}

app.UseCors();

app.MapGet("/health", () => Results.Ok(new { status = "healthy", service = "media-broker" })).AllowAnonymous();
app.MapControllers();

app.Run();

public partial class Program { }
