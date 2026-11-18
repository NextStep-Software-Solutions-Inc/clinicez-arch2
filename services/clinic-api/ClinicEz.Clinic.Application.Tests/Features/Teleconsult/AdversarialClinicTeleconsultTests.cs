using System;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Exceptions;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Tests.Common;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Teleconsult;

public sealed class AdversarialClinicTeleconsultTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-adv";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IConfiguration _configuration;

    public AdversarialClinicTeleconsultTests()
    {
        _configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Portal:BaseUrl"] = "https://portal.clinicez.test"
        }).Build();
    }

    private IClinicContext CreateContextWithSinglePermission(string permission)
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(_clinicId);
        ctx.TenantId.Returns(_tenantId);
        ctx.StaffId.Returns(_staffId);
        ctx.StaffName.Returns("Staff Member");
        ctx.StaffRole.Returns("Role");
        ctx.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(permission == ClinicPermissions.ConsultationsWrite);
        ctx.HasPermission(ClinicPermissions.ConsultationsSign).Returns(permission == ClinicPermissions.ConsultationsSign);
        ctx.HasPermission(ClinicPermissions.AppointmentsManage).Returns(permission == ClinicPermissions.AppointmentsManage);
        return ctx;
    }

    [Theory]
    [InlineData(ClinicPermissions.ConsultationsWrite)]
    [InlineData(ClinicPermissions.ConsultationsSign)]
    [InlineData(ClinicPermissions.AppointmentsManage)]
    public async Task CreateGuestInvite_Succeeds_WithAnySingleValidPermission(string permission)
    {
        var ctx = CreateContextWithSinglePermission(permission);
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var patientId = Guid.NewGuid();
        db.Patients.Add(new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            PatientCode = "P-101",
            FirstName = "Maria",
            LastName = "Clara",
            ContactNumber = "09123456789",
            DateOfBirth = new DateOnly(1995, 12, 1)
        });

        var aptId = Guid.NewGuid();
        db.Appointments.Add(new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Maria Clara",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid()
        });
        await db.SaveChangesAsync();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, ctx, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var result = await handler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);

        result.Should().NotBeNull();
        result.InviteToken.Should().HaveLength(32);
        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteIssued,
            Arg.Any<Party>(),
            Party.Portal,
            aptId,
            Arg.Any<GuestTeleconsultInviteIssuedPayload>());
    }

    [Fact]
    public async Task CreateGuestInvite_SoftDeletedAppointment_ThrowsNotFoundException()
    {
        var ctx = CreateContextWithSinglePermission(ClinicPermissions.AppointmentsManage);
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var aptId = Guid.NewGuid();
        db.Appointments.Add(new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Deleted Apt",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            IsDeleted = true // Soft-deleted
        });
        await db.SaveChangesAsync();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, ctx, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var act = () => handler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task CreateGuestInvite_CrossClinicAppointment_ThrowsNotFoundException()
    {
        var ctx = CreateContextWithSinglePermission(ClinicPermissions.AppointmentsManage);
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var otherClinicId = Guid.NewGuid();
        var aptId = Guid.NewGuid();
        db.Appointments.Add(new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = otherClinicId, // Different clinic
            PatientId = Guid.NewGuid(),
            PatientName = "Foreign Clinic Apt",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult
        });
        await db.SaveChangesAsync();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, ctx, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var act = () => handler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task CreateGuestInvite_MissingPatientRecord_ThrowsNotFoundException()
    {
        var ctx = CreateContextWithSinglePermission(ClinicPermissions.AppointmentsManage);
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var orphanPatientId = Guid.NewGuid();
        var aptId = Guid.NewGuid();
        db.Appointments.Add(new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = orphanPatientId, // Patient not in Patients table
            PatientName = "Orphan Patient",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult
        });
        await db.SaveChangesAsync();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, ctx, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var act = () => handler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task CreateGuestInvite_NullCallId_AutoGeneratesAndPersistsCallId()
    {
        var ctx = CreateContextWithSinglePermission(ClinicPermissions.AppointmentsManage);
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var patientId = Guid.NewGuid();
        db.Patients.Add(new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            PatientCode = "P-102",
            FirstName = "Crisostomo",
            LastName = "Ibarra",
            ContactNumber = "09123456780",
            DateOfBirth = new DateOnly(1992, 6, 19)
        });

        var aptId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Crisostomo Ibarra",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = null // Initial null callId
        };
        db.Appointments.Add(apt);
        await db.SaveChangesAsync();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, ctx, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var result = await handler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);

        result.Should().NotBeNull();

        // Verify callId was generated and persisted
        var updatedApt = await db.Appointments.FirstAsync(a => a.Id == aptId);
        updatedApt.CallId.Should().NotBeNull();
        updatedApt.CallId!.Value.Should().NotBe(Guid.Empty);

        // Verify payload received the exact generated callId
        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteIssued,
            Arg.Any<Party>(),
            Party.Portal,
            aptId,
            Arg.Is<GuestTeleconsultInviteIssuedPayload>(p => p.CallId == updatedApt.CallId!.Value));
    }
}
