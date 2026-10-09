using ClinicEz.Patient.Application.Features.BookingDrafts.Commands.SubmitBookingDraft;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Patient.Infrastructure;
using ClinicEz.Patient.Infrastructure.Persistence;
using ClinicEz.Patient.Infrastructure.Persistence.Repositories;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Transport;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace ClinicEz.Patient.Application.Tests.Interop;

/// <summary>
/// Builds the patient plane exactly as production wires it (<see cref="DependencyInjection.AddPatientInterop"/>)
/// on the in-process hub and an in-memory database, so tests drive real handlers, outbox and inbox.
/// </summary>
internal sealed class PatientInteropHarness : IDisposable
{
    public const string TenantA = "tenant-a";
    public const string TenantB = "tenant-b";

    public ServiceProvider Provider { get; }
    public InProcessHub Hub => Provider.GetRequiredService<InProcessHub>();
    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();
    public InteropInboxPollerService Poller => Provider.GetRequiredService<InteropInboxPollerService>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();

    public PatientInteropHarness()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Patient,
            ["Messaging:Enabled"] = "false"
        }).Build();

        var dbName = Guid.NewGuid().ToString();
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
        services.AddScoped<SubmitBookingDraftCommandHandler>();
        services.AddPatientInterop(config);
        Provider = services.BuildServiceProvider();
    }

    public static Party Portal => Party.Portal;

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
