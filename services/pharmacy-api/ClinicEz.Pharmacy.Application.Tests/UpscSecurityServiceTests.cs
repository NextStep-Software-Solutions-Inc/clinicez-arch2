using System;
using ClinicEz.Pharmacy.Domain.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Pharmacy.Application.Tests;

public class UpscSecurityServiceTests
{
    private readonly IUpscSecurityService _sut = new UpscSecurityService();

    [Fact]
    public void GenerateUpsc_Should_Return_Well_Formatted_UPSC()
    {
        var issueDate = new DateTime(2026, 10, 3, 8, 30, 0, DateTimeKind.Utc);
        var upsc = _sut.GenerateUpsc(
            hciAccreditationNumber: "HCI-NCR-00123",
            patientPin: "12-345678901-2",
            prescriptionNumber: "RX-2026-0099",
            doctorPrcLicense: "PRC-MED-998877",
            drugCode: "AMLODIPINE5MG00000000000000000",
            quantity: 30,
            issueDate: issueDate);

        upsc.Should().NotBeNullOrWhiteSpace();
        upsc.Should().StartWith("UPSC-HCINCR00123-20261003-");

        var parts = upsc.Split('-');
        parts.Length.Should().Be(5); // UPSC - HCINCR00123 - 20261003 - TOKEN - CHECKSUM
        parts[0].Should().Be("UPSC");
        parts[1].Should().Be("HCINCR00123");
        parts[2].Should().Be("20261003");
        parts[3].Length.Should().Be(6); // 6-char HMAC slice
        parts[4].Length.Should().Be(1); // Mod-11 check digit (0-9 or X)
    }

    [Fact]
    public void VerifyChecksum_Should_Return_True_For_Valid_UPSC()
    {
        var issueDate = new DateTime(2026, 10, 3, 10, 0, 0, DateTimeKind.Utc);
        var upsc = _sut.GenerateUpsc(
            hciAccreditationNumber: "HCI-CEBU-456",
            patientPin: "098765432101",
            prescriptionNumber: "RX-CEBU-100",
            doctorPrcLicense: "PRC-123456",
            drugCode: "METFORMIN500000000000000000000",
            quantity: 60,
            issueDate: issueDate);

        var isValid = _sut.VerifyChecksum(upsc);
        isValid.Should().BeTrue();
    }

    [Fact]
    public void VerifyChecksum_Should_Return_False_When_CheckDigit_Is_Tampered()
    {
        var issueDate = new DateTime(2026, 10, 3);
        var upsc = _sut.GenerateUpsc(
            hciAccreditationNumber: "HCI-001",
            patientPin: "123456789012",
            prescriptionNumber: "RX-01",
            doctorPrcLicense: "PRC-01",
            drugCode: "LOSARTAN5000000000000000000000",
            quantity: 30,
            issueDate: issueDate);

        var lastChar = upsc[^1];
        var tamperedChar = lastChar == '0' ? '1' : '0';
        var tamperedUpsc = upsc[..^1] + tamperedChar;

        _sut.VerifyChecksum(tamperedUpsc).Should().BeFalse();
    }

    [Fact]
    public void VerifyChecksum_Should_Return_False_When_Payload_Is_Tampered()
    {
        var issueDate = new DateTime(2026, 10, 3);
        var upsc = _sut.GenerateUpsc(
            hciAccreditationNumber: "HCI-001",
            patientPin: "123456789012",
            prescriptionNumber: "RX-01",
            doctorPrcLicense: "PRC-01",
            drugCode: "LOSARTAN5000000000000000000000",
            quantity: 30,
            issueDate: issueDate);

        // Tamper with the token part
        var parts = upsc.Split('-');
        var tamperedToken = parts[3] == "AAAAAA" ? "BBBBBB" : "AAAAAA";
        var tamperedUpsc = $"{parts[0]}-{parts[1]}-{parts[2]}-{tamperedToken}-{parts[4]}";

        _sut.VerifyChecksum(tamperedUpsc).Should().BeFalse();
    }

    [Fact]
    public void ValidateUpsc_Should_Verify_Authenticity_And_Detect_Parameter_Mismatches()
    {
        var issueDate = new DateTime(2026, 10, 3);
        var upsc = _sut.GenerateUpsc(
            hciAccreditationNumber: "HCI-DVO-009",
            patientPin: "12-345678901-2",
            prescriptionNumber: "RX-2026-DVO-001",
            doctorPrcLicense: "PRC-776655",
            drugCode: "PARACETAMOL5000000000000000000",
            quantity: 20,
            issueDate: issueDate);

        // Matching inputs should validate successfully
        _sut.ValidateUpsc(
            upsc: upsc,
            hciAccreditationNumber: "HCI-DVO-009",
            patientPin: "12-345678901-2",
            prescriptionNumber: "RX-2026-DVO-001",
            doctorPrcLicense: "PRC-776655",
            drugCode: "PARACETAMOL5000000000000000000",
            quantity: 20,
            issueDate: issueDate
        ).Should().BeTrue();

        // Mismatched patient PIN should fail
        _sut.ValidateUpsc(
            upsc: upsc,
            hciAccreditationNumber: "HCI-DVO-009",
            patientPin: "99-999999999-9",
            prescriptionNumber: "RX-2026-DVO-001",
            doctorPrcLicense: "PRC-776655",
            drugCode: "PARACETAMOL5000000000000000000",
            quantity: 20,
            issueDate: issueDate
        ).Should().BeFalse();

        // Mismatched drug code should fail
        _sut.ValidateUpsc(
            upsc: upsc,
            hciAccreditationNumber: "HCI-DVO-009",
            patientPin: "12-345678901-2",
            prescriptionNumber: "RX-2026-DVO-001",
            doctorPrcLicense: "PRC-776655",
            drugCode: "AMOXICILLIN5000000000000000000",
            quantity: 20,
            issueDate: issueDate
        ).Should().BeFalse();

        // Mismatched quantity should fail
        _sut.ValidateUpsc(
            upsc: upsc,
            hciAccreditationNumber: "HCI-DVO-009",
            patientPin: "12-345678901-2",
            prescriptionNumber: "RX-2026-DVO-001",
            doctorPrcLicense: "PRC-776655",
            drugCode: "PARACETAMOL5000000000000000000",
            quantity: 40,
            issueDate: issueDate
        ).Should().BeFalse();
    }
}
