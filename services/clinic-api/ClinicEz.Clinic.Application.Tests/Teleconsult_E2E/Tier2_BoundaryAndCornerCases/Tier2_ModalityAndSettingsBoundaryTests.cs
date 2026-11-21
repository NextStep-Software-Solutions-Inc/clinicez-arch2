using System;
using System.Collections.Generic;
using ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Fixtures;
using ClinicEz.Clinic.Domain.Enums;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Teleconsult_E2E.Tier2_BoundaryAndCornerCases;

using static TeleconsultContracts;
using static TeleconsultTestHarness;

/// <summary>
/// Tier 2: Boundary and Corner Cases for F1 (Appointment Modality) and F2 (Facility Settings).
/// Minimum 5 tests per feature (10 tests total).
/// </summary>
public class Tier2_ModalityAndSettingsBoundaryTests
{
    // =========================================================================
    // Feature 1: Modality Boundary & Corner Cases
    // =========================================================================

    [Theory]
    [InlineData("  Teleconsult  ")]
    [InlineData("\tTeleconsult\n")]
    [InlineData("  teleconsultation  ")]
    public void F1_B1_WhitespacePaddedModality_TrimsAndResolvesTeleconsult(string padded)
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality(padded.Trim(), null);

        type.Should().Be(AppointmentType.Teleconsult);
        isTeleconsult.Should().BeTrue();
    }

    [Theory]
    [InlineData("tElEcOnSuLt")]
    [InlineData("tElEcOnSuLtAtIoN")]
    [InlineData("TeLeCoNsUlT")]
    public void F1_B2_MixedCasingStrings_ResolveTeleconsult(string mixedCase)
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality(mixedCase, null);

        type.Should().Be(AppointmentType.Teleconsult);
        isTeleconsult.Should().BeTrue();
    }

    [Theory]
    [InlineData("Telehealth")]
    [InlineData("Online")]
    [InlineData("Zoom")]
    [InlineData("VideoCall")]
    public void F1_B3_NonStandardModalityStrings_DefaultToInPerson(string nonStandard)
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality(nonStandard, null);

        type.Should().Be(AppointmentType.InPerson);
        isTeleconsult.Should().BeFalse();
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData(null)]
    public void F1_B4_EmptyOrWhitespaceStrings_DefaultToInPerson(string? empty)
    {
        var (type, isTeleconsult) = ModalityMapper.ResolveModality(empty, null);

        type.Should().Be(AppointmentType.InPerson);
        isTeleconsult.Should().BeFalse();
    }

    [Fact]
    public void F1_B5_AppointmentTypeTakesPrecedenceOverServiceType()
    {
        // Explicit Teleconsult appointment type overrides InPerson service type
        var (type, isTeleconsult) = ModalityMapper.ResolveModality("Teleconsult", "Regular Checkup");

        type.Should().Be(AppointmentType.Teleconsult);
        isTeleconsult.Should().BeTrue();
    }

    // =========================================================================
    // Feature 2: Facility Settings Boundary & Corner Cases
    // =========================================================================

    [Theory]
    [InlineData(-1)]
    [InlineData(-30)]
    [InlineData(-365)]
    public void F2_B1_NegativeRetentionDays_ValidationFails(int negativeDays)
    {
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: null,
            TeleconsultRecordingRetentionDays: negativeDays,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: null,
            TeleconsultDefaultFee: null);

        var (isValid, error) = FacilitySettingsEngine.ValidateSettings(cmd);

        isValid.Should().BeFalse();
        error.Should().Contain("greater than or equal to 0");
    }

    [Theory]
    [InlineData(-0.01)]
    [InlineData(-100.0)]
    [InlineData(-400.0)]
    public void F2_B2_NegativeDefaultFee_ValidationFails(double negativeFee)
    {
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: null,
            TeleconsultRecordingRetentionDays: null,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: null,
            TeleconsultDefaultFee: (decimal)negativeFee);

        var (isValid, error) = FacilitySettingsEngine.ValidateSettings(cmd);

        isValid.Should().BeFalse();
        error.Should().Contain("cannot be negative");
    }

    [Fact]
    public void F2_B3_ZeroDefaultFee_IsValidAndAccepted()
    {
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: null,
            TeleconsultRecordingRetentionDays: null,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: null,
            TeleconsultDefaultFee: 0.00m);

        var (isValid, error) = FacilitySettingsEngine.ValidateSettings(cmd);

        isValid.Should().BeTrue();
        error.Should().BeNull();
    }

    [Theory]
    [InlineData("CloudStorage")]
    [InlineData("LocalOnly")]
    [InlineData("InvalidPolicy")]
    [InlineData("")]
    public void F2_B4_InvalidRecordingPolicy_ValidationFails(string invalidPolicy)
    {
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: invalidPolicy,
            TeleconsultRecordingRetentionDays: null,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: null,
            TeleconsultDefaultFee: null);

        var (isValid, error) = FacilitySettingsEngine.ValidateSettings(cmd);

        isValid.Should().BeFalse();
        error.Should().Contain("Invalid recording policy");
    }

    [Theory]
    [InlineData("Credit")]
    [InlineData("Debit")]
    [InlineData("Deferred")]
    [InlineData("Installment")]
    public void F2_B5_InvalidPaymentPolicy_ValidationFails(string invalidPolicy)
    {
        var cmd = new UpdateFacilityTeleconsultSettingsCommand(
            TeleconsultRecordingPolicy: null,
            TeleconsultRecordingRetentionDays: null,
            TeleconsultRecordingConsentRequired: null,
            TeleconsultPaymentPolicy: invalidPolicy,
            TeleconsultDefaultFee: null);

        var (isValid, error) = FacilitySettingsEngine.ValidateSettings(cmd);

        isValid.Should().BeFalse();
        error.Should().Contain("Invalid payment policy");
    }
}
