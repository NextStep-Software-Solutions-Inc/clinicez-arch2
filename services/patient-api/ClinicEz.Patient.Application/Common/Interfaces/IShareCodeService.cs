namespace ClinicEz.Patient.Application.Common.Interfaces;

/// <summary>Creates, normalises and hashes the short one-time codes a patient reads out to share without a QR.</summary>
public interface IShareCodeService
{
    /// <summary>A fresh random code of eight characters from an alphabet with no look-alikes, e.g. <c>K7QMX4NP</c>.</summary>
    string Generate();

    /// <summary>The comparable form of what a person typed (case, spaces and hyphens ignored), or null when it cannot be a code.</summary>
    string? Normalize(string? typed);

    /// <summary>Keyed hash of a normalised code, bound to the patient so equal codes of two patients differ.</summary>
    string Hash(Guid patientId, string normalizedCode);

    /// <summary>The code as shown to people, grouped as <c>K7QM-X4NP</c>.</summary>
    string Format(string normalizedCode);
}
