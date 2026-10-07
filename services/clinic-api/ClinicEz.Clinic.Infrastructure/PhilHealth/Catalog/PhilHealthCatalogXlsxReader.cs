using System.Text.RegularExpressions;
using ClosedXML.Excel;

namespace ClinicEz.Clinic.Infrastructure.PhilHealth.Catalog;

/// <summary>
/// Reads an official PhilHealth <c>lib_*.xlsx</c> workbook into the uniform catalog shape. The rules here are the same
/// ones used to produce the committed seed JSON; a test compares the two so they cannot drift.
/// </summary>
public static class PhilHealthCatalogXlsxReader
{
    private static readonly Regex DigitsOnly = new("^\\d+$", RegexOptions.Compiled);

    public static PhilHealthCatalogFile Read(Stream xlsx, string library, string kitVersion)
    {
        using var workbook = new XLWorkbook(xlsx);

        var items = library switch
        {
            "lib_zscore" => ReadZScore(workbook),
            "lib_ncdq" => ReadNcdq(Grid(workbook.Worksheets.First())),
            "lib_medicine" => ReadSimple(Grid(workbook.Worksheets.First()), statusColumn: null, MedicineAttributes),
            _ => ReadSimple(Grid(workbook.Worksheets.First()), statusColumn: 2, null),
        };

        return new PhilHealthCatalogFile(library, kitVersion, items);
    }

    /// <summary>Derives the library name from a file name such as <c>lib_icd.xlsx</c>; <c>null</c> when it is not one.</summary>
    public static string? LibraryFromFileName(string? fileName)
    {
        var name = Path.GetFileNameWithoutExtension(fileName ?? string.Empty).Trim().ToLowerInvariant();
        return PhilHealthCatalogKeys.IsValidLibraryName(name) ? name : null;
    }

    private static string[][] Grid(IXLWorksheet sheet)
    {
        var lastRow = sheet.LastRowUsed()?.RowNumber() ?? 0;
        var lastColumn = Math.Max(sheet.LastColumnUsed()?.ColumnNumber() ?? 0, 9);
        var rows = new string[lastRow][];
        for (var r = 1; r <= lastRow; r++)
        {
            var row = new string[lastColumn];
            for (var c = 1; c <= lastColumn; c++) row[c - 1] = Text(sheet.Cell(r, c));
            rows[r - 1] = row;
        }
        return rows;
    }

    /// <summary>Cell to trimmed text. Integer-valued numbers lose the spurious ".0" that spreadsheets add to codes.</summary>
    private static string Text(IXLCell cell)
    {
        var value = cell.Value;
        if (value.IsBlank) return string.Empty;
        if (value.IsNumber) return PhilHealthCatalogKeys.FormatNumber(value.GetNumber());
        if (value.IsBoolean) return value.GetBoolean() ? "True" : "False";
        if (value.IsText) return PhilHealthCatalogKeys.CleanText(value.GetText());
        return PhilHealthCatalogKeys.CleanText(value.ToString());
    }

    private static List<PhilHealthCatalogEntry> ReadSimple(
        string[][] rows,
        int? statusColumn,
        Func<string[], Dictionary<string, string>?>? attributes)
    {
        var items = new List<PhilHealthCatalogEntry>();
        if (rows.Length == 0) return items;

        var hasStatus = statusColumn is int sc && rows[0].Length > sc && rows[0][sc].ToLowerInvariant().Contains("status");
        foreach (var row in rows.Skip(1))
        {
            var code = row[0];
            var description = row[1];

            if (code.Contains(' ') && description.Length == 0) continue; // footnotes
            if (code.Length == 0 || code.Equals("NULL", StringComparison.OrdinalIgnoreCase)) continue;
            if (code.EndsWith("ID", StringComparison.OrdinalIgnoreCase) && description.EndsWith("DESCRIPTION", StringComparison.OrdinalIgnoreCase)) continue;

            var active = true;
            if (hasStatus)
            {
                var status = row[statusColumn!.Value];
                active = status.Length == 0 || status == "1";
            }

            var attrs = attributes?.Invoke(row);
            items.Add(new PhilHealthCatalogEntry(code, description, active, attrs is { Count: > 0 } ? attrs : null));
        }
        return items;
    }

    private static Dictionary<string, string>? MedicineAttributes(string[] row)
    {
        string[] keys = ["genCode", "saltCode", "formCode", "strengthCode", "unitCode", "packageCode", "category"];
        var attrs = new Dictionary<string, string>();
        for (var i = 0; i < keys.Length; i++)
        {
            var value = row[i + 2];
            if (value.Length > 0) attrs[keys[i]] = value;
        }
        return attrs;
    }

    private static List<PhilHealthCatalogEntry> ReadZScore(XLWorkbook workbook)
    {
        var groups = new Dictionary<string, (string Key, string Sex, string Band, string Measure)>(StringComparer.Ordinal)
        {
            ["Girls 0-23months old"] = ("girls-0-23", "F", "0-23", "length"),
            ["Boys 0-23months old"] = ("boys-0-23", "M", "0-23", "length"),
            ["Girls 24-60months old"] = ("girls-24-60", "F", "24-60", "height"),
            ["Boys 24-60months old"] = ("boys-24-60", "M", "24-60", "height"),
        };

        var items = new List<PhilHealthCatalogEntry>();
        foreach (var sheet in workbook.Worksheets)
        {
            if (!groups.TryGetValue(sheet.Name, out var group)) continue;
            foreach (var row in Grid(sheet).Skip(1))
            {
                if (row[0].Length == 0) continue;
                items.Add(new PhilHealthCatalogEntry(
                    $"{group.Key}/{row[0]}",
                    row[4],
                    true,
                    new Dictionary<string, string>
                    {
                        ["sex"] = group.Sex,
                        ["ageMonths"] = group.Band,
                        [group.Measure] = row[1],
                        ["weight"] = row[2],
                        ["resultCode"] = row[3],
                    }));
            }
        }
        return items;
    }

    private static List<PhilHealthCatalogEntry> ReadNcdq(string[][] rows)
    {
        var items = new List<PhilHealthCatalogEntry>();

        // Questions: columns A-D (question id, header id, description, parent question id).
        foreach (var row in rows)
        {
            var questionId = row[0];
            if (!DigitsOnly.IsMatch(questionId)) continue;

            var attrs = new Dictionary<string, string>();
            var headerId = row[1];
            if (headerId.Length > 0 && !headerId.Equals("NULL", StringComparison.OrdinalIgnoreCase)) attrs["headerId"] = headerId;
            var parent = row[3];
            if (parent.Length > 0 && !parent.Equals("NULL", StringComparison.OrdinalIgnoreCase)) attrs["parentQuestionId"] = parent;

            items.Add(new PhilHealthCatalogEntry($"Q{questionId}", row[2], true, attrs.Count > 0 ? attrs : null));
        }

        // Section headers: columns F-G.
        foreach (var row in rows)
        {
            var headerId = row[5];
            var headerDescription = row[6];
            if (!DigitsOnly.IsMatch(headerId) || headerDescription.Length == 0) continue;
            items.Add(new PhilHealthCatalogEntry($"H{headerId}", headerDescription));
        }

        return items;
    }
}
