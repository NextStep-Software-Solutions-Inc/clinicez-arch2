using System;
using System.Collections.Generic;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Infrastructure.Services.Encryption;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Encryption;

public sealed class PatientEncryptionServiceTests
{
    private const string CurrentSecret = "patient-master-secret-current-32chars-min-ok!";
    private const string RetiredSecret = "patient-master-secret-retired-32chars-min-ok!";
    private readonly Guid _patientA = Guid.NewGuid();
    private readonly Guid _patientB = Guid.NewGuid();

    private static PatientEncryptionKeyRing KeyRing(string? current, params string[] previous)
    {
        var values = new Dictionary<string, string?> { [PatientEncryptionKeyRing.MasterSecretKey] = current };
        for (var i = 0; i < previous.Length; i++)
            values[$"{PatientEncryptionKeyRing.PreviousMasterSecretsKey}:{i}"] = previous[i];
        return PatientEncryptionKeyRing.FromConfiguration(new ConfigurationBuilder().AddInMemoryCollection(values).Build());
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("too-short-secret")]
    public void KeyRing_WithoutUsableCurrentSecret_FailsFast(string? secret)
    {
        var act = () => KeyRing(secret);
        act.Should().Throw<InvalidOperationException>().WithMessage("*PatientEncryption*");
    }

    [Fact]
    public async Task EncryptAsync_ShouldProduceValidCiphertextAndMetadata()
    {
        var service = new PatientEncryptionService(KeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("%PDF-1.4 Clinical Diagnostic Evaluation Report");

        var payload = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        payload.Should().NotBeNull();
        payload.Ciphertext.Should().NotBeNull();
        payload.Ciphertext.Length.Should().Be(plaintext.Length);
        payload.Ciphertext.Should().NotEqual(plaintext);

        payload.IvBase64.Should().NotBeNullOrWhiteSpace();
        Convert.FromBase64String(payload.IvBase64).Length.Should().Be(12);

        payload.TagBase64.Should().NotBeNullOrWhiteSpace();
        Convert.FromBase64String(payload.TagBase64).Length.Should().Be(16);

        payload.EncryptedHash.Should().HaveLength(64);
        payload.EncryptedSizeBytes.Should().Be(plaintext.Length);
        payload.WrappedKeyJson.Should().Contain("AES-256-GCM");
        payload.EncryptionAlgorithm.Should().Be("AES-256-GCM");
    }

    [Fact]
    public async Task DecryptAsync_ShouldRestoreOriginalPlaintext()
    {
        var service = new PatientEncryptionService(KeyRing(CurrentSecret));
        var original = "Patient Confidential History: Allergic to Amoxicillin";
        var plaintext = Encoding.UTF8.GetBytes(original);

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);
        var decryptedBytes = await service.DecryptAsync(_patientA, encrypted, CancellationToken.None);

        Encoding.UTF8.GetString(decryptedBytes).Should().Be(original);
    }

    [Fact]
    public async Task DecryptStreamAsync_ShouldRestoreOriginalStreamContent()
    {
        var service = new PatientEncryptionService(KeyRing(CurrentSecret));
        var original = new byte[64 * 1024]; // 64 KB test buffer
        RandomNumberGenerator.Fill(original);

        using var inStream = new MemoryStream(original);
        var encrypted = await service.EncryptStreamAsync(_patientA, inStream, CancellationToken.None);

        using var cipherStream = new MemoryStream(encrypted.Ciphertext);
        using var outStream = await service.DecryptStreamAsync(
            _patientA, cipherStream, encrypted.IvBase64, encrypted.TagBase64, encrypted.WrappedKeyJson, CancellationToken.None);

        outStream.ToArray().Should().Equal(original);
    }

    [Fact]
    public async Task CryptographicIsolation_DecryptingPatientA_Ciphertext_WithPatientB_Id_Throws_CryptographicException()
    {
        // 🔒 CORE ACCEPTANCE CRITERIA: Cryptographic isolation between patients
        var service = new PatientEncryptionService(KeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Patient A Confidential Medical Certificate");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        // Attempt to decrypt Patient A's ciphertext using Patient B's PatientId
        var act = () => service.DecryptAsync(_patientB, encrypted, CancellationToken.None);

        await act.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    [Fact]
    public async Task DecryptAsync_WithTamperedCiphertext_Throws_CryptographicException()
    {
        var service = new PatientEncryptionService(KeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Lab Values: Hemoglobin 14.2 g/dL");
        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        var tamperedCiphertext = (byte[])encrypted.Ciphertext.Clone();
        tamperedCiphertext[0] ^= 0xFF;

        var tamperedPayload = encrypted with { Ciphertext = tamperedCiphertext };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task DecryptAsync_WithTamperedTag_Throws_CryptographicException()
    {
        var service = new PatientEncryptionService(KeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Lab Values: Hemoglobin 14.2 g/dL");
        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        var tagBytes = Convert.FromBase64String(encrypted.TagBase64);
        tagBytes[0] ^= 0xAA;
        var tamperedPayload = encrypted with { TagBase64 = Convert.ToBase64String(tagBytes) };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task Rotation_OldFilesStayReadableAndNewFilesUseCurrent()
    {
        var plaintext = Encoding.UTF8.GetBytes("Pre-rotation health document");
        var before = new PatientEncryptionService(KeyRing(RetiredSecret));
        var oldFile = await before.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        var rotated = new PatientEncryptionService(KeyRing(CurrentSecret, RetiredSecret));
        var decryptedOld = await rotated.DecryptAsync(_patientA, oldFile, CancellationToken.None);
        decryptedOld.Should().Equal(plaintext);

        var newFile = await rotated.EncryptAsync(_patientA, plaintext, CancellationToken.None);
        var onlyCurrent = new PatientEncryptionService(KeyRing(CurrentSecret));
        var decryptedNew = await onlyCurrent.DecryptAsync(_patientA, newFile, CancellationToken.None);
        decryptedNew.Should().Equal(plaintext);
    }

    [Fact]
    public async Task Rotation_DroppingRetiredSecret_MakesOldFilesUnreadable()
    {
        var plaintext = Encoding.UTF8.GetBytes("Document encrypted under retired secret");
        var oldFile = await new PatientEncryptionService(KeyRing(RetiredSecret)).EncryptAsync(_patientA, plaintext, CancellationToken.None);

        var act = () => new PatientEncryptionService(KeyRing(CurrentSecret)).DecryptAsync(_patientA, oldFile, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }
}
