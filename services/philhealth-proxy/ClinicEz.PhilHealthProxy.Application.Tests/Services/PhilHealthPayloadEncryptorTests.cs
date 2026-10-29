using System;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
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
    private const string SampleJson = "{\"pHciAccreNo\":\"H90000001\",\"enlistments\":[]}";

    [Fact]
    public void EncryptPayload_ShouldProduceValidAnnexCJsonEnvelope()
    {
        // Act
        var json = _sut.EncryptPayload(SampleJson, SampleCipherKey);

        // Assert
        json.Should().NotBeNullOrWhiteSpace();
        var envelope = JsonSerializer.Deserialize<PhilHealthEncryptedPayload>(json);
        envelope.Should().NotBeNull();
        envelope!.DocMimeType.Should().Be("application/json");
        envelope.Hash.Should().NotBeNullOrWhiteSpace();
        envelope.Iv.Should().NotBeNullOrWhiteSpace();
        envelope.Doc.Should().NotBeNullOrWhiteSpace();
        envelope.Key1.Should().BeEmpty();
        envelope.Key2.Should().BeEmpty();

        // IV must decode to exactly 16 bytes (AES-256 block size)
        var ivBytes = Convert.FromBase64String(envelope.Iv);
        ivBytes.Length.Should().Be(16);

        // Hash must match lowercase hex SHA256 of plain data
        var expectedHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(SampleJson))).ToLowerInvariant();
        envelope.Hash.Should().Be(expectedHash);

        // Ciphertext must decode to valid byte array
        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        cipherBytes.Length.Should().BeGreaterThan(0);
    }

    [Fact]
    public void DecryptPayload_ShouldReturnOriginalJson_WhenValidEnvelopeAndKeyProvided()
    {
        // Arrange
        var json = _sut.EncryptPayload(SampleJson, SampleCipherKey);

        // Act
        var decrypted = _sut.DecryptPayload(json, SampleCipherKey);

        // Assert
        decrypted.Should().Be(SampleJson);
    }

    [Fact]
    public void DecryptPayload_ShouldThrow_WhenWrongCipherKeyIsUsed()
    {
        // Arrange
        var json = _sut.EncryptPayload(SampleJson, SampleCipherKey);
        const string wrongKey = "WRONG-CIPHER-KEY-12345";

        // Act & Assert
        var act = () => _sut.DecryptPayload(json, wrongKey);
        act.Should().Throw<CryptographicException>();
    }

    [Fact]
    public void DecryptPayload_ShouldThrow_WhenHashDoesNotMatch_IntegrityTampered()
    {
        // Arrange
        var envelope = _sut.Encrypt(SampleJson, SampleCipherKey);
        var tamperedEnvelope = envelope with { Hash = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" };
        var tamperedJson = JsonSerializer.Serialize(tamperedEnvelope);

        // Act & Assert
        var act = () => _sut.DecryptPayload(tamperedJson, SampleCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*integrity check failed*");
    }

    [Fact]
    public void EncryptDecrypt_Exact16ByteMultiple_AddsZeroExtraPaddingBytes()
    {
        // 32 ASCII characters = exactly 32 bytes (multiple of 16)
        string exact32Bytes = "12345678901234561234567890123456";
        Encoding.UTF8.GetByteCount(exact32Bytes).Should().Be(32);

        var envelope = _sut.Encrypt(exact32Bytes, SampleCipherKey);
        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        cipherBytes.Length.Should().Be(32); // Exact multiple of 16!

        var decrypted = _sut.Decrypt(envelope, SampleCipherKey);
        decrypted.Should().Be(exact32Bytes);
    }

    [Fact]
    public void EncryptDecrypt_Non16ByteMultiple_PadsWithNullBytesAndUnpadsCleanly()
    {
        // 17 ASCII characters = 17 bytes -> pads to 32 bytes with 15 null bytes
        string text17Bytes = "12345678901234567";
        Encoding.UTF8.GetByteCount(text17Bytes).Should().Be(17);

        var envelope = _sut.Encrypt(text17Bytes, SampleCipherKey);
        var cipherBytes = Convert.FromBase64String(envelope.Doc);
        cipherBytes.Length.Should().Be(32);

        var decrypted = _sut.Decrypt(envelope, SampleCipherKey);
        decrypted.Should().Be(text17Bytes);
    }

    [Fact]
    public void DecryptPdf_ValidatesMandatoryEofMarker()
    {
        byte[] validPdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n123\n%%EOF");
        var envelope = _sut.EncryptBytes(validPdfBytes, "application/pdf", SampleCipherKey);

        var decrypted = _sut.DecryptPdf(envelope, SampleCipherKey);
        decrypted.Should().BeEquivalentTo(validPdfBytes);

        byte[] invalidPdfBytes = Encoding.ASCII.GetBytes("%PDF-1.7 without end of file marker");
        var badEnvelope = _sut.EncryptBytes(invalidPdfBytes, "application/pdf", SampleCipherKey);
        var act = () => _sut.DecryptPdf(badEnvelope, SampleCipherKey);
        act.Should().Throw<CryptographicException>().WithMessage("*mandatory %%EOF marker*");
    }

    [Fact]
    public void EncryptDecrypt_ShouldHandleLargePayloads()
    {
        // Arrange: Generate ~100KB JSON payload
        var largeJson = "{\"items\":[" + string.Join(",", Enumerable.Range(0, 1500).Select(i => $"{{\"id\":{i},\"val\":\"sample-payload-data-{i}\"}}")) + "]}";

        // Act
        var encryptedJson = _sut.EncryptPayload(largeJson, SampleCipherKey);
        var decrypted = _sut.DecryptPayload(encryptedJson, SampleCipherKey);

        // Assert
        decrypted.Should().Be(largeJson);
    }
}
