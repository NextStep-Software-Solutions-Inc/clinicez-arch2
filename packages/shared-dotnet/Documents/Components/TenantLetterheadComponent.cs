using System;
using System.Linq;
using ClinicEz.Shared.Documents.Configuration;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace ClinicEz.Shared.Documents.Components;

public class TenantLetterheadComponent : IComponent
{
    private readonly TenantPrintoutConfig _config;

    public TenantLetterheadComponent(TenantPrintoutConfig config)
    {
        _config = config;
    }

    public void Compose(IContainer container)
    {
        var primaryColor = _config.GetSafePrimaryColorHex();

        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                if (_config.PrimaryLogoBytes != null && _config.PrimaryLogoBytes.Length > 0)
                {
                    row.ConstantItem(52).Height(50).Image(_config.PrimaryLogoBytes).FitArea();
                }
                else
                {
                    // Clean institutional clinic placeholder icon matching Studio Preview
                    row.ConstantItem(50).Height(50)
                        .Border(1.5f).BorderColor(primaryColor).Background("#F0FDFA").Padding(8)
                        .Svg(DocumentSvgIcons.ClinicBuilding(primaryColor));
                }

                row.RelativeItem().PaddingLeft(10).Column(c =>
                {
                    c.Item().Text(_config.FacilityName)
                        .FontSize(15).Bold().FontColor(primaryColor);

                    if (!string.IsNullOrWhiteSpace(_config.FacilitySubHeader))
                    {
                        c.Item().Text(_config.FacilitySubHeader)
                            .FontSize(9).SemiBold().FontColor("#4B5563");
                    }

                    if (!string.IsNullOrWhiteSpace(_config.PhysicalAddress))
                    {
                        c.Item().Text(_config.PhysicalAddress)
                            .FontSize(8).FontColor("#6B7280");
                    }

                    var contactLine = string.Join(" • ", new[] { _config.ContactNumbers, _config.EmailAndWeb }.Where(s => !string.IsNullOrWhiteSpace(s)));
                    if (!string.IsNullOrWhiteSpace(contactLine))
                    {
                        c.Item().Text(contactLine)
                            .FontSize(8).FontColor("#6B7280");
                    }

                    var licenseParts = new[]
                    {
                        !string.IsNullOrWhiteSpace(_config.DohLicenseToOperate) ? $"DOH LTO: {_config.DohLicenseToOperate}" : null,
                        !string.IsNullOrWhiteSpace(_config.PhilHealthAccreditationNumber) ? $"PhilHealth: {_config.PhilHealthAccreditationNumber}" : null
                    }.Where(s => !string.IsNullOrWhiteSpace(s));

                    var licenseLine = string.Join(" • ", licenseParts);
                    if (!string.IsNullOrWhiteSpace(licenseLine))
                    {
                        c.Item().Text(licenseLine)
                            .FontSize(7.5f).Bold().FontColor("#374151");
                    }
                });

                if (_config.SecondaryLogoBytes != null && _config.SecondaryLogoBytes.Length > 0)
                {
                    row.ConstantItem(48).Height(45).Image(_config.SecondaryLogoBytes).FitArea();
                }
            });

            // Clean Accent Divider Bar matching Studio Preview
            col.Item().PaddingTop(6).PaddingBottom(8)
                .LineHorizontal(2.5f)
                .LineColor(primaryColor);
        });
    }
}
