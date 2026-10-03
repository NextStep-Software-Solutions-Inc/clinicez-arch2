using System.Security.Cryptography;
using System.Text.Json;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class PhilHealthPayloadEncryptorTests
{
    private readonly PhilHealthPayloadEncryptor _sut = new();
    private const string SampleCipherKey = "PHIC-CIPHER-KEY-SECRET-2026-X992";
    private const string SampleXml = "<PCB pHciAccreNo=\"H90000001\"><ENLISTMENTS/></PCB>";

    [Fact]
    public void EncryptPayload_ShouldProduceValidAnnexDJsonEnvelope()
    {
        // Act
        var json = _sut.EncryptPayload(SampleXml, SampleCipherKey);

        // Assert
        json.Should().NotBeNullOrWhiteSpace();
        var envelope = JsonSerializer.Deserialize<PhilHealthEncryptedPayload>(json);
        envelope.Should().NotBeNull();
        envelope!.DocMimeType.Should().Be("<text/xml>");
        envelope.Hash.Should().NotBeNullOrWhiteSpace();
        envelope.Iv.Should().NotBeNullOrWhiteSpace();
        envelope.Doc.Should().NotBeNullOrWhiteSpace();
        envelope.Key1.Should().BeEmpty();
        envelope.Key2.Should().BeEmpty();

        // IV must decode to exactly 16 bytes (AES-256 block size)
        var ivBytes = Convert.FromBase64String(envelope.Iv);
        ivBytes.Length.Should().Be(16);

        // Ciphertext must decode to valid byte array
        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        cipherBytes.Length.Should().BeGreaterThan(0);
    }

    [Fact]
    public void DecryptPayload_ShouldReturnOriginalXml_WhenValidEnvelopeAndKeyProvided()
    {
        // Arrange
        var json = _sut.EncryptPayload(SampleXml, SampleCipherKey);

        // Act
        var decryptedXml = _sut.DecryptPayload(json, SampleCipherKey);

        // Assert
        decryptedXml.Should().Be(SampleXml);
    }

    [Fact]
    public void DecryptPayload_ShouldThrow_WhenWrongCipherKeyIsUsed()
    {
        // Arrange
        var json = _sut.EncryptPayload(SampleXml, SampleCipherKey);
        const string wrongKey = "WRONG-CIPHER-KEY-12345";

        // Act & Assert
        var act = () => _sut.DecryptPayload(json, wrongKey);
        act.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void DecryptPayload_ShouldThrow_WhenHashDoesNotMatch_IntegrityTampered()
    {
        // Arrange
        var envelope = _sut.Encrypt(SampleXml, SampleCipherKey);
        var tamperedEnvelope = envelope with { Hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" };
        var tamperedJson = JsonSerializer.Serialize(tamperedEnvelope);

        // Act & Assert
        var act = () => _sut.DecryptPayload(tamperedJson, SampleCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*integrity check failed*");
    }

    [Fact]
    public void EncryptDecrypt_ShouldHandleLargeXmlPayloads()
    {
        // Arrange: Generate ~100KB XML payload
        var largeXml = "<PCB>" + string.Concat(Enumerable.Repeat("<ITEM data=\"value-1234567890\"/>", 2500)) + "</PCB>";

        // Act
        var encryptedJson = _sut.EncryptPayload(largeXml, SampleCipherKey);
        var decryptedXml = _sut.DecryptPayload(encryptedJson, SampleCipherKey);

        // Assert
        decryptedXml.Should().Be(largeXml);
    }
}
