using ClinicEz.Patient.Application;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Interop;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Interop.E2E.Support;

/// <summary>
/// patient-api's interop plane composed by its real <c>AddApplicationServices</c> + <c>AddPatientInterop</c> (the registration
/// <c>AddInfrastructureServices</c> itself calls) over the same repositories. The rest of its infrastructure registration needs
/// Redis, Clerk and PostgreSQL connections at build time, so it cannot be hosted outside the Api: that part is not exercised here.
/// </summary>
public sealed class PatientHost : ServiceHostBase
{
    public const string SigningKey = "e2e-signing-key-e2e-signing-key-0123456789";

    public PatientHost(HubFixture hub) : base(InteropServices.Patient)
    {
        var settings = BaseConfig(InteropServices.Patient, "patient");
        settings["Sharing:SigningKey"] = SigningKey;
        var config = new ConfigurationBuilder().AddInMemoryCollection(settings).Build();

        var dbName = $"e2e-patient-{Guid.NewGuid():N}";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddScoped<IAppointmentRepository, AppointmentRepository>();
        services.AddScoped<IClinicRepository, ClinicRepository>();
        services.AddScoped<IPatientRepository, PatientRepository>();
        services.AddScoped<IBookingDraftRepository, BookingDraftRepository>();
        services.AddScoped<IClinicMembershipRepository, ClinicMembershipRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IPatientAccessRepository, PatientAccessRepository>();
        services.AddScoped<IShareCodeRepository, ShareCodeRepository>();
        services.AddScoped<IShareCodeService, ShareCodeService>();
        services.AddScoped<IPatientDocumentRepository, PatientDocumentRepository>();
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddSingleton<IStorageService>(new InMemoryStorage());
        services.Configure<SharingOptions>(o => o.SigningKey = SigningKey);
        services.AddApplicationServices();
        services.AddPatientInterop(config);
        RouteHttpToHub(services, hub);

        Provider = services.BuildServiceProvider();
    }

    public Task<T> SendAsync<T>(IRequest<T> request) => WithAsync(sp => sp.GetRequiredService<ISender>().Send(request));

    public async Task<T> WithAsync<T>(Func<IServiceProvider, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider);
    }

    public async Task<T> DbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    private sealed class InMemoryStorage : IStorageService
    {
        private readonly Dictionary<string, byte[]> _blobs = new();

        public async Task<string> UploadAsync(Stream stream, string key, string contentType, CancellationToken cancellationToken = default)
        {
            using var buffer = new MemoryStream();
            await stream.CopyToAsync(buffer, cancellationToken);
            _blobs[key] = buffer.ToArray();
            return key;
        }

        public Task DeleteAsync(string key, CancellationToken cancellationToken = default)
        {
            _blobs.Remove(key);
            return Task.CompletedTask;
        }

        public string GetPublicUrl(string key) => $"https://files.e2e.test/{key}";

        public Task<string> GeneratePresignedUploadUrlAsync(string key, string contentType, TimeSpan expiresIn, CancellationToken cancellationToken = default) =>
            Task.FromResult($"https://files.e2e.test/upload/{key}");

        public Task<string> GeneratePresignedDownloadUrlAsync(string key, TimeSpan expiresIn, CancellationToken cancellationToken = default) =>
            Task.FromResult($"https://files.e2e.test/{key}");

        public Task<bool> ObjectExistsAsync(string key, CancellationToken cancellationToken = default) => Task.FromResult(_blobs.ContainsKey(key));
    }
}
