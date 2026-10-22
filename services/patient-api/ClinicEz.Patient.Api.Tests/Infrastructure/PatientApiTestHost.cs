using System.Security.Claims;
using System.Text.Encodings.Web;
using ClinicEz.Patient.Api.Extensions;
using ClinicEz.Patient.Api.Infrastructure;
using ClinicEz.Patient.Api.Middleware;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Services.Auth;
using ClinicEz.Shared.Interfaces;
using MediatR;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Routing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using NSubstitute;

namespace ClinicEz.Patient.Api.Tests.Infrastructure;

/// <summary>
/// Hosts the real patient-api endpoints and request pipeline (exception handler, authentication,
/// authorisation, <see cref="PatientOwnershipMiddleware"/>) on an in-memory server with no database,
/// broker or container. Callers identify themselves with the <see cref="UserHeader"/> request header.
/// </summary>
public sealed class PatientApiTestHost : IAsyncDisposable
{
    public const string UserHeader = "X-Test-User";

    /// <summary>Endpoints that use the database directly bind a context; requests that reach one are never exercised.</summary>
    private const string UnreachableDatabase = "Host=127.0.0.1;Port=1;Database=unused;Timeout=1";

    private readonly WebApplication _app;

    public HttpClient Client { get; }
    public ISender Sender { get; }
    public IPatientRepository Patients { get; }
    public IEnumerable<EndpointDataSource> EndpointSources => _app.Services.GetServices<EndpointDataSource>();

    private PatientApiTestHost(WebApplication app, ISender sender, IPatientRepository patients)
    {
        _app = app;
        Sender = sender;
        Patients = patients;
        Client = app.GetTestClient();
    }

    public static async Task<PatientApiTestHost> StartAsync()
    {
        var sender = Substitute.For<ISender>();
        var patients = Substitute.For<IPatientRepository>();

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Configuration["Cors:AllowedOrigins:0"] = "https://app.test";
        builder.Configuration["PatientEncryption:MasterSecret"] = "test-patient-encryption-master-secret-32chars-min-ok!";
        builder.Services.AddApiServices(builder.Configuration, builder.Environment);
        builder.Services.ConfigureHttpJsonOptions(o => ApiJson.Configure(o.SerializerOptions));
        builder.Services.AddHttpContextAccessor();
        builder.Services.AddScoped<ICurrentUserService, CurrentUserService>();
        builder.Services.AddSingleton(sender);
        builder.Services.AddSingleton(Substitute.For<IMediator>());
        builder.Services.AddSingleton(patients);
        builder.Services.AddSingleton(Substitute.For<IUnitOfWork>());
        builder.Services.AddDbContext<ApplicationDbContext>(o => o.UseNpgsql(UnreachableDatabase));
        builder.Services
            .AddAuthentication(HeaderAuthHandler.SchemeName)
            .AddScheme<AuthenticationSchemeOptions, HeaderAuthHandler>(HeaderAuthHandler.SchemeName, _ => { });

        var app = builder.Build();
        app.UseExceptionHandler();
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseMiddleware<PatientOwnershipMiddleware>();
        app.MapApiEndpoints();

        await app.StartAsync();
        return new PatientApiTestHost(app, sender, patients);
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await _app.DisposeAsync();
    }

    private sealed class HeaderAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder)
        : AuthenticationHandler<AuthenticationSchemeOptions>(options, logger, encoder)
    {
        public const string SchemeName = "Header";

        protected override Task<AuthenticateResult> HandleAuthenticateAsync()
        {
            if (!Request.Headers.TryGetValue(UserHeader, out var user) || string.IsNullOrWhiteSpace(user))
                return Task.FromResult(AuthenticateResult.NoResult());

            var identity = new ClaimsIdentity([new Claim("sub", user.ToString())], SchemeName);
            return Task.FromResult(AuthenticateResult.Success(
                new AuthenticationTicket(new ClaimsPrincipal(identity), SchemeName)));
        }
    }
}
