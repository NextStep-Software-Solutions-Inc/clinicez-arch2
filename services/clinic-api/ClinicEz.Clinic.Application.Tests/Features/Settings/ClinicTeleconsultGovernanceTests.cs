using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Appointments;
using ClinicEz.Clinic.Application.Features.Appointments.Services;
using ClinicEz.Clinic.Application.Features.Settings.Commands;
using ClinicEz.Clinic.Application.Features.Settings.Queries;
using ClinicEz.Clinic.Application.Features.Teleconsult.Commands;
using ClinicEz.Clinic.Application.Features.TeleconsultRecordings.Commands;
using ClinicEz.Clinic.Domain.Constants;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Clinic.Domain.Interfaces;
using ClinicEz.Clinic.Infrastructure.Messaging;
using ClinicEz.Shared.Common;
using ClinicEz.Shared.Exceptions;
using ClinicEz.Shared.Interop;
using ClinicEz.Shared.Interop.Contracts;
using ClinicEz.Shared.Interop.Requests;
using ClinicEz.Shared.Licensing;
using FluentAssertions;
using MediatR;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using NSubstitute;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Settings;

public class ClinicTeleconsultGovernanceTests
{
    private readonly IClinicContext _clinicContext;
    private readonly Guid _testClinicId = Guid.NewGuid();
    private const string _testTenantId = "tenant-gov-test";
    private readonly Guid _staffId = Guid.NewGuid();

    public ClinicTeleconsultGovernanceTests()
    {
        _clinicContext = Substitute.For<IClinicContext>();
        _clinicContext.ClinicId.Returns(_testClinicId);
        _clinicContext.TenantId.Returns(_testTenantId);
        _clinicContext.StaffId.Returns(_staffId);
        _clinicContext.StaffName.Returns("Dr. Test");
        _clinicContext.HasPermission(Arg.Any<string>()).Returns(true);
    }

    private IFacilityLicenseValidator CreateValidator(bool entitled)
    {
        var validator = Substitute.For<IFacilityLicenseValidator>();
        var payload = new FacilityLicensePayload
        {
            FacilityId = _testClinicId,
            TenantId = _testTenantId,
            FacilityName = "Gov Clinic",
            PlanTier = "Standard",
            EnabledFeatures = entitled
                ? new List<string> { FacilityFeatureKeys.Teleconsultation, FacilityFeatureKeys.ElectronicPrescriptions }
                : new List<string> { FacilityFeatureKeys.ElectronicPrescriptions }
        };
        validator.Validate(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>())
            .Returns(LicenseValidationResult.Success(payload));
        return validator;
    }

    private IFacilityLicenseValidator CreateExpiredValidator()
    {
        var validator = Substitute.For<IFacilityLicenseValidator>();
        var payload = new FacilityLicensePayload
        {
            FacilityId = _testClinicId,
            TenantId = _testTenantId,
            FacilityName = "Gov Clinic",
            PlanTier = "Standard",
            ExpiresAtUtc = DateTime.UtcNow.AddMinutes(-5),
            EnabledFeatures = new List<string> { FacilityFeatureKeys.Teleconsultation }
        };
        validator.Validate(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>())
            .Returns(LicenseValidationResult.Expired(payload, "License has expired."));
        return validator;
    }

    private IFacilityLicenseValidator CreateTamperedValidator(string message = "Signature mismatch")
    {
        var validator = Substitute.For<IFacilityLicenseValidator>();
        validator.Validate(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>())
            .Returns(LicenseValidationResult.Tampered(message));
        return validator;
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenWorkspaceLacksTeleconsultEntitlement_RejectsWithForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-unentitled-license-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: false);
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var act = () => updateHandler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenWorkspaceHasTeleconsultEntitlement_PermitsEnablingTeleconsultation()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-entitled-license-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var result = await updateHandler.Handle(command, CancellationToken.None);

