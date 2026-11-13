using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier1_FeatureCoverage;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 1: Feature Coverage for F1 (AppointmentBookedEvent.AppointmentType) and F2 (Facility Teleconsult Settings).
/// Minimum 5 tests per feature (10 tests total).
/// </summary>
public class Tier1_AppointmentModalityAndSettingsTests
{
    private readonly Guid _clinicId = Guid.NewGuid();
    private readonly string _tenantId = "tenant-settings-t1";

    // =========================================================================
    // Feature 1: AppointmentBookedEvent.AppointmentType
    // =========================================================================

    [Fact]
    public void F1_T1_ExplicitTeleconsultModality_ResolvesToTeleconsult()
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality("Teleconsult", null);

        type.Should().Be(AppointmentType.Teleconsult);
        isTeleconsult.Should().BeTrue();
    }

    [Fact]
    public void F1_T2_ExplicitInPersonModality_ResolvesToInPerson()
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality("InPerson", null);

        type.Should().Be(AppointmentType.InPerson);
        isTeleconsult.Should().BeFalse();
    }

    [Fact]
    public void F1_T3_OmittedAppointmentType_WithTeleconsultServiceType_InfersTeleconsult()
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality(null, "Teleconsultation");

        type.Should().Be(AppointmentType.Teleconsult);
        isTeleconsult.Should().BeTrue();
    }

    [Fact]
    public void F1_T4_NullModalityAndGeneralCheckupService_DefaultsToInPerson()
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality(null, "General Consultation");

        type.Should().Be(AppointmentType.InPerson);
        isTeleconsult.Should().BeFalse();
    }

    [Fact]
    public void F1_T5_CaseInsensitiveModalityStrings_ResolveCorrectly()
    {
        var (type1, isTeleconsult1) = ModalityMapper.ResolveModality("teleconsult", null);
        var (type2, isTeleconsult2) = ModalityMapper.ResolveModality("TELECONSULTATION", null);

        type1.Should().Be(AppointmentType.Teleconsult);
        isTeleconsult1.Should().BeTrue();
        type2.Should().Be(AppointmentType.Teleconsult);
        isTeleconsult2.Should().BeTrue();
    }

    // =========================================================================
    // Feature 2: Facility Teleconsult Settings
    // =========================================================================

    [Fact]
    public void F2_T1_DefaultSettings_InitializesWithStandardPrepaidAnd90DayRetention()
    {
        var settings = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);

        settings.TeleconsultRecordingPolicy.Should().Be("Disabled");
        settings.TeleconsultRecordingRetentionDays.Should().Be(90);
        settings.TeleconsultRecordingConsentRequired.Should().BeTrue();
        settings.TeleconsultPaymentPolicy.Should().Be("Prepaid");
        settings.TeleconsultDefaultFee.Should().Be(400.00m);
    }

    [Fact]
    public void F2_T2_ValidUpdate_RecordingPolicy_UpdatesSuccessfully()
    {
        var current = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: "WorkspaceVaultOnly",
            TeleconsultRecordingRetentionDays: null,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: null,
            TeleconsultDefaultFee: null);

        var updated = FacilitySettingsEngine.ApplyUpdate(current, cmd);

        updated.TeleconsultRecordingPolicy.Should().Be("WorkspaceVaultOnly");
        updated.TeleconsultRecordingRetentionDays.Should().Be(90);
    }

    [Fact]
    public void F2_T3_ValidUpdate_IndefiniteRetentionDays_UpdatesSuccessfully()
    {
        var current = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: null,
            TeleconsultRecordingRetentionDays: 0, // 0 = indefinite
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: null,
            TeleconsultDefaultFee: null);

        var updated = FacilitySettingsEngine.ApplyUpdate(current, cmd);

        updated.TeleconsultRecordingRetentionDays.Should().Be(0);
    }

    [Fact]
    public void F2_T4_ValidUpdate_PaymentPolicyToExempt_UpdatesSuccessfully()
    {
        var current = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: null,
            TeleconsultRecordingRetentionDays: null,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: "Exempt",
            TeleconsultDefaultFee: null);

        var updated = FacilitySettingsEngine.ApplyUpdate(current, cmd);

        updated.TeleconsultPaymentPolicy.Should().Be("Exempt");
    }

    [Fact]
    public void F2_T5_ValidUpdate_CustomDefaultFee_UpdatesSuccessfully()
    {
        var current = new FacilityTeleconsultSettingsDto(_clinicId, _tenantId);
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: null,
            TeleconsultRecordingRetentionDays: null,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: null,
            TeleconsultDefaultFee: 650.00m);

        var updated = FacilitySettingsEngine.ApplyUpdate(current, cmd);

        updated.TeleconsultDefaultFee.Should().Be(650.00m);
    }
}
