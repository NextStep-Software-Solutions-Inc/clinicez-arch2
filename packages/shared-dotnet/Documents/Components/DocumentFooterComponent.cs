using System;
using ClinicEz.Shared.Documents.Configuration;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace ClinicEz.Shared.Documents.Components;

public class DocumentFooterComponent : IComponent
{
    private readonly TenantPrintoutConfig _config;
    private readonly byte[]? _qrCodeBytes;
    private readonly string? _verificationCode;

    public DocumentFooterComponent(TenantPrintoutConfig config, byte[]? qrCodeBytes, string? verificationCode)
    {
        _config = config;
        _qrCodeBytes = qrCodeBytes;
        _verificationCode = verificationCode;
    }

    public void Compose(IContainer container)
    {
        container.Column(col =>
        {
            col.Item()
                .PaddingTop(DocumentSpacingConstants.FooterTopPadding)
                .PaddingBottom(4)
                .LineHorizontal(0.5f)
                .LineColor("#D1D5DB");

            col.Item().Row(row =>
            {
                if (_config.ShowSecurityQrCode && _qrCodeBytes != null && _qrCodeBytes.Length > 0)
                {
                    row.ConstantItem(42).Height(42).Image(_qrCodeBytes);
                }

                row.RelativeItem().PaddingLeft(_qrCodeBytes != null ? 8 : 0).Column(c =>
                {
                    c.Item().Text(_config.CustomDisclaimerText)
                        .FontSize(7f).FontColor("#6B7280").LineHeight(1.2f);

                    if (!string.IsNullOrWhiteSpace(_verificationCode))
                    {
                        c.Item().Text($"Security Hash: {_verificationCode} • RA 8792 E-Commerce & RA 10173 DPA Compliant")
                            .FontSize(6.5f).Bold().FontColor("#4B5563");
                    }
                });

                row.ConstantItem(85).AlignRight().Column(c =>
                {
                    c.Item().Text(text =>
                    {
                        text.DefaultTextStyle(x => x.FontSize(7.5f).FontColor("#4B5563"));
                        text.Span("Page ");
                        text.CurrentPageNumber();
                        text.Span(" of ");
                        text.TotalPages();
                    });

                    c.Item().Text(DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm UTC"))
                        .FontSize(6.5f).FontColor("#9CA3AF");
                });
            });
        });
    }
}
