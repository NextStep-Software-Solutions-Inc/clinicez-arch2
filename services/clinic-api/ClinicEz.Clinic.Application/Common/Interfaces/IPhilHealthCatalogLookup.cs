namespace ClinicEz.Clinic.Application.Common.Interfaces;

/// <summary>One entry of the PhilHealth Catalog as seen by the application layer.</summary>
public sealed record PhilHealthCatalogRecord(
    string Library,
    string Code,
    string Description,
    bool IsActive,
    IReadOnlyDictionary<string, string>? Attributes);

/// <summary>
/// Synchronous, in-memory view of the PhilHealth Catalog (the official <c>lib_*</c> libraries) used when building
/// PhilHealth documents. Codes must come from here, never from literals in source.
/// </summary>
public interface IPhilHealthCatalogLookup
{
    /// <summary>The entry with this code (first term for libraries that list several per code), or <c>null</c>.</summary>
    PhilHealthCatalogRecord? Find(string library, string code);

    /// <summary>The active entry whose description equals <paramref name="description"/> (case-insensitive), or <c>null</c>.</summary>
    PhilHealthCatalogRecord? FindByDescription(string library, string description);

    /// <summary>Active entries whose description contains every token (case-insensitive), best (shortest) match first.</summary>
    IReadOnlyList<PhilHealthCatalogRecord> Search(string library, IReadOnlyCollection<string> tokens, int limit = 20);
}
