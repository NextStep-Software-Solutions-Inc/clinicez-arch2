using System;
using System.Collections.Generic;
using System.Linq;
using System.Linq.Expressions;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Features.Appointments.Queries.GetAvailableSlots;
using ClinicEz.Patient.Application.Features.Clinics.Commands.UnlockClinicAccess;
using ClinicEz.Patient.Application.Features.Clinics.Queries.GetClinicDetail;
using ClinicEz.Patient.Domain.Entities;
using ClinicEz.Patient.Domain.Enums;
using ClinicEz.Patient.Domain.Interfaces;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using FluentValidation;
using ValidationException = ClinicEz.Shared.Exceptions.ValidationException;
using NSubstitute;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Clinics;

using Patient = ClinicEz.Patient.Domain.Entities.Patient;

/// <summary>
/// Empirical Challenger Adversarial Test Suite for Milestone 1 Backend Logic.
/// Authored by challenger_m1_1.
/// </summary>
public sealed class EmpiricalChallengerM1GovernanceTests
{
    private readonly IPatientRepository _patientRepo = Substitute.For<IPatientRepository>();
    private readonly IClinicRepository _clinicRepo = Substitute.For<IClinicRepository>();
    private readonly IClinicMembershipRepository _membershipRepo = Substitute.For<IClinicMembershipRepository>();
    private readonly IOrganizationMembershipRepository _orgMembershipRepo = Substitute.For<IOrganizationMembershipRepository>();
    private readonly IProviderAvailabilityRepository _availabilityRepo = Substitute.For<IProviderAvailabilityRepository>();
    private readonly IAppointmentRepository _appointmentRepo = Substitute.For<IAppointmentRepository>();
    private readonly IUnitOfWork _uow = Substitute.For<IUnitOfWork>();

    // ──────────────────────────────────────────────────────────────────────────
    // 1. Hybrid Gated Intake: Join Code Expiry & Malformed Codes
    // ──────────────────────────────────────────────────────────────────────────

    [Theory]
    [InlineData("12345", "too short")]
    [InlineData("1234567", "too long")]
    [InlineData("VIP-88", "hyphen")]
    [InlineData("VIP@88", "special char")]
    [InlineData("VIP 88", "space")]
    public void UnlockValidator_WhenMalformedJoinCode_FailsValidation(string malformedCode, string reason)
    {
        var validator = new UnlockClinicAccessCommandValidator();
        var command = new UnlockClinicAccessCommand(Guid.NewGuid(), Guid.NewGuid(), JoinCode: malformedCode);

        var result = validator.Validate(command);

        result.IsValid.Should().BeFalse($"code '{malformedCode}' ({reason}) must fail validation");
    }

