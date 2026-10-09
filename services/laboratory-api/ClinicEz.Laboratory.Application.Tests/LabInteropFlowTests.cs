using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Application.Features.Reports.Commands;
using ClinicEz.Laboratory.Application.Interop;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;
using ClinicEz.Laboratory.Domain.Interfaces;
using ClinicEz.Laboratory.Infrastructure.Persistence;
using ClinicEz.Laboratory.Infrastructure.Persistence.Repositories;
using ClinicEz.Laboratory.Infrastructure.Services;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Background;
using ClinicEz.Shared.Interop.Handling;
using ClinicEz.Shared.Interop.Persistence;
using ClinicEz.Shared.Interop.Transport;
using ClinicEz.Shared.Interoperability;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using NSubstitute;
using Sieve.Services;
using Xunit;

namespace ClinicEz.Laboratory.Application.Tests;

/// <summary>The laboratory wired exactly like the service, on the in-process hub and an in-memory database.</summary>
internal sealed class LabInteropHost : IDisposable
{
    public ServiceProvider Provider { get; }
    public InProcessHub Hub => Provider.GetRequiredService<InProcessHub>();
    public InteropDispatcher Dispatcher => Provider.GetRequiredService<InteropDispatcher>();
    public InteropRelayService Relay => Provider.GetRequiredService<InteropRelayService>();

    public LabInteropHost()
    {
        var config = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["DbSchema"] = "laboratory_dashboard",
            ["Messaging:Transport"] = "InProcess",
            ["Messaging:Service"] = InteropServices.Laboratory,
            ["Messaging:Enabled"] = "false"
        }).Build();

        var dbName = $"Laboratory_InteropDb_{Guid.NewGuid()}";
        var services = new ServiceCollection();
        services.AddLogging();
        services.AddSingleton<IConfiguration>(config);
        services.AddDbContext<ApplicationDbContext>(o => o.UseInMemoryDatabase(dbName));
        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped(_ => Substitute.For<ISieveProcessor>());
        services.AddScoped(_ => Substitute.For<IProductRepository>());
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IDiagnosticReportPublisher, DiagnosticReportPublisher>();
        services.AddScoped<IPanicAlertPublisher, PanicAlertPublisher>();
        services.AddInterop<ApplicationDbContext>(config, handlers => handlers
            .Handle<FacilityCreatedEvent, FacilityLicenseIssuedHandler>(InteropTypes.FacilityLicenseIssued)
            .Handle<LabRequisitionIssuedEvent, LabOrderIssuedHandler>(InteropTypes.LabOrderIssued));
        Provider = services.BuildServiceProvider();
    }

    public async Task<T> WithDbAsync<T>(Func<ApplicationDbContext, Task<T>> action)
    {
        using var scope = Provider.CreateScope();
        return await action(scope.ServiceProvider.GetRequiredService<ApplicationDbContext>());
    }

    public Task SeedLabAsync() => WithDbAsync(async db =>
    {
        await LabInteropTestData.SeedLabAsync(db);
        return 0;
    });

    public Task<List<LabRequisition>> RequisitionsAsync() =>
        WithDbAsync(db => db.LabRequisitions.AsNoTracking().OrderBy(r => r.CreatedAt).ToListAsync());

    public Task<List<InteropOutboxMessage>> OutboxAsync() =>
        WithDbAsync(db => db.InteropOutbox.AsNoTracking().ToListAsync());

    public Task<Guid> SeedRequisitionAsync(bool withOrderingClinic, bool critical = true) => WithDbAsync(async db =>
    {
        var requisition = new LabRequisition
        {
            Id = Guid.NewGuid(),
            TenantId = LabInteropTestData.LabTenant,
            LaboratoryId = LabInteropTestData.LabId,
            AccessionNumber = "ACC-SEEDED",
            PatientName = "Pedro Penduko",
            ExternalRequisitionId = Guid.NewGuid(),
            Status = RequisitionStatus.InTesting,
            OrderingTenantId = withOrderingClinic ? LabInteropTestData.ClinicA.TenantId : null,
            OrderingFacilityId = withOrderingClinic ? LabInteropTestData.ClinicA.FacilityId! : string.Empty,
            CorrelationId = withOrderingClinic ? Guid.NewGuid() : null,
            AnalyteResults = new List<AnalyteResult>
            {
                new()
                {
                    PanelName = "Clinical Chemistry",
                    AnalyteCode = "FBS",
                    AnalyteName = "Fasting Blood Sugar",
                    Value = "420.0",
                    Unit = "mg/dL",
                    ReferenceInterval = "70.0 - 99.0",
                    Flag = critical ? AnalyteFlag.Critical : AnalyteFlag.Normal
                }
            }
        };
        db.LabRequisitions.Add(requisition);
        await db.SaveChangesAsync();
        return requisition.Id;
    });

    public void Dispose() => Provider.Dispose();
}

