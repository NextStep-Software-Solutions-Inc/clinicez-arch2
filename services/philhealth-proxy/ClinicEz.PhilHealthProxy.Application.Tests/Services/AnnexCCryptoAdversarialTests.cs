using System;
using System.IO;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClinicEz.PhilHealthProxy.Domain.Models;
using ClinicEz.PhilHealthProxy.Infrastructure.Services;
using FluentAssertions;
using Xunit;

namespace ClinicEz.PhilHealthProxy.Application.Tests.Services;

public sealed class AnnexCCryptoAdversarialTests
{
    private readonly PhilHealthPayloadEncryptor _sut = new();

    #region 1. Official Test Vector Challenge

    private const string OfficialCipherKey = "PCAPI-TEST-CIPHER-KEY-0001";
    private const string OfficialIvBase64 = "AAECAwQFBgcICQoLDA0ODw==";
    private const string OfficialPlainJson = "{\"patient_pin\":\"123456789012\",\"selection_date\":\"10/24/2026\"}";
    private const string ExpectedDocBase64 = "8qipXLTaqv/erRM3acals23bNbNzdX5NeVpUWWYljJdsCUm3x1GfNvTheN/rR5AMpVVSYQmPVNLPcTp78aV84Q==";
    private const string ExpectedHash = "c74558f2df0c6d3e26b22853bc46388d712689001f03d6f003b8f73d9f4a17f0";

    [Fact]
    public void OfficialTestVector_HashCalculation_MatchesAnnexC()
    {
        // Step 1: Lowercase hexadecimal SHA-256 of plain JSON before padding
        byte[] plainBytes = Encoding.UTF8.GetBytes(OfficialPlainJson);
        string computedHash = Convert.ToHexString(SHA256.HashData(plainBytes)).ToLowerInvariant();

        computedHash.Should().Be(ExpectedHash);
    }

    [Fact]
    public void OfficialTestVector_KeyDerivationAndIv_MatchesAnnexC()
    {
        // Derived AES key = SHA-256 of cipher key (32 bytes)
        byte[] derivedKey = SHA256.HashData(Encoding.UTF8.GetBytes(OfficialCipherKey));
        derivedKey.Length.Should().Be(32);

        // IV is exactly 16 bytes: 00 01 02 03 04 05 06 07 08 09 0A 0B 0C 0D 0E 0F
        byte[] iv = Convert.FromBase64String(OfficialIvBase64);
        iv.Length.Should().Be(16);
        iv.Should().Equal(Enumerable.Range(0, 16).Select(i => (byte)i));
    }

    [Fact]
    public void OfficialTestVector_Decryption_RestoresExactPlainJsonAndPassesHash()
    {
        // Arrange
        var envelope = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = ExpectedHash,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = OfficialIvBase64,
            Doc = ExpectedDocBase64
        };

        // Act
        string decryptedJson = _sut.DecryptJson(envelope, OfficialCipherKey);