        result.EnableTeleconsultation.Should().BeTrue();
        result.IsWorkspaceTeleconsultEntitled.Should().BeTrue();

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeTrue();
    }

    [Fact]
    public async Task UpdateClinicSettings_DisablingTeleconsultation_AllowedRegardlessOfEntitlement()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-license-token",
            EnableTeleconsultation = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: false);
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: false);

        var result = await updateHandler.Handle(command, CancellationToken.None);

        result.EnableTeleconsultation.Should().BeFalse();

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public async Task GetClinicSettings_ReturnsCorrectEnableTeleconsultationAndComputedIsWorkspaceTeleconsultEntitled()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-license-token",
            EnableTeleconsultation = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var getHandler = new GetClinicSettingsQueryHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var result = await getHandler.Handle(new GetClinicSettingsQuery(), CancellationToken.None);

        result.EnableTeleconsultation.Should().BeTrue();
        result.IsWorkspaceTeleconsultEntitled.Should().BeTrue();
    }

    [Fact]
    public async Task CreateAppointment_WhenTeleconsultDisabled_ThrowsForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-license-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var handler = new CreateAppointmentCommandHandler(
            aptRepo, uow, _clinicContext, settingsRepo: settingsRepo, licenseValidator: validator);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Juan Dela Cruz",
            DoctorId: _staffId,
            DoctorName: "Dr. Test",
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AppointmentType: AppointmentType.Teleconsult);

        var act = () => handler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");
    }

    [Fact]
    public async Task CreateAppointment_WhenInPerson_SucceedsEvenIfTeleconsultDisabled()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-license-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: false);
        var handler = new CreateAppointmentCommandHandler(
            aptRepo, uow, _clinicContext, settingsRepo: settingsRepo, licenseValidator: validator);

        var command = new CreateAppointmentCommand(
            PatientId: Guid.NewGuid(),
            PatientName: "Juan Dela Cruz",
            DoctorId: _staffId,
            DoctorName: "Dr. Test",
            ScheduledAt: DateTime.UtcNow.AddDays(1),
            DurationMinutes: 30,
            AppointmentType: AppointmentType.InPerson);

        var result = await handler.Handle(command, CancellationToken.None);

        result.Should().NotBeNull();
        result.AppointmentType.Should().Be(AppointmentType.InPerson);
    }

    [Fact]
    public async Task AdmitTeleconsultPatient_WhenTeleconsultDisabled_ThrowsForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-license-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            DoctorId = _staffId,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var handler = new AdmitTeleconsultPatientCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance,
            settingsRepo: settingsRepo, licenseValidator: validator);

        var act = () => handler.Handle(new AdmitTeleconsultPatientCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");
    }

    [Fact]
    public async Task JoinTeleconsultCall_WhenTeleconsultDisabled_ThrowsForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var requestClient = Substitute.For<IInteropRequestClient>();
        var publisher = Substitute.For<IInteropPublisher>();

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-license-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Patient One",
            DoctorId = _staffId,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            AdmittedAtUtc = DateTime.UtcNow,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var handler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance,
            licenseValidator: validator);

        var act = () => handler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");
    }

    [Fact]
    public async Task CreateTeleconsultGuestInvite_WhenTeleconsultDisabled_ThrowsForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var configuration = Substitute.For<IConfiguration>();

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-license-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "P-001",
            FirstName = "Juan",
            LastName = "Dela Cruz",
            ContactNumber = "09171234567",
            DateOfBirth = new DateOnly(1990, 1, 1)
        };
        await patientRepo.AddAsync(patient);

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            Patient = patient,
            PatientName = "Juan Dela Cruz",
            DoctorId = _staffId,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid()
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var handler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, configuration,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance,
            settingsRepo: settingsRepo, licenseValidator: validator);

        var act = () => handler.Handle(new CreateTeleconsultGuestInviteCommand(apt.Id), CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenLicenseTokenIsNull_StrictlyRejectsWithForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = null,
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var act = () => updateHandler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\t\n")]
    public async Task UpdateClinicSettings_WhenLicenseTokenIsWhitespace_StrictlyRejectsWithForbiddenException(string emptyToken)
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = emptyToken,
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateValidator(entitled: true);
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var act = () => updateHandler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenLicenseTokenIsExpired_StrictlyRejectsWithForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "expired-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateExpiredValidator();
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var act = () => updateHandler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenLicenseTokenIsTampered_StrictlyRejectsWithForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "tampered-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = CreateTamperedValidator("Cryptographic signature mismatch");
        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var act = () => updateHandler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenEnabledFeaturesHasNoTeleconsultation_StrictlyRejectsWithForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = Substitute.For<IFacilityLicenseValidator>();
        var payload = new FacilityLicensePayload
        {
            FacilityId = _testClinicId,
            TenantId = _testTenantId,
            FacilityName = "Gov Clinic",
            PlanTier = "Standard",
            EnabledFeatures = new List<string> { "feature.prescriptions", "feature.inventory", "feature.analytics" }
        };
        validator.Validate(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>())
            .Returns(LicenseValidationResult.Success(payload));

        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var act = () => updateHandler.Handle(command, CancellationToken.None);

        await act.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("*tenant workspace lacks active teleconsultation entitlement*");

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeFalse();
    }

    [Fact]
    public async Task UpdateClinicSettings_WhenEnabledFeaturesHasCaseInsensitiveTeleconsultation_PermitsEnablingTeleconsultation()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "dummy-token",
            EnableTeleconsultation = false
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var validator = Substitute.For<IFacilityLicenseValidator>();
        var payload = new FacilityLicensePayload
        {
            FacilityId = _testClinicId,
            TenantId = _testTenantId,
            FacilityName = "Gov Clinic",
            PlanTier = "Standard",
            EnabledFeatures = new List<string> { "TELECONSULTATION" }
        };
        validator.Validate(Arg.Any<string>(), Arg.Any<Guid>(), Arg.Any<string>())
            .Returns(LicenseValidationResult.Success(payload));

        var updateHandler = new UpdateClinicSettingsCommandHandler(
            settingsRepo, _clinicContext, uow, licenseValidator: validator);

        var command = new UpdateClinicSettingsCommand(EnableTeleconsultation: true);

        var result = await updateHandler.Handle(command, CancellationToken.None);

        result.EnableTeleconsultation.Should().BeTrue();
        result.IsWorkspaceTeleconsultEntitled.Should().BeTrue();

        var persisted = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        persisted.EnableTeleconsultation.Should().BeTrue();
    }

    [Fact]
    public async Task InboundFacilityLicenseUpdate_WhenClinicHadTeleconsultEnabled_CascadesEnableTeleconsultationToFalseWithoutException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);

        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "old-token-with-teleconsult",
            EnableTeleconsultation = true
        };
        await settingsRepo.AddAsync(settings);
        await uow.SaveChangesAsync();

        var publisher = Substitute.For<IInteropPublisher>();
        var validator = CreateValidator(entitled: false); // New license token lacks teleconsultation
        var handler = new FacilityCreatedHandler(
            context, publisher, validator, NullLogger<FacilityCreatedHandler>.Instance);

        var newEvent = new FacilityCreatedEvent
        {
            FacilityType = FacilityType.Clinic,
            ResourceId = _testClinicId,
            TenantId = _testTenantId,
            Name = "Gov Clinic",
            LicenseToken = "new-token-without-teleconsult"
        };

        var messageContext = MessagingTestKit.Delivered(
            InteropTypes.FacilityLicenseIssued,
            Party.Portal,
            Party.ForFacility(_testTenantId, _testClinicId.ToString(), FacilityType.Clinic),
            Guid.NewGuid(),
            newEvent);

        // Act - Must NOT throw any exception
        var act = () => handler.HandleAsync(newEvent, messageContext, CancellationToken.None);
        await act.Should().NotThrowAsync();

        // Assert - EnableTeleconsultation cascaded to false
        var refreshed = await context.Settings.AsNoTracking().FirstAsync(s => s.ClinicId == _testClinicId);
        refreshed.EnableTeleconsultation.Should().BeFalse("Inbound license downgrade must cascade EnableTeleconsultation to false");
    }

    [Fact]
    public async Task ClinicalOperations_WhenClinicHasEnableTeleconsultationTrue_ButWorkspaceLacksEntitlement_AllThrowForbiddenException()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var settingsRepo = TestDbHelper.CreateRepository<FacilitySettings>(context, sieve);
        var patientRepo = TestDbHelper.CreateRepository<Patient>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var requestClient = Substitute.For<IInteropRequestClient>();
        var config = Substitute.For<IConfiguration>();

        // Clinic settings locally has EnableTeleconsultation = true, but license token lacks entitlement!
        var settings = new FacilitySettings
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            ClinicName = "Gov Clinic",
            LicenseToken = "downgraded-or-unentitled-license",
            EnableTeleconsultation = true
        };
        await settingsRepo.AddAsync(settings);

        var patient = new Patient
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientCode = "P-100",
            FirstName = "Maria",
            LastName = "Santos",
            ContactNumber = "09181234567",
            DateOfBirth = new DateOnly(1985, 5, 20)
        };
        await patientRepo.AddAsync(patient);

        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = patient.Id,
            Patient = patient,
            PatientName = "Maria Santos",
            DoctorId = _staffId,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = Guid.NewGuid(),
            AdmittedAtUtc = DateTime.UtcNow,
            PaymentPolicy = TeleconsultPaymentPolicy.Exempt,
            PaymentStatus = TeleconsultPaymentStatus.Exempt
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var unentitledValidator = CreateValidator(entitled: false);

        // 1. CreateAppointmentCommand
        var createAptHandler = new CreateAppointmentCommandHandler(
            aptRepo, uow, _clinicContext, settingsRepo: settingsRepo, licenseValidator: unentitledValidator);
        var createCmd = new CreateAppointmentCommand(
            PatientId: patient.Id,
            PatientName: "Maria Santos",
            DoctorId: _staffId,
            DoctorName: "Dr. Test",
            ScheduledAt: DateTime.UtcNow.AddHours(2),
            DurationMinutes: 30,
            AppointmentType: AppointmentType.Teleconsult);

        var act1 = () => createAptHandler.Handle(createCmd, CancellationToken.None);
        await act1.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");

        // 2. AdmitTeleconsultPatientCommand
        var admitHandler = new AdmitTeleconsultPatientCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher,
            NullLogger<AdmitTeleconsultPatientCommandHandler>.Instance,
            settingsRepo: settingsRepo, licenseValidator: unentitledValidator);

        var act2 = () => admitHandler.Handle(new AdmitTeleconsultPatientCommand(apt.Id), CancellationToken.None);
        await act2.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");

        // 3. JoinTeleconsultCallCommand
        var joinHandler = new JoinTeleconsultCallCommandHandler(
            aptRepo, settingsRepo, auditRepo, uow, _clinicContext, requestClient, publisher,
            NullLogger<JoinTeleconsultCallCommandHandler>.Instance,
            licenseValidator: unentitledValidator);

        var act3 = () => joinHandler.Handle(new JoinTeleconsultCallCommand(apt.Id), CancellationToken.None);
        await act3.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");

        // 4. CreateTeleconsultGuestInviteCommand
        var inviteHandler = new CreateTeleconsultGuestInviteCommandHandler(
            aptRepo, patientRepo, auditRepo, uow, _clinicContext, publisher, config,
            NullLogger<CreateTeleconsultGuestInviteCommandHandler>.Instance,
            settingsRepo: settingsRepo, licenseValidator: unentitledValidator);

        var act4 = () => inviteHandler.Handle(new CreateTeleconsultGuestInviteCommand(apt.Id), CancellationToken.None);
        await act4.Should().ThrowAsync<ForbiddenException>()
            .WithMessage("Teleconsultation is not enabled for this clinic.");
    }

    [Fact]
    public async Task EndTeleconsultCallCommand_EnqueuesBothGuestInviteRevokedAndMediaRoomEndedAndCommsCallStateChanged()
    {
        var (context, uow, sieve) = TestDbHelper.CreateTestContext(_clinicContext);
        var aptRepo = TestDbHelper.CreateRepository<Appointment>(context, sieve);
        var sessionRepo = TestDbHelper.CreateRepository<TeleconsultRecordingSession>(context, sieve);
        var auditRepo = TestDbHelper.CreateRepository<AuditEntry>(context, sieve);
        var publisher = Substitute.For<IInteropPublisher>();
        var sender = Substitute.For<ISender>();

        var callId = Guid.NewGuid();
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            TenantId = _testTenantId,
            ClinicId = _testClinicId,
            PatientId = Guid.NewGuid(),
            PatientName = "Juan Dela Cruz",
            DoctorId = _staffId,
            ScheduledAt = DateTime.UtcNow,
            AppointmentType = AppointmentType.Teleconsult,
            CallId = callId,
            Status = AppointmentStatus.InConsultation
        };
        await aptRepo.AddAsync(apt);
        await uow.SaveChangesAsync();

        var handler = new EndTeleconsultCallCommandHandler(
            aptRepo, sessionRepo, auditRepo, uow, _clinicContext, publisher, sender,
            NullLogger<EndTeleconsultCallCommandHandler>.Instance);

        var result = await handler.Handle(
            new EndTeleconsultCallCommand(apt.Id, "Consultation concluded by doctor"), CancellationToken.None);

        result.Should().NotBeNull();
        result.AppointmentId.Should().Be(apt.Id);
        result.CallId.Should().Be(callId);
        result.Status.Should().Be("Ended");
        result.CommsCallStateChangedEnqueued.Should().BeTrue();
        result.WormAuditLogged.Should().BeTrue();

        // 1. Enqueued GuestTeleconsultInviteRevoked to Party.Portal
        publisher.Received(1).Enqueue(
            InteropTypes.GuestTeleconsultInviteRevoked,
            Arg.Any<Party>(),
            Party.Portal,
            apt.Id,
            Arg.Is<GuestTeleconsultInviteRevokedPayload>(p =>
                p.AppointmentId == apt.Id &&
                p.CallId == callId &&
                p.TenantId == _testTenantId &&
                p.FacilityId == _testClinicId.ToString() &&
                p.Reason == "Consultation concluded by doctor"));

        // 2. Enqueued MediaRoomEnded to Party.Media
        publisher.Received(1).Enqueue(
            InteropTypes.MediaRoomEnded,
            Arg.Any<Party>(),
            Party.Media,
            callId,
            Arg.Is<MediaRoomEndedPayload>(p =>
                p.CallId == callId &&
                p.TenantId == _testTenantId &&
                p.RoomName == $"call-{callId:N}"));

        // 3. Enqueued CommsCallStateChanged to Party.ForPatient
        publisher.Received(1).Enqueue(
            InteropTypes.CommsCallStateChanged,
            Arg.Any<Party>(),
            Arg.Is<Party>(p => p.Kind == PartyKind.Patient),
            callId,
            Arg.Is<CommsCallStateChangedPayload>(p =>
                p.CallId == callId &&
                p.Status == "Ended" &&
                p.StateVersion == 2));
    }
}
