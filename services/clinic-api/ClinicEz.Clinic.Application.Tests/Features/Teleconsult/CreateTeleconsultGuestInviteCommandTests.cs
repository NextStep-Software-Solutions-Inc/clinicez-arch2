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

public sealed class CreateTeleconsultGuestInviteCommandTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-test";
    private readonly Guid _staffId = Guid.NewGuid();
    private readonly IClinicContext _clinicContext;
    private readonly IConfiguration _configuration;

    public CreateTeleconsultGuestInviteCommandTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_clinicId);
        _clinicContext.TenantId.Returns(_tenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Test");
        _clinicContext.StaffRole.Returns("Doctor");
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.ConsultationsSign).Returns(true);
        _clinicContext.HasPermission(ClinicPermissions.AppointmentsManage).Returns(true);

        _configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Portal:BaseUrl"] = "https://portal.clinicez.test"
        }).Build();
    }

    [Fact]
    public async Task CreateGuestInvite_WithoutPermission_ThrowsForbiddenException()
    {
        var ctx = Substitute.For<IClinicContext>();
        ctx.ClinicId.Returns(_clinicId);
        ctx.TenantId.Returns(_tenantId);
        ctx.HasPermission(ClinicPermissions.ConsultationsWrite).Returns(false);
        ctx.HasPermission(ClinicPermissions.ConsultationsSign).Returns(false);
        ctx.HasPermission(ClinicPermissions.AppointmentsManage).Returns(false);

        var (db, uow, sieve) = TestDbHelper.CreateTestContext(ctx);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, ctx, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var act = () => handler.Handle(new CreateTeleconsultGuestInviteCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*ConsultationsWrite, ConsultationsSign, or AppointmentsManage*");
    }

    [Fact]
    public async Task CreateGuestInvite_WhenAppointmentNotFound_ThrowsNotFoundException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var act = () => handler.Handle(new CreateTeleconsultGuestInviteCommand(Guid.NewGuid()), CancellationToken.None);

        await act.Should().ThrowAsync<NotFoundException>();
    }

    [Fact]
    public async Task CreateGuestInvite_WhenNotTeleconsult_ThrowsBadRequestException()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            PatientCode = "P-1002",
            FirstName = "Pedro",
            LastName = "Penduko",
            ContactNumber = "09123456788",
            DateOfBirth = new DateOnly(1985, 3, 20)
        };
        db.Patients.Add(patient);

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Pedro Penduko",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.InPerson
        };
        db.Appointments.Add(apt);
        await db.SaveChangesAsync();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var act = () => handler.Handle(new CreateTeleconsultGuestInviteCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*not a teleconsultation*");
    }

    [Fact]
    public async Task CreateGuestInvite_ValidTeleconsult_GeneratesInviteAndPublishesToPartyPortal()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var patientId = Guid.NewGuid();
        var patient = new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            PatientCode = "P-1001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09123456789",
            DateOfBirth = new DateOnly(1990, 5, 15)
        };
        db.Patients.Add(patient);

        var aptId = Guid.NewGuid();
        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = aptId,
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientId = patientId,
            PatientName = "Juan Dela Cruz",
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId
        };
        db.Appointments.Add(apt);
        await db.SaveChangesAsync();

        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, _configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        // Act
        var result = await handler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);

        // Assert DTO
        result.Should().NotBeNull();
        result.InviteToken.Should().HaveLength(32);
        result.InviteUrl.Should().Be($"https://portal.clinicez.test/teleconsult/join?token={result.InviteToken}");
        result.Otp.Should().MatchRegex(@"^\d{6}$");
        result.DobHint.Should().Be("1990-**-**");
        result.ExpiresAtUtc.Should().BeAfter(DateTime.UtcNow.AddMinutes(50));

        // Assert Interop Publisher called with Party.Portal and correct hashes
        var expectedTokenHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(result.InviteToken))).ToLowerInvariant();
        var expectedDobHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptId:N}:1990-05-15"))).ToLowerInvariant();
        var expectedOtpHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes($"{aptId:N}:{result.Otp}"))).ToLowerInvariant();

        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteIssued,
            Arg.Is<Party>(p => p.Kind == PartyKind.Facility),
            Party.Portal,
            aptId,
            Arg.Is<GuestTeleconsultInviteIssuedPayload>(p =>
                p.AppointmentId == aptId &&
                p.CallId == callId &&
                p.TenantId == _tenantId &&
                p.FacilityId == _clinicId.ToString() &&
                p.InviteTokenHash == expectedTokenHash &&
                p.ExpectedDobHash == expectedDobHash &&
                p.OtpHash == expectedOtpHash));

        // Assert Audit log written
        var audit = await db.AuditEntries.FirstOrDefaultAsync(a => a.Action == "teleconsult.guest_invite.issued" && a.TargetEntityId == aptId.ToString());
        audit.Should().NotBeNull();
        audit!.ActorStaffId.Should().Be(_staffId);
        audit.PatientId.Should().Be(patientId);
    }

    [Fact]
    public async Task CreateGuestInvite_ResolvesClinicPortalBaseUrlAndBaseDomainFallbacks()
    {
        var (db, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(db, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(db, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(db, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var patientId = Guid.NewGuid();
        db.Patients.Add(new Patient
        {
            Id = patientId,
            ClinicId = _clinicId,
            PatientCode = "P-1003",
            FirstName = "Maria",
            LastName = "Clara",
            ContactNumber = "09123456700",
            DateOfBirth = new DateOnly(1992, 8, 12)
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

        var clinicPortalConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Clinic:PortalBaseUrl"] = "https://dev.clinicez.net/",
            ["Portal:BaseUrl"] = ""
        }).Build();

        var clinicPortalHandler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, clinicPortalConfig,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var clinicPortalResult = await clinicPortalHandler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);
        clinicPortalResult.InviteUrl.Should().Be($"https://dev.clinicez.net/teleconsult/join?token={clinicPortalResult.InviteToken}");

        var baseDomainConfig = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["Clinic:PortalBaseUrl"] = "",
            ["Portal:BaseUrl"] = "",
            ["Facility:BaseDomain"] = "dev.clinicez.net"
        }).Build();

        var baseDomainHandler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, baseDomainConfig,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance);

        var baseDomainResult = await baseDomainHandler.Handle(new CreateTeleconsultGuestInviteCommand(aptId), CancellationToken.None);
        baseDomainResult.InviteUrl.Should().Be($"https://dev.clinicez.net/teleconsult/join?token={baseDomainResult.InviteToken}");
    }
}