public class LabInteropFlowTests
{
    private static InteropEnvelope Provisioning(Party from, Party to, Guid resourceId, string tenantId, FacilityType type = FacilityType.Laboratory) =>
        InteropEnvelope.Create(InteropTypes.FacilityLicenseIssued, from, to, Guid.NewGuid(), new FacilityCreatedEvent
        {
            TenantId = tenantId,
            ResourceId = resourceId,
            FacilityType = type,
            Name = "Test Laboratory",
            LicenseToken = "license-token",
            PlanTier = "Pro"
        });

    [Fact]
    public async Task Order_delivered_twice_creates_a_single_requisition()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();
        var order = LabInteropTestData.Order("ACC-100");
        var first = LabInteropTestData.OrderEnvelope(order, LabInteropTestData.ClinicA);
        // The same order re-sent under a new message id (clinic retry) must not duplicate either.
        var resent = LabInteropTestData.OrderEnvelope(order, LabInteropTestData.ClinicA);

        (await host.Dispatcher.DispatchAsync(first, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(first, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);
        (await host.Dispatcher.DispatchAsync(resent, default)).Outcome.Should().Be(DispatchOutcome.Handled);

        var requisitions = await host.RequisitionsAsync();
        requisitions.Should().ContainSingle();
        requisitions[0].CorrelationId.Should().Be(order.RequisitionId);
    }

    [Fact]
    public async Task Same_accession_and_requisition_id_from_two_tenants_are_never_merged()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();
        var requisitionId = Guid.NewGuid();
        var orderA = LabInteropTestData.Order("ACC-COLLIDE", requisitionId);
        var orderB = LabInteropTestData.Order("ACC-COLLIDE", requisitionId);

        await host.Dispatcher.DispatchAsync(LabInteropTestData.OrderEnvelope(orderA, LabInteropTestData.ClinicA), default);
        await host.Dispatcher.DispatchAsync(LabInteropTestData.OrderEnvelope(orderB, LabInteropTestData.ClinicB), default);

        var requisitions = await host.RequisitionsAsync();
        requisitions.Should().HaveCount(2);
        requisitions.Select(r => r.OrderingTenantId).Should().BeEquivalentTo(new[] { "tenant-a", "tenant-b" });
        requisitions.Select(r => r.AccessionNumber).Should().OnlyHaveUniqueItems();
    }

    [Fact]
    public async Task Order_addressed_to_another_tenants_laboratory_is_ignored()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();
        var otherTenantLab = Party.ForFacility("other-tenant", LabInteropTestData.LabId.ToString(), FacilityType.Laboratory);
        var envelope = LabInteropTestData.OrderEnvelope(LabInteropTestData.Order("ACC-200"), LabInteropTestData.ClinicA, otherTenantLab);

        var result = await host.Dispatcher.DispatchAsync(envelope, default);

