using System;

namespace ClinicEz.Pharmacy.Domain.Services;

public interface IUpscSecurityService
{
    /// <summary>
    /// Generates a PhilHealth-compliant Unique Prescription Security Code (UPSC)
    /// per PhilHealth Circular No. 2025-0013.
    /// </summary>
    string GenerateUpsc(
        string hciAccreditationNumber,
        string patientPin,
        string prescriptionNumber,
        string doctorPrcLicense,
        string drugCode,
        int quantity,
        DateTime issueDate,
        string secretKey = "ClinicEzPhilHealthGamotSecretKey");

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
        DateTime issueDate,
        string secretKey = "ClinicEzPhilHealthGamotSecretKey");

    /// <summary>
    /// Verifies format and Modulus-11 check digit of a UPSC string.
    /// </summary>
    bool VerifyChecksum(string upsc);
}