        // Assert
        decryptedJson.Should().Be(OfficialPlainJson);
    }

    [Fact]
    public void OfficialTestVector_EncryptionWithFixedIv_ProducesExactDocBase64()
    {
        // The Annex C encryption procedure:
        // 1. Plain UTF-8 bytes
        byte[] plainBytes = Encoding.UTF8.GetBytes(OfficialPlainJson);
        plainBytes.Length.Should().Be(60);

        // 2. Derive 32-byte key via SHA-256
        byte[] key = SHA256.HashData(Encoding.UTF8.GetBytes(OfficialCipherKey));

        // 3. IV: 16 bytes
        byte[] iv = Convert.FromBase64String(OfficialIvBase64);

        // 4. Pad with 0x00 null bytes to multiple of 16 (60 % 16 = 12 -> 4 null bytes)
        int remainder = plainBytes.Length % 16;
        int padLength = remainder == 0 ? 0 : 16 - remainder;
        padLength.Should().Be(4);

        byte[] paddedBytes = new byte[plainBytes.Length + padLength];
        Buffer.BlockCopy(plainBytes, 0, paddedBytes, 0, plainBytes.Length);
        paddedBytes.Length.Should().Be(64);

        // 5. AES-256-CBC with PaddingMode.None
        byte[] cipherTextBytes;
        using (var aes = Aes.Create())
        {
            aes.KeySize = 256;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.None;
            aes.Key = key;
            aes.IV = iv;

            using var encryptor = aes.CreateEncryptor();
            cipherTextBytes = encryptor.TransformFinalBlock(paddedBytes, 0, paddedBytes.Length);
        }

        string actualDocBase64 = Convert.ToBase64String(cipherTextBytes);

        // Assert that the Annex C procedure matches the official test vector EXACTLY
        actualDocBase64.Should().Be(ExpectedDocBase64);
    }

    #endregion

    #region 2. Exact Block Boundary Challenge

    [Theory]
    [InlineData(16)]
    [InlineData(32)]
    [InlineData(64)]
    [InlineData(128)]
    public void ExactBlockBoundary_ExactMultiplesOf16_AddsZeroExtraPaddingBytes(int length)
    {
        // Construct string with exact length (all ASCII characters, so 1 char = 1 byte)
        string plainText = new('X', length);
        byte[] rawBytes = Encoding.UTF8.GetBytes(plainText);
        rawBytes.Length.Should().Be(length);

        // Act: Encrypt
        var envelope = _sut.Encrypt(plainText, OfficialCipherKey);
        byte[] cipherBytes = Convert.FromBase64String(envelope.Doc);

        // Assert: 0 extra padding bytes added! Ciphertext length MUST equal plaintext length!
        cipherBytes.Length.Should().Be(length, $"Payload of length {length} is an exact multiple of 16 and must not have padding blocks added");

        // Decrypt and verify exact restoration
        string decrypted = _sut.Decrypt(envelope, OfficialCipherKey);
        decrypted.Should().Be(plainText);
        decrypted.Length.Should().Be(length);
    }

    [Theory]
    [InlineData(15, 16)]
    [InlineData(17, 32)]
    [InlineData(31, 32)]
    [InlineData(33, 48)]
    [InlineData(63, 64)]
    [InlineData(65, 80)]
    [InlineData(127, 128)]
    [InlineData(129, 144)]
    public void ExactBlockBoundary_NonMultiplesOf16_PadsToNextMultiple(int plainLength, int expectedCipherLength)
    {
        string plainText = new('Y', plainLength);
        byte[] rawBytes = Encoding.UTF8.GetBytes(plainText);
        rawBytes.Length.Should().Be(plainLength);

        var envelope = _sut.Encrypt(plainText, OfficialCipherKey);
        byte[] cipherBytes = Convert.FromBase64String(envelope.Doc);

        cipherBytes.Length.Should().Be(expectedCipherLength);

        string decrypted = _sut.Decrypt(envelope, OfficialCipherKey);
        decrypted.Should().Be(plainText);
    }

    #endregion

    #region 3. Tamper & Corruption Challenge

    [Fact]
    public void TamperChallenge_MutateCiphertextBy1Bit_ThrowsCryptographicException()
    {
        // Arrange: Start with official valid envelope
        byte[] cipherBytes = Convert.FromBase64String(ExpectedDocBase64);

        // Flip exactly 1 bit in byte index 5
        cipherBytes[5] ^= 0x01;
        string corruptedDoc = Convert.ToBase64String(cipherBytes);

        var tamperedEnvelope = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = ExpectedHash,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = OfficialIvBase64,
            Doc = corruptedDoc
        };

        // Act & Assert: Must throw CryptographicException due to integrity check failure
        var act = () => _sut.DecryptJson(tamperedEnvelope, OfficialCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*integrity check failed*");
    }

    [Fact]
    public void TamperChallenge_AlterIv_ThrowsCryptographicException()
    {
        // Arrange: Start with official valid envelope
        byte[] ivBytes = Convert.FromBase64String(OfficialIvBase64);

        // Flip 1 bit in IV
        ivBytes[0] ^= 0x80;
        string corruptedIv = Convert.ToBase64String(ivBytes);

        var tamperedEnvelope = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = ExpectedHash,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = corruptedIv,
            Doc = ExpectedDocBase64
        };

        // Act & Assert: Altered IV changes decrypted first block, causing hash check to fail
        var act = () => _sut.DecryptJson(tamperedEnvelope, OfficialCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*integrity check failed*");
    }

    [Fact]
    public void TamperChallenge_AlterHash_ThrowsCryptographicException()
    {
        // Mutate 1 character in the expected hash
        char originalChar = ExpectedHash[0];
        char modifiedChar = originalChar == 'a' ? 'b' : 'a';
        string tamperedHash = modifiedChar + ExpectedHash[1..];

        var tamperedEnvelope = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = tamperedHash,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = OfficialIvBase64,
            Doc = ExpectedDocBase64
        };

        // Act & Assert
        var act = () => _sut.DecryptJson(tamperedEnvelope, OfficialCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*integrity check failed*");
    }

    [Fact]
    public void TamperChallenge_SupplyWrongCipherKey_ThrowsCryptographicException()
    {
        var envelope = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = ExpectedHash,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = OfficialIvBase64,
            Doc = ExpectedDocBase64
        };

        const string wrongKey = "PCAPI-TEST-CIPHER-KEY-9999";

        // Act & Assert
        var act = () => _sut.DecryptJson(envelope, wrongKey);
        act.Should().Throw<CryptographicException>();
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void TamperChallenge_MissingOrWhitespaceHash_AdversarialBehaviorCheck(string? emptyHash)
    {
        // Check what happens if an adversary strips the Hash property entirely
        byte[] cipherBytes = Convert.FromBase64String(ExpectedDocBase64);
        cipherBytes[10] ^= 0x02; // tamper ciphertext
        string tamperedDoc = Convert.ToBase64String(cipherBytes);

        var strippedHashEnvelope = new PhilHealthEncryptedPayload
        {
            DocMimeType = "application/json",
            Hash = emptyHash!,
            Key1 = string.Empty,
            Key2 = string.Empty,
            Iv = OfficialIvBase64,
            Doc = tamperedDoc
        };

        // If Hash is empty/whitespace, DecryptBytes skips the hash check!
        // DecryptJson succeeds in returning corrupted garbage without throwing!
        // This confirms that PhilHealthPayloadEncryptor has an integrity bypass vulnerability
        // when envelope.Hash is omitted or whitespace.
        Action act = () => _sut.DecryptJson(strippedHashEnvelope, OfficialCipherKey);
        act.Should().NotThrow();

        string corruptedResult = _sut.DecryptJson(strippedHashEnvelope, OfficialCipherKey);
        corruptedResult.Should().NotBeNullOrWhiteSpace();
        corruptedResult.Should().NotBe(OfficialPlainJson);
    }

    #endregion

    #region 4. PDF Availment Slip Challenge

    [Fact]
    public void PdfAvailmentSlip_ValidPdf_RoundtripsAndPassesBinarySha256()
    {
        // A minimal valid PDF structure with %%EOF trailer
        string pdfContent = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
                            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
                            "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
                            "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \n" +
                            "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n150\n%%EOF";

        byte[] originalPdfBytes = Encoding.ASCII.GetBytes(pdfContent);
        string originalSha256 = Convert.ToHexString(SHA256.HashData(originalPdfBytes)).ToLowerInvariant();

        // Encrypt as application/pdf
        var envelope = _sut.EncryptBytes(originalPdfBytes, "application/pdf", OfficialCipherKey);
        envelope.Hash.Should().Be(originalSha256);
        envelope.DocMimeType.Should().Be("application/pdf");

        // Decrypt as PDF
        byte[] decryptedPdf = _sut.DecryptPdf(envelope, OfficialCipherKey);

        // Assert exact byte identity and SHA-256 integrity
        decryptedPdf.Should().Equal(originalPdfBytes);
        Convert.ToHexString(SHA256.HashData(decryptedPdf)).ToLowerInvariant().Should().Be(originalSha256);
    }

    [Fact]
    public void PdfAvailmentSlip_MissingEofMarker_ThrowsCryptographicException()
    {
        // PDF missing %%EOF
        string malformedPdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< >>\nstartxref\n100\n";
        byte[] malformedBytes = Encoding.ASCII.GetBytes(malformedPdf);

        var envelope = _sut.EncryptBytes(malformedBytes, "application/pdf", OfficialCipherKey);

        var act = () => _sut.DecryptPdf(envelope, OfficialCipherKey);
        act.Should().Throw<CryptographicException>()
            .WithMessage("*mandatory %%EOF marker*");
    }

    [Theory]
    [InlineData("%%EOF")]
    [InlineData("%%EOF\n")]
    [InlineData("%%EOF\r\n")]
    [InlineData("%%EOF\n\n")]
    public void PdfAvailmentSlip_TrailerVariations_RoundtripsAndPassesBinarySha256(string eofTrailer)
    {
        string pdfContent = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n" +
                            "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n" +
                            "3 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj\n" +
                            "xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000056 00000 n \n0000000111 00000 n \n" +
                            "trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n150\n" + eofTrailer;

        byte[] originalPdfBytes = Encoding.ASCII.GetBytes(pdfContent);
        string originalSha256 = Convert.ToHexString(SHA256.HashData(originalPdfBytes)).ToLowerInvariant();

        // Encrypt as application/pdf
        var envelope = _sut.EncryptBytes(originalPdfBytes, "application/pdf", OfficialCipherKey);
        envelope.Hash.Should().Be(originalSha256);
        envelope.DocMimeType.Should().Be("application/pdf");

        // Decrypt as PDF
        byte[] decryptedPdf = _sut.DecryptPdf(envelope, OfficialCipherKey);

        // Assert exact byte identity and SHA-256 integrity
        decryptedPdf.Should().Equal(originalPdfBytes);
        Convert.ToHexString(SHA256.HashData(decryptedPdf)).ToLowerInvariant().Should().Be(originalSha256);
    }

    [Fact]
    public void PdfAvailmentSlip_Exact16ByteMultiplePdf_RoundtripsWithZeroPadding()
    {
        // Construct a valid PDF that is an exact multiple of 16 bytes
        string basePdf = "%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\nstartxref\n40\n%%EOF";
        int remainder = Encoding.ASCII.GetByteCount(basePdf) % 16;
        int needed = remainder == 0 ? 0 : 16 - remainder;
        string paddedPdf = basePdf + new string('\n', needed);

        byte[] originalBytes = Encoding.ASCII.GetBytes(paddedPdf);
        (originalBytes.Length % 16).Should().Be(0);

        var envelope = _sut.EncryptBytes(originalBytes, "application/pdf", OfficialCipherKey);
        byte[] cipherBytes = Convert.FromBase64String(envelope.Doc);
        cipherBytes.Length.Should().Be(originalBytes.Length);

        byte[] decrypted = _sut.DecryptPdf(envelope, OfficialCipherKey);
        decrypted.Should().Equal(originalBytes);
    }

    [Fact]
    public void PdfAvailmentSlip_LargeRealisticAvailmentSlipPdf_PassesIntegrity()
    {
        // Simulate a realistic 50KB PDF Availment Slip
        using var ms = new MemoryStream();
        using var writer = new StreamWriter(ms, Encoding.ASCII);
        writer.WriteLine("%PDF-1.5");
        writer.WriteLine("%PhilHealth Availment Slip Test Synthetic Data");
        for (int i = 0; i < 500; i++)
        {
            writer.WriteLine($"{i} 0 obj << /Length {i * 10} >> stream");
            writer.WriteLine(new string('Z', 80));
            writer.WriteLine("endstream endobj");
        }
        writer.WriteLine("xref\n0 501\ntrailer << /Size 501 >>\nstartxref\n45000\n%%EOF");
        writer.Flush();

        byte[] pdfBytes = ms.ToArray();
        pdfBytes.Length.Should().BeGreaterThan(40000);

        string originalHash = Convert.ToHexString(SHA256.HashData(pdfBytes)).ToLowerInvariant();

        var envelope = _sut.EncryptBytes(pdfBytes, "application/pdf", OfficialCipherKey);
        envelope.Hash.Should().Be(originalHash);

        byte[] decrypted = _sut.DecryptPdf(envelope, OfficialCipherKey);
        decrypted.Should().Equal(pdfBytes);
        Convert.ToHexString(SHA256.HashData(decrypted)).ToLowerInvariant().Should().Be(originalHash);
    }

    #endregion
}
