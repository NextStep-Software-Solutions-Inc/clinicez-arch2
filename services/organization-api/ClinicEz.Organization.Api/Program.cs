using Scalar.AspNetCore;
using ClinicEz.Organization.Api;
using ClinicEz.Organization.Application;
using ClinicEz.Organization.Infrastructure;
using ClinicEz.Shared.Middlewares;
using Hangfire;

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

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.MapScalarApiReference(opts => opts.WithTitle("Clinic EZ Organization Dashboard API"));
}

// 4. Add middleware
app.UseCors();
app.UseHttpsRedirection();
app.UseExceptionHandler(); // Use our global exception handler
app.UseHangfireDashboard("/hangfire", new DashboardOptions { Authorization = [new HangfireDashboardAuthFilter(app.Configuration)] }); // Basic Auth; denied when no password is configured

// 5. Tell the app to use controllers
app.MapControllers();

app.Run();