        result.ShouldAck.Should().BeTrue();
        (await host.RequisitionsAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Order_for_a_laboratory_not_provisioned_here_is_failed_for_redelivery()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();
        var unknownLab = Party.ForFacility(LabInteropTestData.LabTenant, Guid.NewGuid().ToString(), FacilityType.Laboratory);
        var envelope = LabInteropTestData.OrderEnvelope(LabInteropTestData.Order("ACC-300"), LabInteropTestData.ClinicA, unknownLab);

        var result = await host.Dispatcher.DispatchAsync(envelope, default);

        result.Outcome.Should().Be(DispatchOutcome.Failed);
        (await host.RequisitionsAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Order_from_a_sender_that_is_not_a_clinic_is_ignored()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();
        var pharmacy = Party.ForFacility("tenant-a", Guid.NewGuid().ToString(), FacilityType.Pharmacy);
        var envelope = LabInteropTestData.OrderEnvelope(LabInteropTestData.Order("ACC-400"), pharmacy);

        var result = await host.Dispatcher.DispatchAsync(envelope, default);

        result.ShouldAck.Should().BeTrue();
        (await host.RequisitionsAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Finalized_result_is_addressed_to_the_ordering_clinic_with_the_orders_correlation_id()
    {
        using var host = new LabInteropHost();
        await host.SeedLabAsync();
        var order = LabInteropTestData.Order("ACC-500");
        await host.Dispatcher.DispatchAsync(LabInteropTestData.OrderEnvelope(order, LabInteropTestData.ClinicB), default);

        using (var scope = host.Provider.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var db = sp.GetRequiredService<ApplicationDbContext>();
            var requisition = await db.LabRequisitions.SingleAsync();
            db.AnalyteResults.Add(new AnalyteResult
            {
                LabRequisitionId = requisition.Id,
                PanelName = "Clinical Chemistry",
                AnalyteCode = "FBS",
                AnalyteName = "Fasting Blood Sugar",
                Value = "5.0",
                Unit = "mmol/L",
                ReferenceInterval = "3.9 - 5.6",
                Flag = AnalyteFlag.Normal
            });
            requisition.Status = RequisitionStatus.InTesting;
            await db.SaveChangesAsync();

            var handler = new VerifyAndSignReportCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(),
                sp.GetRequiredService<IUnitOfWork>(),
                sp.GetRequiredService<IDiagnosticReportPublisher>(),
                new DiagnosticReportPdfGenerator());
            await handler.Handle(new VerifyAndSignReportCommand(
                requisition.Id, "Dr. Pathologist", "PRC-1", "Med Tech", "PRC-2", "ok", "JVBERi0xLjQK"), CancellationToken.None);
        }

        (await host.Relay.RunOnceAsync(default)).Should().Be(1);
        var sent = host.Hub.Sent.Should().ContainSingle().Subject;
        sent.Type.Should().Be(InteropTypes.LabResultFinalized);
        sent.From.Should().Be(LabInteropTestData.Lab);
        sent.To.Should().Be(LabInteropTestData.ClinicB);
        sent.CorrelationId.Should().Be(order.RequisitionId);
        var payload = sent.GetPayload<DiagnosticReportFinalizedEvent>();
        payload.RequisitionId.Should().Be(order.RequisitionId);
        payload.OrderingTenantId.Should().Be(LabInteropTestData.ClinicB.TenantId);
        payload.OrderingFacilityId.Should().Be(LabInteropTestData.ClinicB.FacilityId);
        payload.PatientId.Should().Be(order.Patient.PatientId);
    }

    [Fact]
    public async Task Finalizing_writes_the_outbox_row_in_the_same_save_as_the_verified_status()
    {
        using var host = new LabInteropHost();
        var requisitionId = await host.SeedRequisitionAsync(withOrderingClinic: true);

        using (var scope = host.Provider.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var handler = new VerifyAndSignReportCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(),
                sp.GetRequiredService<IUnitOfWork>(),
                sp.GetRequiredService<IDiagnosticReportPublisher>(),
                new DiagnosticReportPdfGenerator());
            await handler.Handle(new VerifyAndSignReportCommand(
                requisitionId, "Dr. Pathologist", "PRC-1", "Med Tech", "PRC-2", "ok", "JVBERi0xLjQK"), CancellationToken.None);
        }

        (await host.RequisitionsAsync()).Single().Status.Should().Be(RequisitionStatus.Verified);
        var outbox = await host.OutboxAsync();
        outbox.Should().ContainSingle().Which.Type.Should().Be(InteropTypes.LabResultFinalized);
        outbox[0].DispatchedAtUtc.Should().BeNull();
    }

    [Fact]
    public async Task Finalizing_without_an_ordering_clinic_fails_and_saves_nothing()
    {
        using var host = new LabInteropHost();
        var requisitionId = await host.SeedRequisitionAsync(withOrderingClinic: false);

        Func<Task> act = async () =>
        {
            using var scope = host.Provider.CreateScope();
            var sp = scope.ServiceProvider;
            var handler = new VerifyAndSignReportCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(),
                sp.GetRequiredService<IUnitOfWork>(),
                sp.GetRequiredService<IDiagnosticReportPublisher>(),
                new DiagnosticReportPdfGenerator());
            await handler.Handle(new VerifyAndSignReportCommand(
                requisitionId, "Dr. Pathologist", "PRC-1", "Med Tech", "PRC-2", "ok", "JVBERi0xLjQK"), CancellationToken.None);
        };

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*ordering clinic*");
        (await host.RequisitionsAsync()).Single().Status.Should().Be(RequisitionStatus.InTesting);
        (await host.OutboxAsync()).Should().BeEmpty();
        (await host.WithDbAsync(db => db.DiagnosticReports.CountAsync())).Should().Be(0);
    }

