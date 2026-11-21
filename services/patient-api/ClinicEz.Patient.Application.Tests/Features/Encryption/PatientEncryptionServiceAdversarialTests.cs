using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using ClinicEz.Patient.Application.Common.Interfaces;
using ClinicEz.Patient.Infrastructure.Services.Encryption;
using FluentAssertions;
using Microsoft.Extensions.Configuration;
using Xunit;

namespace ClinicEz.Patient.Application.Tests.Features.Encryption;

public sealed class PatientEncryptionServiceAdversarialTests
{
    private const string CurrentSecret = "patient-master-secret-current-32chars-min-ok!";
    private const string PrevSecret1 = "patient-master-secret-prev1---32chars-min-ok!";
    private const string PrevSecret2 = "patient-master-secret-prev2---32chars-min-ok!";

    private readonly Guid _patientA = Guid.NewGuid();
    private readonly Guid _patientB = Guid.NewGuid();

    private static PatientEncryptionKeyRing CreateKeyRing(string current, params string[] previous)
    {
        var values = new Dictionary<string, string?>
        {
            [PatientEncryptionKeyRing.MasterSecretKey] = current
        };
        for (var i = 0; i < previous.Length; i++)
        {
            values[$"{PatientEncryptionKeyRing.PreviousMasterSecretsKey}:{i}"] = previous[i];
        }

        var config = new ConfigurationBuilder().AddInMemoryCollection(values).Build();
        return PatientEncryptionKeyRing.FromConfiguration(config);
    }

    [Fact]
    public async Task CrossPatient_DecryptionAttempt_FailsWithCryptographicException()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var secretData = Encoding.UTF8.GetBytes("Strictly Confidential Patient Record for Patient A");

        var encrypted = await service.EncryptAsync(_patientA, secretData, CancellationToken.None);

        // Patient B attempts to decrypt Patient A's encrypted record
        var act = () => service.DecryptAsync(_patientB, encrypted, CancellationToken.None);

        await act.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    [Fact]
    public async Task CrossPatient_PatientIdsDifferingBySingleBit_AreIsolated()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var secretData = Encoding.UTF8.GetBytes("Data with single-bit patient ID delta");

        var idBytes = _patientA.ToByteArray();
        idBytes[0] ^= 0x01; // flip 1 bit in GUID
        var patientSimilar = new Guid(idBytes);

        var encrypted = await service.EncryptAsync(_patientA, secretData, CancellationToken.None);

