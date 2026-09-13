using System.Text.RegularExpressions;
using ClinicEz.Patient.MigrationTool.Models;

namespace ClinicEz.Patient.MigrationTool.Services;

public static partial class NameMatcher
{
    private static readonly Dictionary<string, string[]> Synonyms = new(StringComparer.OrdinalIgnoreCase)
    {
        ["id"] = ["id"],
        ["clientid"] = ["clientid", "clientuuid", "uuid"],
        ["clerkuserid"] = ["clerkuserid", "clerkid", "authuserid", "userid"],
        ["firstname"] = ["firstname", "fname", "givenname", "first"],
        ["middlename"] = ["middlename", "mname", "middle"],
        ["lastname"] = ["lastname", "lname", "surname", "familyname", "last"],
        ["dateofbirth"] = ["dateofbirth", "dob", "birthdate", "birthday", "birthdate"],
        ["mobile"] = ["mobile", "mobilenumber", "phone", "phonenumber", "contactnumber", "contactno"],
        ["altphone"] = ["altphone", "alternatephone", "landline", "telno", "telephone"],
        ["email"] = ["email", "emailaddress"],
        ["patientid"] = ["patientid", "personid", "memberid", "customerid"],
        ["clinicid"] = ["clinicid", "facilityid", "branchid"],
        ["organizationid"] = ["organizationid", "orgid", "companyid", "tenantid"],
        ["consultationid"] = ["consultationid", "visitid", "encounterid"],
        ["folderid"] = ["folderid", "directoryid"],
        ["createdat"] = ["createdat", "created", "datecreated", "createdon"],
        ["updatedat"] = ["updatedat", "updated", "modifiedat", "datemodified", "updatedon"],
        ["createdby"] = ["createdby", "creator", "createduser"],
        ["updatedby"] = ["updatedby", "modifier", "updateduser"],
        ["isdeleted"] = ["isdeleted", "deleted", "isarchived", "archived"],
    };

    public static string Normalize(string value)
    {
        var normalized = NonWord().Replace(value, string.Empty).ToLowerInvariant();
        return Singularize(normalized);
    }

    public static SourceColumnInfo? FindBestColumn(IEnumerable<SourceColumnInfo> sourceColumns, string targetColumn)
    {
        var target = Normalize(targetColumn);
        var sourceList = sourceColumns.ToArray();

        var exact = sourceList.FirstOrDefault(c => Normalize(c.Name) == target);
        if (exact is not null)
            return exact;

        if (Synonyms.TryGetValue(target, out var synonyms))
        {
            exact = sourceList.FirstOrDefault(c => synonyms.Contains(Normalize(c.Name), StringComparer.OrdinalIgnoreCase));
            if (exact is not null)
                return exact;
        }

        return sourceList
            .Select(c => new { Column = c, Score = ColumnScore(c.Name, targetColumn) })
            .Where(x => x.Score >= 70)
            .OrderByDescending(x => x.Score)
            .ThenBy(x => x.Column.Ordinal)
            .Select(x => x.Column)
            .FirstOrDefault();
    }

    public static int TableScore(SourceTableInfo source, TargetTableInfo target)
    {
        var sourceName = Normalize(source.Name);
        var targetName = Normalize(target.Name);
        var sourceKey = Normalize(source.Key);

        var nameScore = sourceName == targetName
            ? 100
            : sourceName.Contains(targetName, StringComparison.Ordinal) || targetName.Contains(sourceName, StringComparison.Ordinal)
                ? 78
                : sourceKey.Contains(targetName, StringComparison.Ordinal)
                    ? 72
                    : 0;

        var targetColumns = target.Columns
            .Where(c => !c.IsPrimaryKey && !c.IsShadow)
            .ToArray();

        if (targetColumns.Length == 0)
            return nameScore;

        var overlap = targetColumns.Count(c => FindBestColumn(source.Columns, c.Name) is not null);
        var columnScore = (int)Math.Round((double)overlap / targetColumns.Length * 100);

        return Math.Max(nameScore, (nameScore / 2) + (columnScore / 2));
    }

    public static string? InferPrincipalTableFromColumn(string columnName)
    {
        var normalized = Normalize(columnName);
        if (!normalized.EndsWith("id", StringComparison.Ordinal))
            return null;

        return normalized[..^2] switch
        {
            "patient" => "patients",
            "clinic" => "clinics",
            "organization" => "organizations",
            "consultation" => "consultations",
            "folder" => "file_folders",
            "parent" => "file_folders",
            _ => null
        };
    }

    private static int ColumnScore(string sourceColumn, string targetColumn)
    {
        var source = Normalize(sourceColumn);
        var target = Normalize(targetColumn);

        if (source == target)
            return 100;

        if (Synonyms.TryGetValue(target, out var synonyms) && synonyms.Contains(source, StringComparer.OrdinalIgnoreCase))
            return 96;

        if (source.Contains(target, StringComparison.Ordinal) || target.Contains(source, StringComparison.Ordinal))
            return 75;

        return 0;
    }

    private static string Singularize(string value)
    {
        if (value.EndsWith("ies", StringComparison.Ordinal) && value.Length > 3)
            return string.Concat(value.AsSpan(0, value.Length - 3), "y");

        if (value.EndsWith('s') && !value.EndsWith("ss", StringComparison.Ordinal) && value.Length > 1)
            return value[..^1];

        return value;
    }

    [GeneratedRegex("[^a-zA-Z0-9]")]
    private static partial Regex NonWord();
}
