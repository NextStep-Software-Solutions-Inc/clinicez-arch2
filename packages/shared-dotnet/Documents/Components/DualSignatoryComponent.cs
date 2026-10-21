using System;
using QuestPDF.Fluent;
using QuestPDF.Infrastructure;

namespace ClinicEz.Shared.Documents.Components;

public class SignatoryParty
{
    public string? Label { get; set; }
    public string Name { get; set; } = "";
    public string Title { get; set; } = "";
    public string? Credentials { get; set; }
    public float SignatureSpaceHeight { get; set; } = 22f;
    public bool AlignCenter { get; set; } = false;
}

public class DualSignatoryModel
{
    public SignatoryParty Left { get; set; } = new();
    public SignatoryParty Right { get; set; } = new();
    public float ColumnGap { get; set; } = 30f;
    public string? BottomComplianceNotice { get; set; }
}

public class DualSignatoryComponent : IComponent
{
    private readonly DualSignatoryModel _model;

    public DualSignatoryComponent(DualSignatoryModel model)
    {
        _model = model;
    }

    public void Compose(IContainer container)
    {
        container.Column(col =>
        {
            col.Item().Row(row =>
            {
                row.RelativeItem().Column(c => ComposeParty(c, _model.Left));
                row.ConstantItem(_model.ColumnGap).Height(1);
                row.RelativeItem().Column(c => ComposeParty(c, _model.Right));
            });

            if (!string.IsNullOrWhiteSpace(_model.BottomComplianceNotice))
            {
                col.Item().PaddingTop(12).AlignCenter().Text(_model.BottomComplianceNotice)
                    .FontSize(7.5f).FontColor("#94A3B8");
            }
        });
    }

    private static void ComposeParty(ColumnDescriptor c, SignatoryParty party)
    {
        if (!string.IsNullOrWhiteSpace(party.Label))
        {
            var labelItem = c.Item();
            if (party.AlignCenter) labelItem = labelItem.AlignCenter();
            labelItem.Text(party.Label).FontSize(7f).SemiBold().FontColor("#64748B");
        }

        c.Item().Height(party.SignatureSpaceHeight);
        c.Item().LineHorizontal(0.5f).LineColor("#9CA3AF");

        var nameItem = c.Item().PaddingTop(2);
        if (party.AlignCenter) nameItem = nameItem.AlignCenter();
        nameItem.Text(party.Name).FontSize(8.5f).Bold().FontColor("#111827");

        if (!string.IsNullOrWhiteSpace(party.Title))
        {
            var titleItem = c.Item();
            if (party.AlignCenter) titleItem = titleItem.AlignCenter();
            titleItem.Text(party.Title).FontSize(7f).FontColor("#6B7280");
        }

        if (!string.IsNullOrWhiteSpace(party.Credentials))
        {
            var credItem = c.Item();
            if (party.AlignCenter) credItem = credItem.AlignCenter();
            credItem.Text(party.Credentials).FontSize(7f).FontColor("#6B7280");
        }
    }
}