    [Fact]
    public async Task UnlockClinic_WhenJoinCodeExpiredByOneSecond_ThrowsValidationException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var handler = new UnlockClinicAccessCommandHandler(
            _patientRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo, _uow);

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic
            {
                Id = clinicId,
                IsGated = true,
                JoinCode = "VIP888",
                JoinCodeExpiresAt = DateTime.UtcNow.AddSeconds(-1)
            });

        var act = () => handler.Handle(
            new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "VIP888"),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*expired*");
    }

    [Fact]
    public async Task UnlockClinic_WhenJoinCodeIsPermanentNullExpiry_Succeeds()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var handler = new UnlockClinicAccessCommandHandler(
            _patientRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo, _uow);

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic
            {
                Id = clinicId,
                IsGated = true,
                JoinCode = "VIP888",
                JoinCodeExpiresAt = null // Permanent
            });

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        var result = await handler.Handle(
            new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "VIP888"),
            CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsUnlocked.Should().BeTrue();
    }

    [Fact]
    public async Task UnlockClinic_WhenJoinCodeMatchesCaseInsensitively_Succeeds()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var handler = new UnlockClinicAccessCommandHandler(
            _patientRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo, _uow);

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic
            {
                Id = clinicId,
                IsGated = true,
                JoinCode = "VIP888"
            });

        _membershipRepo.GetByPatientAndClinicWithDeletedAsync(patientId, clinicId, Arg.Any<CancellationToken>())
            .Returns((ClinicMembership?)null);

        var result = await handler.Handle(
            new UnlockClinicAccessCommand(clinicId, patientId, JoinCode: "vip888"),
            CancellationToken.None);

        result.Success.Should().BeTrue();
        result.IsUnlocked.Should().BeTrue();
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 2. Hybrid Gated Intake: Organization Resolution & Inactive Link Defense
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task UnlockClinic_WhenOrganizationLinkIsInactive_ThrowsValidationException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        var handler = new UnlockClinicAccessCommandHandler(
            _patientRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo, _uow);

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic
            {
                Id = clinicId,
                IsGated = true,
                OrganizationLinks =
                [
                    new ClinicOrganizationLink { OrganizationId = orgId, IsActive = false } // Inactive link
                ]
            });

        var act = () => handler.Handle(
            new UnlockClinicAccessCommand(clinicId, patientId, OrganizationId: orgId),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*not linked*");
    }

    [Fact]
    public async Task UnlockClinic_WhenPatientOrgMembershipIsPending_ThrowsValidationException()
    {
        var patientId = Guid.NewGuid();
        var clinicId = Guid.NewGuid();
        var orgId = Guid.NewGuid();
        var handler = new UnlockClinicAccessCommandHandler(
            _patientRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo, _uow);

        _patientRepo.GetByIdAsync(patientId, Arg.Any<CancellationToken>())
            .Returns(new Patient { Id = patientId });

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic
            {
                Id = clinicId,
                IsGated = true,
                OrganizationLinks =
                [
                    new ClinicOrganizationLink { OrganizationId = orgId, IsActive = true }
                ]
            });

        _orgMembershipRepo.GetByPatientAndOrgAsync(patientId, orgId, Arg.Any<CancellationToken>())
            .Returns(new OrganizationMembership
            {
                PatientId = patientId,
                OrganizationId = orgId,
                Status = ClinicMembershipStatus.Pending // Not Active
            });

        var act = () => handler.Handle(
            new UnlockClinicAccessCommand(clinicId, patientId, OrganizationId: orgId),
            CancellationToken.None);

        await act.Should().ThrowAsync<ValidationException>()
            .WithMessage("*active membership*");
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 3. Hybrid Gated Intake: Zero Data Leakage Proofs
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetClinicDetail_WhenGatedAndLocked_GuaranteesZeroServicesLeaked()
    {
        var clinicId = Guid.NewGuid();
        var handler = new GetClinicDetailQueryHandler(_clinicRepo, _membershipRepo, _orgMembershipRepo);

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic
            {
                Id = clinicId,
                Name = "Gated Clinic",
                IsGated = true,
                Services =
                [
                    new ClinicService { Id = Guid.NewGuid(), Name = "Confidential Procedure", Price = 9999m, IsActive = true }
                ]
            });

        var result = await handler.Handle(new GetClinicDetailQuery(clinicId, ForPatientId: null), CancellationToken.None);

        result.Should().NotBeNull();
        result!.IsUnlocked.Should().BeFalse();
        result.Services.Should().BeEmpty("Services must strictly be redacted when locked");
    }

    [Fact]
    public async Task GetAvailableSlots_WhenGatedAndLocked_GuaranteesZeroSlotsLeakedAndNoAvailabilityQuery()
    {
        var clinicId = Guid.NewGuid();
        var providerId = Guid.NewGuid();
        var handler = new GetAvailableSlotsQueryHandler(
            _availabilityRepo, _appointmentRepo, _clinicRepo, _membershipRepo, _orgMembershipRepo);

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic { Id = clinicId, IsGated = true });

        var slots = await handler.Handle(
            new GetAvailableSlotsQuery(clinicId, providerId, new DateOnly(2026, 10, 20), ForPatientId: null),
            CancellationToken.None);

        slots.Should().BeEmpty();
        await _availabilityRepo.DidNotReceive()
            .FindAsync(Arg.Any<Expression<Func<ProviderAvailability, bool>>>(), Arg.Any<CancellationToken>());
    }

    // ──────────────────────────────────────────────────────────────────────────
    // 4. Capacity Controls: Booking Pause & SupportsAppointments Propagation
    // ──────────────────────────────────────────────────────────────────────────

    [Fact]
    public async Task GetClinicDetail_WhenSupportsAppointmentsIsFalse_ReflectsFalseInDto()
    {
        var clinicId = Guid.NewGuid();
        var handler = new GetClinicDetailQueryHandler(_clinicRepo, _membershipRepo, _orgMembershipRepo);

        _clinicRepo.GetByIdAsync(clinicId, Arg.Any<CancellationToken>())
            .Returns(new Clinic
            {
                Id = clinicId,
                Name = "Paused Clinic",
                IsGated = false,
                SupportsAppointments = false // Online booking paused
            });

        var result = await handler.Handle(new GetClinicDetailQuery(clinicId), CancellationToken.None);

        result.Should().NotBeNull();
        result!.SupportsAppointments.Should().BeFalse("Dto must propagate SupportsAppointments = false to the patient app");
    }
}
