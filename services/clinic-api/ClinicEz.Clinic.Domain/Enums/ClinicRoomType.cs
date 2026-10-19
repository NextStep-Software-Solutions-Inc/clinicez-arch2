namespace ClinicEz.Clinic.Domain.Enums;

/// <summary>
/// Functional classification of a physical room or station inside a clinic facility.
/// Stored as string in PostgreSQL via ConfigureConventions.
/// </summary>
public enum ClinicRoomType
{
    /// <summary>Physician examination / consultation room (e.g., Room 1, Room 2, Pedia Room).</summary>
    Consultation,

    /// <summary>Initial intake and vital signs station (e.g., Triage Station).</summary>
    Triage,

    /// <summary>Nursing procedure and treatment bay (e.g., Treatment Room, Minor OR, Nebulization Bay).</summary>
    Treatment
}
