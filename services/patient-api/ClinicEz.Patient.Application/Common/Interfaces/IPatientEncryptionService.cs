using System;
using System.IO;
using System.Threading;
using System.Threading.Tasks;

namespace ClinicEz.Patient.Application.Common.Interfaces;

public sealed record PatientEncryptedPayload(
    byte[] Ciphertext,
    string IvBase64,
    string TagBase64,
    string EncryptedHash,
    long EncryptedSizeBytes,
    string WrappedKeyJson,
    string EncryptionAlgorithm = "AES-256-GCM"
);

public interface IPatientEncryptionService
{
    Task<PatientEncryptedPayload> EncryptAsync(
        Stream plaintextStream,
        Guid patientId,
        CancellationToken cancellationToken = default);

    Task<PatientEncryptedPayload> EncryptAsync(
        byte[] plaintextBytes,
        Guid patientId,
        CancellationToken cancellationToken = default);

    Task<PatientEncryptedPayload> EncryptAsync(
        Guid patientId,
        byte[] plaintextBytes,
        CancellationToken cancellationToken = default);

    Task<PatientEncryptedPayload> EncryptStreamAsync(
        Guid patientId,
        Stream plaintextStream,
        CancellationToken cancellationToken = default);

    Task<byte[]> DecryptAsync(
        byte[] ciphertext,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        Guid patientId,
        CancellationToken cancellationToken = default);

    Task<byte[]> DecryptAsync(
        Guid patientId,
        byte[] ciphertext,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        CancellationToken cancellationToken = default);

    Task<byte[]> DecryptAsync(
        Guid patientId,
        PatientEncryptedPayload payload,
        CancellationToken cancellationToken = default);

    Task<MemoryStream> DecryptToStreamAsync(
        Stream encryptedStream,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        Guid patientId,
        CancellationToken cancellationToken = default);

    Task<MemoryStream> DecryptStreamAsync(
        Guid patientId,
        Stream encryptedStream,
        string ivBase64,
        string tagBase64,
        string wrappedKeyJson,
        CancellationToken cancellationToken = default);
}
