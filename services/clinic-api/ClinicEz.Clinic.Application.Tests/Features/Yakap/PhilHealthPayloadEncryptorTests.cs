using System;
using System.Text;
using System.Text.Json;
using ClinicEz.Clinic.Application.Features.Yakap.DTOs;
using ClinicEz.Clinic.Application.Features.Yakap.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.Clinic.Application.Tests.Features.Yakap;

public sealed class PhilHealthPayloadEncryptorTests
{
    private readonly PhilHealthPayloadEncryptor _encryptor = new();
    private const string TestCipherKey = "0123456789abcdef0123456789abcdef";

    [Fact]
    public void EncryptJson_And_DecryptJson_RoundTripsSuccessfully()
    {
        // Arrange
        var sampleData = new
        {
            pHciAccreNo = "H12345678",
            pHciCaseNo = "C1234567890123456789",
            pPatientPin = "12-345678901-2",
            pPatientLName = "DELA CRUZ",
            pPatientFName = "JUAN",
            pConsultDate = "2026-10-28"
        };
        var originalJson = JsonSerializer.Serialize(sampleData);

        // Act
        var envelope = _encryptor.EncryptJson(originalJson, TestCipherKey);

        // Assert
        envelope.Should().NotBeNull();
        envelope.Doc.Should().NotBeNullOrWhiteSpace();
        envelope.Iv.Should().NotBeNullOrWhiteSpace();
        envelope.Hash.Should().NotBeNullOrWhiteSpace();
        envelope.DocMimeType.Should().Be("application/json");

        // Decrypt
        var decryptedJson = _encryptor.DecryptJson(envelope, TestCipherKey);
        decryptedJson.Should().Be(originalJson);
    }

    [Fact]
    public void EncryptJson_ZeroPadsToMultipleOf16()
    {
        // Arrange
        var oddLengthJson = "{\"test\":\"12345\"}"; // length 16? Let's check
        var plainBytes = Encoding.UTF8.GetBytes(oddLengthJson);
        var expectedPaddedLength = (plainBytes.Length % 16 == 0)
            ? plainBytes.Length
            : plainBytes.Length + (16 - (plainBytes.Length % 16));

        // Act
        var envelope = _encryptor.EncryptJson(oddLengthJson, TestCipherKey);
        var cipherBytes = Convert.FromBase64String(envelope.Doc);

        // Assert: ciphertext length must match expected 16-byte block boundary
        cipherBytes.Length.Should().Be(expectedPaddedLength);

        // And decryption removes trailing zero padding
        var decrypted = _encryptor.DecryptJson(envelope, TestCipherKey);
        decrypted.Should().Be(oddLengthJson);
    }

    [Fact]
    public void EncryptJson_ExactMultipleOf16_AddsZeroPaddingBytes()
    {
        // Arrange - craft payload with exactly 32 bytes (multiple of 16)
        var exact32Bytes = new string('A', 32);

        // Act
        var envelope = _encryptor.EncryptJson(exact32Bytes, TestCipherKey);
        var cipherBytes = Convert.FromBase64String(envelope.Doc);

        // Assert: in Annex C zero-padding, if plainBytes % 16 == 0, 0 padding bytes are added
        cipherBytes.Length.Should().Be(32);

        var decrypted = _encryptor.DecryptJson(envelope, TestCipherKey);
        decrypted.Should().Be(exact32Bytes);
    }

    [Fact]
    public void EncryptBytes_Pdf_RoundTripsCorrectly()
    {
        // Arrange
        var fakePdf = Encoding.ASCII.GetBytes("%PDF-1.4 Fake PDF Content for ClinicEZ Statutory Transmittal\n%%EOF\n");

        // Act
        var envelope = _encryptor.EncryptBytes(fakePdf, "application/pdf", TestCipherKey);

        // Assert
        envelope.DocMimeType.Should().Be("application/pdf");
        var decryptedBytes = _encryptor.DecryptPdf(envelope, TestCipherKey);
        decryptedBytes.Should().Equal(fakePdf);
    }

    [Fact]
    public void DecryptJson_WithTamperedCiphertext_ThrowsOrFails()
    {
        // Arrange
        var envelope = _encryptor.EncryptJson("{\"safe\":\"data\"}", TestCipherKey);

        // Tamper with data
        var rawData = Convert.FromBase64String(envelope.Doc);
        rawData[0] ^= 0xFF;
        var tamperedEnvelope = envelope with { Doc = Convert.ToBase64String(rawData) };

        // Act & Assert
        var act = () => _encryptor.DecryptJson(tamperedEnvelope, TestCipherKey);
        act.Should().Throw<Exception>("Tampered ciphertext hash verification or deserialization must fail.");
    }
}
