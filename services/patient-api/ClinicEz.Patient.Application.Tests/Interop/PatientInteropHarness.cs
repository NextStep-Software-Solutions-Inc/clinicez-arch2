using ClinicEz.Patient.Application;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Application.Features.Sharing;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Patient.Infrastructure.Services.Encryption;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using NSubstitute;

namespace ClinicEz.Patient.Application.Tests.Interop;

/// <summary>
/// Builds the patient plane exactly as production wires it (<see cref="DependencyInjection.AddPatientInterop"/>)
/// on the in-process hub and an in-memory database, so tests drive real handlers, outbox and inbox.
/// </summary>
internal sealed class PatientInteropHarness : IDisposable
{
    public const string TenantA = "tenant-a";
    public const string TenantB = "tenant-b";
    public const string SigningKey = "test-signing-key-test-signing-key-0123456789";

    public ServiceProvider Provider { get; }
    public InProcessHub Hub => Provider.GetRequiredService<InProcessHub>();
    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();
    public InteropInboxPollerService Poller => Provider.GetRequiredService<InteropInboxPollerService>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();
    public IStorageService Storage { get; } = Substitute.For<IStorageService>();

    public PatientInteropHarness()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Patient,
            ["Messaging:Enabled"] = "false",
            ["PatientEncryption:MasterSecret"] = "patient-test-encryption-master-secret-at-least-32-chars-long!"
        }).Build();

        Storage.UploadAsync(Arg.Any<Stream>(), Arg.Any<string>(), Arg.Any<string>(), Arg.Any<CancellationToken>()).Returns(call => call.ArgAt<string>(1));
        Storage.SaveEncryptedAsync(Arg.Any<string>(), Arg.Any<byte[]>(), Arg.Any<CancellationToken>()).Returns(call => call.ArgAt<string>(0));
        Storage.GeneratePresignedDownloadUrlAsync(Arg.Any<string>(), Arg.Any<TimeSpan>(), Arg.Any<CancellationToken>())
            .Returns(call => $"https://files.example.test/{call.ArgAt<string>(0)}");

        var dbName = Guid.NewGuid().ToString();
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddSingleton(DevelopmentEnvironment());
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddScoped<IAppointmentRepository, AppointmentRepository>();
        services.AddScoped<IClinicRepository, ClinicRepository>();
        services.AddScoped<IPatientRepository, PatientRepository>();
        services.AddScoped<IBookingDraftRepository, BookingDraftRepository>();
        services.AddScoped<IClinicMembershipRepository, ClinicMembershipRepository>();
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IPatientAccessRepository, PatientAccessRepository>();
        services.AddScoped<IShareCodeRepository, ShareCodeRepository>();
        services.AddScoped<IPatientDocumentRepository, PatientDocumentRepository>();
        services.AddScoped<INotificationRepository, NotificationRepository>();
        services.AddScoped<IDeviceSessionRepository, DeviceSessionRepository>();
        services.AddSingleton<IPushNotificationService>(Substitute.For<IPushNotificationService>());
        services.AddSingleton(Storage);
        services.AddSingleton(sp => PatientEncryptionKeyRing.FromConfiguration(sp.GetRequiredService<IConfiguration>()));
        services.AddScoped<IPatientEncryptionService, PatientEncryptionService>();
        services.Configure<SharingOptions>(o => o.SigningKey = SigningKey);
        services.AddApplicationServices();
        services.AddScoped<SubmitBookingDraftCommandHandler>();
        services.AddPatientInterop(config);
        Provider = services.BuildServiceProvider();
    }

    public static Party Portal => Party.Portal;

    private static IHostEnvironment DevelopmentEnvironment()
    {
        var environment = Substitute.For<IHostEnvironment>();
        environment.EnvironmentName.Returns(Environments.Development);
        return environment;
    }

    public static Party Clinic(Guid clinicId, string tenantId = TenantA) =>
        Party.ForFacility(tenantId, clinicId.ToString(), FacilityType.Clinic);

    public static Party Patient(Guid patientId) => Party.ForPatient(patientId.ToString());

    public async Task<T> WithDbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    public async Task WithDbAsync(Func<ApplicationDbContext, Task> action)
    {
        using var scope = Provider.CreateScope();
        await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    /// <summary>Puts an envelope into the patient mailbox and lets the poller dispatch it.</summary>
    public async Task DeliverAsync(InteropEnvelope envelope)
    {
        Hub.Send(envelope);
        await Poller.RunOnceAsync(0, default);
    }

    public void Dispose() => Provider.Dispose();
}
