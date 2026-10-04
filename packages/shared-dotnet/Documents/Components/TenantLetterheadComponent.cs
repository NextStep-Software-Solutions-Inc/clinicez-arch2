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
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                if (_config.PrimaryLogoBytes != null && _config.PrimaryLogoBytes.Length > 0)
                {
                    row.ConstantItem(55).Height(50).Image(_config.PrimaryLogoBytes);
                }

                row.RelativeItem().PaddingLeft(_config.PrimaryLogoBytes != null ? 8 : 0).Column(c =>
                {
                    c.Item().Text(_config.FacilityName)
                        .FontSize(15).Bold().FontColor(_config.GetSafePrimaryColorHex());

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
                        !string.IsNullOrWhiteSpace(_config.PhilHealthAccreditationNumber) ? $"PhilHealth Provider: {_config.PhilHealthAccreditationNumber}" : null
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
                    row.ConstantItem(48).Height(45).Image(_config.SecondaryLogoBytes);
                }
            });

            // Clean Accent Divider Bar
            col.Item().PaddingTop(6).PaddingBottom(8)
                .LineHorizontal(1.5f)
                .LineColor(_config.GetSafePrimaryColorHex());
        });
    }
}
