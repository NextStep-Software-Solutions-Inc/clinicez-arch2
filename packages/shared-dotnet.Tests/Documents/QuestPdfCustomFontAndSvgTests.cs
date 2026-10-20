using System;
using System.Text;
using ClinicEz.Shared.Documents;
using ClinicEz.Shared.Documents.Configuration;
using FluentAssertions;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using Xunit;

namespace ClinicEz.Shared.Tests.Documents;

public class QuestPdfCustomFontAndSvgTests
{
    [Fact]
    public void QuestPdfInitializer_Registers_Geist_Font_And_Renders_Svg_Without_Error()
    {
        // Check embedded resources
        var resources = typeof(QuestPdfInitializer).Assembly.GetManifestResourceNames();
        resources.Should().Contain("ClinicEz.Shared.Documents.Fonts.Geist-Regular.ttf");
        resources.Should().Contain("ClinicEz.Shared.Documents.Fonts.Geist-Medium.ttf");
        resources.Should().Contain("ClinicEz.Shared.Documents.Fonts.Geist-SemiBold.ttf");
        resources.Should().Contain("ClinicEz.Shared.Documents.Fonts.Geist-Bold.ttf");

        // Arrange
        QuestPdfInitializer.EnsureInitialized();

        var doc = Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.Letter);
                page.Margin(15, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontFamily("Geist").FontSize(10));

                page.Content().Column(col =>
                {
                    col.Item().Text("ELECTRONIC PRESCRIPTION (e-Rx)").Bold().FontSize(16);
                    col.Item().Text("Rx").FontSize(28).Bold().FontColor("#0D6963");
                    col.Item().Height(24).Svg(DocumentSvgIcons.WarningTriangle("#DC2626"));
                    col.Item().Height(24).Svg(DocumentSvgIcons.CheckmarkCircle("#16A34A"));
                    col.Item().Height(40).Svg(DocumentSvgIcons.ClinicBuilding("#0D6963"));
                    col.Item().Text("Amoxicillin + Clavulanic Acid 625mg tablet");
                });
            });
        });

        // Act
        var pdfBytes = doc.GeneratePdf();

        // Assert
        pdfBytes.Should().NotBeNull();
        pdfBytes.Length.Should().BeGreaterThan(1000);

        var pdfHeader = Encoding.ASCII.GetString(pdfBytes, 0, Math.Min(10, pdfBytes.Length));
        pdfHeader.Should().StartWith("%PDF-");

        var fullPdf = Encoding.Latin1.GetString(pdfBytes);
        fullPdf.Should().Contain("Geist");
    }
}