        var act = () => service.DecryptAsync(patientSimilar, encrypted, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task CrossPatient_SwappedWrappedKeyJson_FailsAuthentication()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));

        var dataA = Encoding.UTF8.GetBytes("Data for Patient A");
        var dataB = Encoding.UTF8.GetBytes("Data for Patient B");

        var encA = await service.EncryptAsync(_patientA, dataA, CancellationToken.None);
        var encB = await service.EncryptAsync(_patientB, dataB, CancellationToken.None);

        // Attacker Patient B substitutes their own WrappedKeyJson with Patient A's ciphertext
        var hybridPayload = encA with { WrappedKeyJson = encB.WrappedKeyJson };

        // Even though Patient B can unwrap their own DEK, that DEK cannot decrypt Patient A's ciphertext
        var act = () => service.DecryptAsync(_patientB, hybridPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task IndCpa_SemanticSecurity_SamePlaintextProducesDifferentCiphertexts()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Deterministic or Non-Deterministic Plaintext Test");

        var enc1 = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);
        var enc2 = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        // Every encryption must use a unique random DEK and unique random IVs
        enc1.Ciphertext.Should().NotEqual(enc2.Ciphertext);
        enc1.IvBase64.Should().NotBe(enc2.IvBase64);
        enc1.TagBase64.Should().NotBe(enc2.TagBase64);
        enc1.WrappedKeyJson.Should().NotBe(enc2.WrappedKeyJson);
        enc1.EncryptedHash.Should().NotBe(enc2.EncryptedHash);

        // Both must decrypt cleanly to original
        var dec1 = await service.DecryptAsync(_patientA, enc1, CancellationToken.None);
        var dec2 = await service.DecryptAsync(_patientA, enc2, CancellationToken.None);
        dec1.Should().Equal(plaintext);
        dec2.Should().Equal(plaintext);
    }

    [Theory]
    [InlineData(0)]   // First byte
    [InlineData(15)]  // Middle byte
    [InlineData(31)]  // Last byte
    public async Task BitFlipping_CiphertextTamperingAtBoundary_FailsAuthentication(int byteIndex)
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = new byte[32];
        RandomNumberGenerator.Fill(plaintext);

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        for (int bit = 0; bit < 8; bit++)
        {
            var corrupted = (byte[])encrypted.Ciphertext.Clone();
            corrupted[byteIndex] ^= (byte)(1 << bit);

            var tamperedPayload = encrypted with { Ciphertext = corrupted };
            var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
            await act.Should().ThrowAsync<CryptographicException>(
                $"Bit {bit} flipped at byte {byteIndex} must fail authentication.");
        }
    }

    [Theory]
    [InlineData(0)]
    [InlineData(7)]
    [InlineData(15)]
    public async Task BitFlipping_FileTagTampering_FailsAuthentication(int tagByteIndex)
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Diagnostic imaging attachment");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);
        var tagBytes = Convert.FromBase64String(encrypted.TagBase64);

        tagBytes[tagByteIndex] ^= 0x01;
        var tamperedPayload = encrypted with { TagBase64 = Convert.ToBase64String(tagBytes) };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task Tampering_FileIv_BitFlipping_FailsAuthentication()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Critical clinical notes");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);
        var ivBytes = Convert.FromBase64String(encrypted.IvBase64);

        ivBytes[0] ^= 0x80;
        var tamperedPayload = encrypted with { IvBase64 = Convert.ToBase64String(ivBytes) };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task Tampering_WrappedKey_IvFlipping_FailsDekUnwrap()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Pathology blood analysis");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        using var doc = JsonDocument.Parse(encrypted.WrappedKeyJson);
        var root = doc.RootElement;
        var wrapIvBytes = Convert.FromBase64String(root.GetProperty("Iv").GetString()!);
        wrapIvBytes[0] ^= 0x01;

        var tamperedModel = new
        {
            Alg = root.GetProperty("Alg").GetString(),
            Kid = root.GetProperty("Kid").GetString(),
            Iv = Convert.ToBase64String(wrapIvBytes),
            Tag = root.GetProperty("Tag").GetString(),
            CipherText = root.GetProperty("CipherText").GetString()
        };

        var tamperedPayload = encrypted with { WrappedKeyJson = JsonSerializer.Serialize(tamperedModel) };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    [Fact]
    public async Task Tampering_WrappedKey_TagFlipping_FailsDekUnwrap()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Genetic sequence data");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        using var doc = JsonDocument.Parse(encrypted.WrappedKeyJson);
        var root = doc.RootElement;
        var wrapTagBytes = Convert.FromBase64String(root.GetProperty("Tag").GetString()!);
        wrapTagBytes[15] ^= 0xFF;

        var tamperedModel = new
        {
            Alg = root.GetProperty("Alg").GetString(),
            Kid = root.GetProperty("Kid").GetString(),
            Iv = root.GetProperty("Iv").GetString(),
            Tag = Convert.ToBase64String(wrapTagBytes),
            CipherText = root.GetProperty("CipherText").GetString()
        };

        var tamperedPayload = encrypted with { WrappedKeyJson = JsonSerializer.Serialize(tamperedModel) };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    [Fact]
    public async Task Tampering_WrappedKey_CiphertextFlipping_FailsDekUnwrap()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Cardiology ECG telemetry");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        using var doc = JsonDocument.Parse(encrypted.WrappedKeyJson);
        var root = doc.RootElement;
        var wrapCtBytes = Convert.FromBase64String(root.GetProperty("CipherText").GetString()!);
        wrapCtBytes[0] ^= 0x40;

        var tamperedModel = new
        {
            Alg = root.GetProperty("Alg").GetString(),
            Kid = root.GetProperty("Kid").GetString(),
            Iv = root.GetProperty("Iv").GetString(),
            Tag = root.GetProperty("Tag").GetString(),
            CipherText = Convert.ToBase64String(wrapCtBytes)
        };

        var tamperedPayload = encrypted with { WrappedKeyJson = JsonSerializer.Serialize(tamperedModel) };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    [Fact]
    public async Task Truncated_Ciphertext_ThrowsCryptographicException()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Non-trivial length ciphertext to be truncated");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        // Truncate ciphertext by 1 byte
        var truncated = encrypted.Ciphertext.Take(encrypted.Ciphertext.Length - 1).ToArray();
        var tamperedPayload = encrypted with { Ciphertext = truncated };

        var act = () => service.DecryptAsync(_patientA, tamperedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>();
    }

    [Fact]
    public async Task KeyRotation_MultiGenerationKeyRing_ResolvesCorrectSecret()
    {
        // 3 generations of keys:
        // Gen 1: PrevSecret2
        // Gen 2: PrevSecret1
        // Gen 3: CurrentSecret
        var gen1Ring = CreateKeyRing(PrevSecret2);
        var gen2Ring = CreateKeyRing(PrevSecret1, PrevSecret2);
        var gen3Ring = CreateKeyRing(CurrentSecret, PrevSecret1, PrevSecret2);

        var data1 = Encoding.UTF8.GetBytes("Encrypted under Gen 1 secret");
        var data2 = Encoding.UTF8.GetBytes("Encrypted under Gen 2 secret");
        var data3 = Encoding.UTF8.GetBytes("Encrypted under Gen 3 secret");

        var s1 = new PatientEncryptionService(gen1Ring);
        var s2 = new PatientEncryptionService(gen2Ring);
        var s3 = new PatientEncryptionService(gen3Ring);

        var enc1 = await s1.EncryptAsync(_patientA, data1, CancellationToken.None);
        var enc2 = await s2.EncryptAsync(_patientA, data2, CancellationToken.None);
        var enc3 = await s3.EncryptAsync(_patientA, data3, CancellationToken.None);

        // Service with full ring (Gen 3) can decrypt all generations seamlessly
        (await s3.DecryptAsync(_patientA, enc1, CancellationToken.None)).Should().Equal(data1);
        (await s3.DecryptAsync(_patientA, enc2, CancellationToken.None)).Should().Equal(data2);
        (await s3.DecryptAsync(_patientA, enc3, CancellationToken.None)).Should().Equal(data3);

        // Ring without Gen 1 secret cannot decrypt Gen 1 files
        var ringWithoutGen1 = CreateKeyRing(CurrentSecret, PrevSecret1);
        var sWithoutGen1 = new PatientEncryptionService(ringWithoutGen1);
        var act1 = () => sWithoutGen1.DecryptAsync(_patientA, enc1, CancellationToken.None);
        await act1.Should().ThrowAsync<CryptographicException>();

        // But can still decrypt Gen 2 and Gen 3
        (await sWithoutGen1.DecryptAsync(_patientA, enc2, CancellationToken.None)).Should().Equal(data2);
        (await sWithoutGen1.DecryptAsync(_patientA, enc3, CancellationToken.None)).Should().Equal(data3);
    }

    [Fact]
    public async Task KeyRotation_LegacyFileWithoutKid_TriesCandidatesAndSucceeds()
    {
        var service1 = new PatientEncryptionService(CreateKeyRing(PrevSecret1));
        var plaintext = Encoding.UTF8.GetBytes("Legacy format without Kid property");

        var encrypted = await service1.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        // Strip the Kid property to simulate legacy format
        using var doc = JsonDocument.Parse(encrypted.WrappedKeyJson);
        var root = doc.RootElement;
        var legacyModel = new
        {
            Alg = root.GetProperty("Alg").GetString(),
            Kid = (string?)null,
            Iv = root.GetProperty("Iv").GetString(),
            Tag = root.GetProperty("Tag").GetString(),
            CipherText = root.GetProperty("CipherText").GetString()
        };

        var legacyPayload = encrypted with { WrappedKeyJson = JsonSerializer.Serialize(legacyModel) };

        // Rotated service (Current + Prev1) should fall back to candidates and succeed
        var rotatedService = new PatientEncryptionService(CreateKeyRing(CurrentSecret, PrevSecret1));
        var decrypted = await rotatedService.DecryptAsync(_patientA, legacyPayload, CancellationToken.None);

        decrypted.Should().Equal(plaintext);
    }

    [Fact]
    public async Task ForgedUnknownKid_ThrowsCryptographicException()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var plaintext = Encoding.UTF8.GetBytes("Some payload");

        var encrypted = await service.EncryptAsync(_patientA, plaintext, CancellationToken.None);

        using var doc = JsonDocument.Parse(encrypted.WrappedKeyJson);
        var root = doc.RootElement;
        var forgedModel = new
        {
            Alg = root.GetProperty("Alg").GetString(),
            Kid = "unknown-nonexistent-key-id",
            Iv = root.GetProperty("Iv").GetString(),
            Tag = root.GetProperty("Tag").GetString(),
            CipherText = root.GetProperty("CipherText").GetString()
        };

        var forgedPayload = encrypted with { WrappedKeyJson = JsonSerializer.Serialize(forgedModel) };

        var act = () => service.DecryptAsync(_patientA, forgedPayload, CancellationToken.None);
        await act.Should().ThrowAsync<CryptographicException>()
            .WithMessage("*Failed to decrypt DEK*");
    }

    [Fact]
    public async Task EmptyPayload_EncryptAndDecrypt_RoundTripsAccurately()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var empty = Array.Empty<byte>();

        var encrypted = await service.EncryptAsync(_patientA, empty, CancellationToken.None);

        encrypted.Ciphertext.Should().BeEmpty();
        encrypted.EncryptedSizeBytes.Should().Be(0);
        encrypted.TagBase64.Should().NotBeNullOrWhiteSpace();

        var decrypted = await service.DecryptAsync(_patientA, encrypted, CancellationToken.None);
        decrypted.Should().BeEmpty();
    }

    [Fact]
    public async Task LargePayload_10MB_EncryptAndDecryptStream_IntegrityVerified()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));

        var largeBuffer = new byte[10 * 1024 * 1024]; // 10 MB
        RandomNumberGenerator.Fill(largeBuffer);
        var expectedHash = Convert.ToHexString(SHA256.HashData(largeBuffer));

        using var inStream = new MemoryStream(largeBuffer);
        var encrypted = await service.EncryptStreamAsync(_patientA, inStream, CancellationToken.None);

        using var cipherStream = new MemoryStream(encrypted.Ciphertext);
        using var outStream = await service.DecryptStreamAsync(
            _patientA, cipherStream, encrypted.IvBase64, encrypted.TagBase64, encrypted.WrappedKeyJson, CancellationToken.None);

        var decryptedBytes = outStream.ToArray();
        var actualHash = Convert.ToHexString(SHA256.HashData(decryptedBytes));

        actualHash.Should().Be(expectedHash);
    }

    [Fact]
    public async Task ConcurrentAccess_MultiThreadedStress_MaintainsIsolationAndCorrectness()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret, PrevSecret1));
        var patients = Enumerable.Range(0, 10).Select(_ => Guid.NewGuid()).ToList();

        var tasks = patients.Select(async pId =>
        {
            for (int i = 0; i < 10; i++)
            {
                var original = Encoding.UTF8.GetBytes($"Concurrent message {i} for patient {pId}");
                var enc = await service.EncryptAsync(pId, original, CancellationToken.None);
                var dec = await service.DecryptAsync(pId, enc, CancellationToken.None);
                dec.Should().Equal(original);

                // Cross-patient attempt within loop
                var otherPatient = patients[(patients.IndexOf(pId) + 1) % patients.Count];
                var act = () => service.DecryptAsync(otherPatient, enc, CancellationToken.None);
                await act.Should().ThrowAsync<CryptographicException>();
            }
        });

        await Task.WhenAll(tasks);
    }

    [Fact]
    public async Task InvalidInputs_EmptyGuid_ThrowsArgumentException()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var data = Encoding.UTF8.GetBytes("Test");

        var act1 = () => service.EncryptAsync(Guid.Empty, data, CancellationToken.None);
        await act1.Should().ThrowAsync<ArgumentException>()
            .WithMessage("*Patient ID cannot be empty*");

        var enc = await service.EncryptAsync(_patientA, data, CancellationToken.None);

        var act2 = () => service.DecryptAsync(Guid.Empty, enc, CancellationToken.None);
        await act2.Should().ThrowAsync<ArgumentException>()
            .WithMessage("*Patient ID cannot be empty*");
    }

    [Theory]
    [InlineData(0)]
    [InlineData(8)]
    [InlineData(11)]
    [InlineData(13)]
    [InlineData(16)]
    public async Task Tampering_InvalidFileIvLength_ThrowsArgumentException(int byteLength)
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var data = Encoding.UTF8.GetBytes("Test invalid IV length");

        var enc = await service.EncryptAsync(_patientA, data, CancellationToken.None);
        var invalidIv = Convert.ToBase64String(new byte[byteLength]);
        var tampered = enc with { IvBase64 = invalidIv };

        var act = () => service.DecryptAsync(_patientA, tampered, CancellationToken.None);
        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Theory]
    [InlineData(0)]
    [InlineData(8)]
    [InlineData(12)]
    [InlineData(15)]
    [InlineData(17)]
    public async Task Tampering_InvalidFileTagLength_ThrowsArgumentException(int byteLength)
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var data = Encoding.UTF8.GetBytes("Test invalid tag length");

        var enc = await service.EncryptAsync(_patientA, data, CancellationToken.None);
        var invalidTag = Convert.ToBase64String(new byte[byteLength]);
        var tampered = enc with { TagBase64 = invalidTag };

        var act = () => service.DecryptAsync(_patientA, tampered, CancellationToken.None);
        await act.Should().ThrowAsync<ArgumentException>();
    }

    [Fact]
    public async Task Tampering_InvalidBase64Strings_ThrowsFormatException()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var data = Encoding.UTF8.GetBytes("Test invalid base64");

        var enc = await service.EncryptAsync(_patientA, data, CancellationToken.None);

        var corruptedIv = enc with { IvBase64 = "not-valid-base64!@#$" };
        var act1 = () => service.DecryptAsync(_patientA, corruptedIv, CancellationToken.None);
        await act1.Should().ThrowAsync<FormatException>();

        var corruptedTag = enc with { TagBase64 = "not-valid-base64!@#$" };
        var act2 = () => service.DecryptAsync(_patientA, corruptedTag, CancellationToken.None);
        await act2.Should().ThrowAsync<FormatException>();
    }

    [Fact]
    public async Task Tampering_MalformedWrappedKeyJson_ThrowsJsonException()
    {
        var service = new PatientEncryptionService(CreateKeyRing(CurrentSecret));
        var data = Encoding.UTF8.GetBytes("Test malformed json");

        var enc = await service.EncryptAsync(_patientA, data, CancellationToken.None);
        var corruptedJson = enc with { WrappedKeyJson = "{ malformed json here..." };

        var act = () => service.DecryptAsync(_patientA, corruptedJson, CancellationToken.None);
        await act.Should().ThrowAsync<JsonException>();
    }

    [Fact]
    public void Hkdf_UniquePatientPmk_NoBitLeakageOrCollisions()
    {
        var masterSecret = Encoding.UTF8.GetBytes(CurrentSecret);
        var pmks = new HashSet<string>();

        // Generate 100 consecutive patient GUIDs and verify 100 distinct 256-bit keys
        for (int i = 0; i < 100; i++)
        {
            var pId = Guid.NewGuid();
            var salt = Encoding.UTF8.GetBytes(pId.ToString("D").ToLowerInvariant());
            var info = Encoding.UTF8.GetBytes("clinicez-pmk-v1");
            var key = HKDF.DeriveKey(HashAlgorithmName.SHA256, masterSecret, 32, salt, info);

            var keyHex = Convert.ToHexString(key);
            pmks.Add(keyHex).Should().BeTrue("Each patient PMK must be completely unique");
        }
    }
}

