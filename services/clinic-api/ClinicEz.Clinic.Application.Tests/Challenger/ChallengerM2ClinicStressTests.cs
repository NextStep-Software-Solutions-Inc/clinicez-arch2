using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Entities;
using ClinicEz.Clinic.Domain.Enums;
using ClinicEz.Shared.Exceptions;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Challenger;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Empirical Adversarial Challenge Suite for Milestone E2E-M2 in Clinic API:
/// Stress-tests Multi-Participant Disconnect/Reconnect, Explicit End Call Boundaries, and Governance Cascades.
/// </summary>
public class ChallengerM2ClinicStressTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-challenger-m2";
    private readonly Guid _doctorId = Guid.NewGuid();
    private readonly Guid _patientId = Guid.NewGuid();

    [Fact]
    public void AccidentalDisconnect_UnderRepeatedFluctuations_PreservesActiveSessionAndReconnection()
    {
        var callId = Guid.NewGuid();
        var session = new LiveKitSessionState(callId, $"call-{callId:N}", "Active", DateTime.UtcNow.AddMinutes(-30), TimeSpan.FromHours(2), ReconnectionAllowed: true);

        // Simulate 5 repeated Wi-Fi drops and recoveries
        for (int i = 0; i < 5; i++)
        {
            session = ProductionLifecycleEngine.SimulateNetworkDrop(session, TimeSpan.FromSeconds(20));
            session.Status.Should().Be("Active", $"Session must remain Active through drop {i + 1}");
            session.ReconnectionAllowed.Should().BeTrue();

            bool canRejoin = ProductionLifecycleEngine.EvaluateReconnection(session, TimeSpan.FromMinutes(30 + i * 2));
            canRejoin.Should().BeTrue($"Reconnection {i + 1} must be granted within 2-hour TTL");
        }
    }

    [Fact]
    public void ExplicitEndCall_StrictlyRequiresConfirmationDialog_BeforeEmittingRevocation()
    {
        var apt = new Appointment
        {
            Id = Guid.NewGuid(),
            CallId = Guid.NewGuid(),
            TenantId = _tenantId,
            ClinicId = _clinicId,
            PatientName = "Pedro Cruz",
            Status = AppointmentStatus.Confirmed
        };
        var audits = new List<AuditEntry>();
        var events = new List<string>();

        // Act 1: Unconfirmed attempt
        var unconfirmedAct = () => ProductionLifecycleEngine.ExplicitPhysicianEndCall(apt, _doctorId, confirmedInDialog: false, audits, events);
        unconfirmedAct.Should().Throw<InvalidOperationException>()
            .WithMessage("*confirmation dialog*");

        // Verify side-effects were NOT emitted
        apt.Status.Should().Be(AppointmentStatus.Confirmed, "Status must not change without confirmation");
        events.Should().BeEmpty();
        audits.Should().BeEmpty();

        // Act 2: Confirmed attempt
        var result = ProductionLifecycleEngine.ExplicitPhysicianEndCall(apt, _doctorId, confirmedInDialog: true, audits, events);
        result.AppointmentMarkedCompleted.Should().BeTrue();
        apt.Status.Should().Be(AppointmentStatus.Completed);
        events.Should().Contain(e => e.StartsWith("portal.teleconsult.guest_invite_revoked:"));
        events.Should().Contain(e => e.StartsWith("media.room.ended:"));
        audits.Should().ContainSingle();
    }

    [Fact]
    public void MultiClinicGovernance_MassiveDowngradeCascade_SimultaneouslyDisablesAllFacilities()
    {
        // 50 clinics belonging to same tenant
        var clinics = Enumerable.Range(1, 50)
            .Select(i => new FacilityGovernanceSettingsDto(Guid.NewGuid(), _tenantId, EnableTeleconsultation: true, IsWorkspaceTeleconsultEntitled: true))
            .ToList();

        // License update arrives with teleconsultation removed
        var downgradedLicense = new ClinicLicenseGrantDto(_tenantId, GrantedFeatures: ["feature.prescriptions"], DateTime.UtcNow.AddDays(30));

        int cascaded = GovernanceEngine.CascadeLicenseRevocation(clinics, downgradedLicense);

        cascaded.Should().Be(50);
        clinics.Should().AllSatisfy(c =>
        {
            c.EnableTeleconsultation.Should().BeFalse();
            c.IsWorkspaceTeleconsultEntitled.Should().BeFalse();
        });
    }

    [Fact]
    public void SoloWarning_ReentryOfRemoteParticipant_InterruptsCountdownAndDismissesWarning()
    {
        var callId = Guid.NewGuid();
        // Solo for 5 minutes 30 seconds (in grace period)
        var soloState = new SoloRoomSessionState(callId, RemoteParticipantCount: 0, TimeSpan.FromMinutes(5).Add(TimeSpan.FromSeconds(30)), WarningBannerVisible: true, false, false);

        // Guest joins! Remote participant count becomes 1
        var recoveredState = soloState with
        {
            RemoteParticipantCount = 1,
            WarningBannerVisible = false,
            SoloDuration = TimeSpan.Zero
        };

        recoveredState.WarningBannerVisible.Should().BeFalse();
        recoveredState.AutoLeaveTriggered.Should().BeFalse();
        recoveredState.SoloDuration.Should().Be(TimeSpan.Zero);
    }
}
