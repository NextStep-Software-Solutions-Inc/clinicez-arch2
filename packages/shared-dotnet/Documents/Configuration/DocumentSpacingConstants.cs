namespace ClinicEz.Shared.Documents.Configuration;

/// <summary>
/// Centralized spacing design tokens for QuestPDF document layout.
/// Standardizes margins and padding between content, signatory blocks, and footers.
/// </summary>
public static class DocumentSpacingConstants
{
    /// <summary>
    /// Spacing above the horizontal rule in the document footer (in points).
    /// Provides defensive clearance between page content and the footer border line.
    /// </summary>
    public const float FooterTopPadding = 8f;

    /// <summary>
    /// Spacing below the signatory block before reaching the content-footer boundary (in points).
    /// Combined with FooterTopPadding, guarantees 20pt (~7mm) of breathing room.
    /// </summary>
    public const float SignatoryBottomPadding = 12f;

    /// <summary>
    /// Spacing above the signatory block from the preceding document content/tables (in points).
    /// </summary>
    public const float SignatoryTopPadding = 14f;
}
