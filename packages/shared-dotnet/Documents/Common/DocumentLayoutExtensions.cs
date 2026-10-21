using System;
using ClinicEz.Shared.Documents.Components;
using ClinicEz.Shared.Documents.Configuration;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace ClinicEz.Shared.Documents.Common;

/// <summary>
/// Fluent extension methods for standardizing document layouts across all ClinicEZ PDF generators.
/// Enforces bottom positioning, page-break avoidance, and clearance above the footer line.
/// </summary>
public static class DocumentLayoutExtensions
{
    /// <summary>
    /// Anchors an official clinician signature stamp at the bottom of the page,
    /// aligned to the right, with guaranteed spacing above the footer divider line.
    /// Uses ShowEntire() to prevent splitting across page boundaries.
    /// </summary>
    public static void SignatoryClinician(
        this ColumnDescriptor col,
        ClinicianSignatoryModel model,
        float? bottomPadding = null)
    {
        col.Item()
            .ShowEntire()
            .ExtendVertical()
            .AlignBottom()
            .PaddingTop(DocumentSpacingConstants.SignatoryTopPadding)
            .PaddingBottom(bottomPadding ?? DocumentSpacingConstants.SignatoryBottomPadding)
            .AlignRight()
            .Component(new ClinicianSignatoryComponent(model));
    }

    /// <summary>
    /// Anchors a dual-signatory block (e.g. Prepared By / Approved By, or Clinician + Cashier)
    /// at the bottom of the page across the full width, with guaranteed spacing above the footer.
    /// Uses ShowEntire() to prevent splitting across page boundaries.
    /// </summary>
    public static void SignatoryDual(
        this ColumnDescriptor col,
        DualSignatoryModel model,
        float? bottomPadding = null)
    {
        col.Item()
            .ShowEntire()
            .ExtendVertical()
            .AlignBottom()
            .PaddingTop(DocumentSpacingConstants.SignatoryTopPadding)
            .PaddingBottom(bottomPadding ?? DocumentSpacingConstants.SignatoryBottomPadding)
            .Component(new DualSignatoryComponent(model));
    }

    /// <summary>
    /// Anchors any custom signatory or sign-off container at the bottom of the page above the footer,
    /// enforcing ShowEntire(), ExtendVertical(), AlignBottom(), and standard bottom padding.
    /// </summary>
    public static void SignatoryBlock(
        this ColumnDescriptor col,
        Action<IContainer> composeSignatory,
        float? bottomPadding = null)
    {
        col.Item()
            .ShowEntire()
            .ExtendVertical()
            .AlignBottom()
            .PaddingTop(DocumentSpacingConstants.SignatoryTopPadding)
            .PaddingBottom(bottomPadding ?? DocumentSpacingConstants.SignatoryBottomPadding)
            .Element(composeSignatory);
    }
}
