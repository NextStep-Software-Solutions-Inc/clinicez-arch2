using System;

namespace ClinicEz.Pharmacy.Domain.Services;

public interface IUpscSecurityService
{
    /// <summary>
    /// Generates a PhilHealth-compliant Unique Prescription Security Code (UPSC)
    /// per PhilHealth Circular No. 2025-0013. The code is signed with the secret key the service was created with.
    /// </summary>
    string GenerateUpsc(
        string hciAccreditationNumber,
        string patientPin,
        string prescriptionNumber,
        string doctorPrcLicense,
        string drugCode,
        int quantity,
        DateTime issueDate);

    /// <summary>
    /// Verifies the cryptographic authenticity and integrity of a UPSC against the prescription parameters.
    /// </summary>
    bool ValidateUpsc(
        string upsc,
        string hciAccreditationNumber,
        string patientPin,
        string prescriptionNumber,
        string doctorPrcLicense,
        string drugCode,
        int quantity,
        DateTime issueDate);

    /// <summary>
    /// Verifies format and Modulus-11 check digit of a UPSC string.
    /// </summary>
    bool VerifyChecksum(string upsc);
}