    [Fact]
    public async Task Panic_alert_is_committed_with_its_dispatch_log_and_addressed_to_the_ordering_clinic()
    {
        using var host = new LabInteropHost();
        var requisitionId = await host.SeedRequisitionAsync(withOrderingClinic: true);
        var correlationId = (await host.RequisitionsAsync()).Single().CorrelationId;

        using (var scope = host.Provider.CreateScope())
        {
            var sp = scope.ServiceProvider;
            var handler = new RecordPanicDispatchCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(),
                sp.GetRequiredService<IRepository<CriticalPanicDispatchLog>>(),
                sp.GetRequiredService<IUnitOfWork>(),
                sp.GetRequiredService<IPanicAlertPublisher>());
            await handler.Handle(new RecordPanicDispatchCommand(requisitionId, "Anna RMT", "Dr. Fernandez"), CancellationToken.None);
        }

        (await host.WithDbAsync(db => db.CriticalPanicDispatchLogs.CountAsync())).Should().Be(1);
        (await host.OutboxAsync()).Should().ContainSingle().Which.Type.Should().Be(InteropTypes.LabResultPanic);

        await host.Relay.RunOnceAsync(default);
        var sent = host.Hub.Sent.Should().ContainSingle().Subject;
        sent.From.Should().Be(LabInteropTestData.Lab);
        sent.To.Should().Be(LabInteropTestData.ClinicA);
        sent.CorrelationId.Should().Be(correlationId!.Value);
        sent.GetPayload<LabPanicResultAlertEvent>().OrderingTenantId.Should().Be(LabInteropTestData.ClinicA.TenantId);
    }

    [Fact]
    public async Task Panic_without_an_ordering_clinic_fails_and_saves_no_dispatch_log()
    {
        using var host = new LabInteropHost();
        var requisitionId = await host.SeedRequisitionAsync(withOrderingClinic: false);

        Func<Task> act = async () =>
        {
            using var scope = host.Provider.CreateScope();
            var sp = scope.ServiceProvider;
            var handler = new RecordPanicDispatchCommandHandler(
                sp.GetRequiredService<IRepository<LabRequisition>>(),
                sp.GetRequiredService<IRepository<CriticalPanicDispatchLog>>(),
                sp.GetRequiredService<IUnitOfWork>(),
                sp.GetRequiredService<IPanicAlertPublisher>());
            await handler.Handle(new RecordPanicDispatchCommand(requisitionId, "Anna RMT", "Dr. Fernandez"), CancellationToken.None);
        };

        await act.Should().ThrowAsync<InvalidOperationException>().WithMessage("*ordering clinic*");
        (await host.WithDbAsync(db => db.CriticalPanicDispatchLogs.CountAsync())).Should().Be(0);
        (await host.OutboxAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task License_issued_provisions_the_laboratory_once_and_acknowledges_the_portal_atomically()
    {
        using var host = new LabInteropHost();
        var resourceId = Guid.NewGuid();
        var to = Party.ForFacility("tenant-new", resourceId.ToString(), FacilityType.Laboratory);
        var envelope = Provisioning(Party.Portal, to, resourceId, "tenant-new");

        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Handled);
        (await host.Dispatcher.DispatchAsync(envelope, default)).Outcome.Should().Be(DispatchOutcome.Duplicate);

        var settings = await host.WithDbAsync(db => db.LabSettings.AsNoTracking().ToListAsync());
        settings.Should().ContainSingle();
        settings[0].LaboratoryId.Should().Be(resourceId);
        settings[0].TenantId.Should().Be("tenant-new");
        settings[0].LicenseToken.Should().Be("license-token");

        var outbox = await host.OutboxAsync();
        outbox.Should().ContainSingle().Which.Type.Should().Be(InteropTypes.FacilityProvisioned);
        InteropEnvelope.FromJson(outbox[0].EnvelopeJson).To.Should().Be(Party.Portal);
    }

    [Fact]
    public async Task License_issued_from_a_facility_or_for_another_facility_is_ignored()
    {
        using var host = new LabInteropHost();
        var resourceId = Guid.NewGuid();
        var to = Party.ForFacility("tenant-new", resourceId.ToString(), FacilityType.Laboratory);
        var spoofed = Provisioning(LabInteropTestData.ClinicA, to, resourceId, "tenant-new");
        var misaddressed = Provisioning(
            Party.Portal, Party.ForFacility("tenant-new", Guid.NewGuid().ToString(), FacilityType.Laboratory), resourceId, "tenant-new");

        (await host.Dispatcher.DispatchAsync(spoofed, default)).ShouldAck.Should().BeTrue();
        (await host.Dispatcher.DispatchAsync(misaddressed, default)).ShouldAck.Should().BeTrue();

        (await host.WithDbAsync(db => db.LabSettings.CountAsync())).Should().Be(0);
        (await host.OutboxAsync()).Should().BeEmpty();
    }
}
