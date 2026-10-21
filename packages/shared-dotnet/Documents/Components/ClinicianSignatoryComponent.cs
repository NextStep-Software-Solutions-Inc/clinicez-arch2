using System;
using ClinicEz.Shared.Documents.Configuration;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace ClinicEz.Shared.Documents.Components;

public class ClinicianSignatoryModel
{
    public string DoctorName { get; set; } = "";
    public string TitleOrSpecialty { get; set; } = "";
    public string? PrcLicense { get; set; }
    public string? PtrNumber { get; set; }
    public string? S2License { get; set; }
    public byte[]? SignatureBytes { get; set; }
    public SignatureMode Mode { get; set; } = SignatureMode.DigitalSealOnly;
    public string? DigitalSealBadgeText { get; set; } = "Digitally Certified & Locked";
}

public class ClinicianSignatoryComponent : IComponent
{
    private readonly ClinicianSignatoryModel _model;

    public ClinicianSignatoryComponent(ClinicianSignatoryModel model)
    {
        _model = model;
    }

    public void Compose(IContainer container)
    {
        container.Width(230).Column(stamp =>
        {
            if (_model.Mode == SignatureMode.ESignatureSpecimen && _model.SignatureBytes != null && _model.SignatureBytes.Length > 0)
            {
                stamp.Item().Height(38).AlignCenter().Image(_model.SignatureBytes).FitArea();
            }
            else if (_model.Mode == SignatureMode.ESignatureSpecimen)
            {
                stamp.Item().Height(36).AlignCenter().PaddingTop(12).Text("[Clinician E-Signature Specimen Applied]")
                    .FontSize(7f).Italic().FontColor("#64748B");
            }
            else
            {
                stamp.Item().Height(_model.Mode == SignatureMode.WetSignature ? 42 : 24);
            }

            stamp.Item().LineHorizontal(1).LineColor("#111827");
            stamp.Item().PaddingTop(3).AlignCenter().Text(_model.DoctorName).FontSize(10.5f).Bold().FontColor("#111827");

            if (!string.IsNullOrWhiteSpace(_model.TitleOrSpecialty))
            {
                stamp.Item().AlignCenter().Text(_model.TitleOrSpecialty).FontSize(8f).SemiBold().FontColor("#4B5563");
            }

            if (!string.IsNullOrWhiteSpace(_model.PrcLicense))
            {
                var prcText = _model.PrcLicense.StartsWith("PRC", StringComparison.OrdinalIgnoreCase)
                    ? _model.PrcLicense
                    : $"PRC Lic. No. {_model.PrcLicense}";
                stamp.Item().AlignCenter().Text(prcText).FontSize(7.5f).FontColor("#4B5563");
            }

            if (!string.IsNullOrWhiteSpace(_model.PtrNumber))
            {
                var ptrText = _model.PtrNumber.StartsWith("PTR", StringComparison.OrdinalIgnoreCase)
                    ? _model.PtrNumber
                    : $"PTR No. {_model.PtrNumber}";
                stamp.Item().AlignCenter().Text(ptrText).FontSize(7.5f).FontColor("#4B5563");
            }

            if (!string.IsNullOrWhiteSpace(_model.S2License))
            {
                var s2Text = _model.S2License.StartsWith("PDEA", StringComparison.OrdinalIgnoreCase) || _model.S2License.StartsWith("S2", StringComparison.OrdinalIgnoreCase)
                    ? _model.S2License
                    : $"S2 No. {_model.S2License}";
                stamp.Item().AlignCenter().Text(s2Text).FontSize(7.5f).Bold().FontColor("#DC2626");
            }

            if (_model.Mode != SignatureMode.WetSignature && !string.IsNullOrWhiteSpace(_model.DigitalSealBadgeText))
            {
                var cleanBadgeText = _model.DigitalSealBadgeText.TrimStart('✓', ' ', '\t');
                stamp.Item().PaddingTop(4).AlignCenter()
                    .Border(1).BorderColor("#86EFAC").Background("#F0FDF4").PaddingVertical(2).PaddingHorizontal(6)
                    .Row(badge =>
                    {
                        badge.ConstantItem(10).Height(10).Svg(DocumentSvgIcons.CheckmarkCircle("#16A34A"));
                        badge.RelativeItem().PaddingLeft(3).Text(cleanBadgeText).FontSize(7f).Bold().FontColor("#15803D");
                    });
            }
        });
    }
}
