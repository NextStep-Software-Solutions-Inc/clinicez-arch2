using CLINICEZ.PhilHealth.Proxy.Common;
using CLINICEZ.PhilHealth.Proxy.Configuration;
using CLINICEZ.PhilHealth.Proxy.Services;
using FluentValidation;
using MediatR;

var builder = WebApplication.CreateBuilder(args);

// ── Configuration ────────────────────────────────────────────────
builder.Services.Configure<PhilHealthSettings>(
    builder.Configuration.GetSection(PhilHealthSettings.SectionName));

// ── HTTP Client for SOAP ─────────────────────────────────────────
builder.Services.AddHttpClient<IPhilHealthSoapClient, PhilHealthSoapClient>(client =>
{
    var settings = builder.Configuration
        .GetSection(PhilHealthSettings.SectionName)
        .Get<PhilHealthSettings>()!;

    client.BaseAddress = new Uri(settings.ServiceUrl);
    client.Timeout = TimeSpan.FromSeconds(settings.TimeoutSeconds);
});

// ── MediatR ──────────────────────────────────────────────────────
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssemblyContaining<Program>());

// ── FluentValidation ─────────────────────────────────────────────
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// ── MediatR Validation Pipeline Behavior ─────────────────────────
builder.Services.AddTransient(typeof(IPipelineBehavior<,>), typeof(ValidationBehavior<,>));

// ── Controllers + JSON ───────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(options =>
        options.JsonSerializerOptions.PropertyNamingPolicy =
            System.Text.Json.JsonNamingPolicy.CamelCase);

// ── OpenAPI / Swagger ────────────────────────────────────────────
builder.Services.AddOpenApi();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseSwaggerUI(options =>
        options.SwaggerEndpoint("/openapi/v1.json", "PhilHealth Proxy v1"));
}

app.UseHttpsRedirection();
app.UseAuthorization();
app.MapControllers();

app.Run();
