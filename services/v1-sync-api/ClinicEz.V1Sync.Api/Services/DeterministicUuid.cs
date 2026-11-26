using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ClinicEz.V1Sync.Api.Services;

/// <summary>
/// RFC 4122 deterministic UUIDv5 generator, deterministic Crockford Base32 ClinicEzId generator,
/// and canonical SHA-256 row hashing + non-PHI field-level diff calculator.
/// </summary>
public static class DeterministicUuid
{
    // Fixed private namespace UUIDs for ClinicEZ v1 -> v2 migration (never change once deployed)
    public static readonly Guid ClinicNamespace = new("7f9c1b52-4e20-4c9a-9f8e-1a2b3c4d5e01");
    public static readonly Guid PatientNamespace = new("7f9c1b52-4e20-4c9a-9f8e-1a2b3c4d5e02");
    public static readonly Guid SharedClinicalNamespace = new("7f9c1b52-4e20-4c9a-9f8e-1a2b3c4d5e03");
    public static readonly Guid CustomFieldNamespace = new("7f9c1b52-4e20-4c9a-9f8e-1a2b3c4d5e04");

    // Exact patient-api Crockford Base32 alphabet (omits I, L, O, U)
    private const string ClinicEzIdAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

    public static Guid Create(Guid namespaceId, string name)
    {
        ArgumentException.ThrowIfNullOrEmpty(name);

        var nsBytes = namespaceId.ToByteArray();
        SwapByteOrder(nsBytes);

        var nameBytes = Encoding.UTF8.GetBytes(name);
        var combined = new byte[nsBytes.Length + nameBytes.Length];
        Buffer.BlockCopy(nsBytes, 0, combined, 0, nsBytes.Length);
        Buffer.BlockCopy(nameBytes, 0, combined, nsBytes.Length, nameBytes.Length);

        var hash = SHA1.HashData(combined);
        var newGuid = new byte[16];
        Array.Copy(hash, 0, newGuid, 0, 16);

        // RFC 4122 version 5 (SHA-1) & variant bits
        newGuid[6] = (byte)((newGuid[6] & 0x0F) | (5 << 4));
        newGuid[8] = (byte)((newGuid[8] & 0x3F) | 0x80);

        SwapByteOrder(newGuid);
        return new Guid(newGuid);
    }

    public static Guid ClinicPatientId(Guid v2ClinicId, int v1UserId) =>
        Create(ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_user:{v1UserId}");

    public static Guid PatientAccountId(int v1UserId) =>
        Create(PatientNamespace, $"v1_user:{v1UserId}");

    public static Guid SharedAppointmentId(Guid v2ClinicId, int v1ApptId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_appt:{v1ApptId}");

    public static Guid SharedQueueItemForAppointmentId(Guid v2ClinicId, int v1ApptId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_queue_appt:{v1ApptId}");

    public static Guid SharedQueueItemForConsultationId(Guid v2ClinicId, int v1ConsultId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_queue_consult:{v1ConsultId}");

    public static Guid SharedConsultationId(Guid v2ClinicId, int v1ConsultId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_consult:{v1ConsultId}");

    public static Guid SharedVitalsId(Guid v2ClinicId, int v1VitalId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_vital:{v1VitalId}");

    public static Guid SharedPreAssessmentVitalsId(Guid v2ClinicId, int v1PreAssessId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_preassess:{v1PreAssessId}");

    public static Guid SharedPrescriptionId(Guid v2ClinicId, int v1MedicineId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_medicine:{v1MedicineId}");

    public static Guid SharedDispensingLogId(Guid v2ClinicId, int v1DispenseId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_dispense:{v1DispenseId}");

    public static Guid SharedLabOrderId(Guid v2ClinicId, string kind, int v1RequestId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_order:{kind}:{v1RequestId}");

    public static Guid SharedLabOrderItemId(Guid v2ClinicId, string kind, int v1RequestProcId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_order_item:{kind}:{v1RequestProcId}");

    public static Guid SharedMedicalCertificateId(Guid v2ClinicId, int v1CertId) =>
        Create(SharedClinicalNamespace, $"clinic:{v2ClinicId:D}:v1_medcert:{v1CertId}");

    public static Guid ClinicAttachmentFromFileId(Guid v2ClinicId, int v1FileId) =>
        Create(ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_file:{v1FileId}");

    public static Guid ClinicAttachmentFromApptAttachmentId(Guid v2ClinicId, int v1ApptAttId) =>
        Create(ClinicNamespace, $"clinic:{v2ClinicId:D}:v1_appt_att:{v1ApptAttId}");

    public static Guid PatientFileRecordId(int v1FileId) =>
        Create(PatientNamespace, $"v1_file:{v1FileId}");

    public static Guid CustomFieldDefId(Guid v2ClinicId, string fieldKey) =>
        Create(CustomFieldNamespace, $"clinic:{v2ClinicId:D}:Patient:{fieldKey}");

    /// <summary>
    /// Generates a deterministic, collision-resistant Crockford Base32 ClinicEzId (`CE-XXXX-XXXX`)
    /// matching patient-api's exact format and alphabet.
    /// </summary>
    public static string GenerateClinicEzId(int v1UserId, int salt = 0)
    {
        var input = salt == 0
            ? $"clinicez-v1-patient:{v1UserId}"
            : $"clinicez-v1-patient:{v1UserId}:salt:{salt}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(input));

        var chars = new char[8];
        for (var i = 0; i < 8; i++)
        {
            chars[i] = ClinicEzIdAlphabet[hash[i] % ClinicEzIdAlphabet.Length];
        }

        return $"CE-{new string(chars, 0, 4)}-{new string(chars, 4, 4)}";
    }

    public static string ComputeCanonicalHash(IReadOnlyDictionary<string, string?> fields)
    {
        var sb = new StringBuilder(256);
        foreach (var kv in fields.OrderBy(k => k.Key, StringComparer.Ordinal))
        {
            sb.Append(kv.Key).Append('=').Append(kv.Value ?? "<NULL>").Append('\n');
        }

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(sb.ToString()));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    /// <summary>
    /// Returns ONLY the names of changed fields (never PHI values) for safe audit & diff persistence.
    /// </summary>
    public static List<string> ComputeChangedFieldNames(
        IReadOnlyDictionary<string, string?> previousFields,
        IReadOnlyDictionary<string, string?> nextFields)
    {
        var allKeys = new SortedSet<string>(previousFields.Keys, StringComparer.Ordinal);
        foreach (var k in nextFields.Keys) allKeys.Add(k);

        var changed = new List<string>();
        foreach (var key in allKeys)
        {
            previousFields.TryGetValue(key, out var prev);
            nextFields.TryGetValue(key, out var next);
            if (!string.Equals(prev ?? string.Empty, next ?? string.Empty, StringComparison.Ordinal))
            {
                changed.Add(key);
            }
        }

        return changed;
    }

    private static void SwapByteOrder(byte[] guid)
    {
        (guid[0], guid[3]) = (guid[3], guid[0]);
        (guid[1], guid[2]) = (guid[2], guid[1]);
        (guid[4], guid[5]) = (guid[5], guid[4]);
        (guid[6], guid[7]) = (guid[7], guid[6]);
    }
}
