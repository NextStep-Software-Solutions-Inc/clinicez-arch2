using Npgsql;

namespace PatientAppBE.MigrationTool.Services;

public static class PostgresConnectionString
{
    private static readonly Dictionary<string, string> QueryKeywordMap = new(StringComparer.OrdinalIgnoreCase)
    {
        ["application_name"] = "Application Name",
        ["channel_binding"] = "Channel Binding",
        ["command_timeout"] = "Command Timeout",
        ["connect_timeout"] = "Timeout",
        ["database"] = "Database",
        ["host"] = "Host",
        ["max_pool_size"] = "Maximum Pool Size",
        ["maxpoolsize"] = "Maximum Pool Size",
        ["min_pool_size"] = "Minimum Pool Size",
        ["minpoolsize"] = "Minimum Pool Size",
        ["password"] = "Password",
        ["pooling"] = "Pooling",
        ["port"] = "Port",
        ["search_path"] = "Search Path",
        ["sslmode"] = "SSL Mode",
        ["ssl_mode"] = "SSL Mode",
        ["timeout"] = "Timeout",
        ["username"] = "Username",
        ["user"] = "Username",
    };

    public static string Normalize(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString) || !IsPostgresUri(connectionString))
            return connectionString;

        if (!Uri.TryCreate(connectionString, UriKind.Absolute, out var uri))
            throw new ArgumentException("The PostgreSQL URI connection string is not a valid absolute URI.", nameof(connectionString));

        var builder = new NpgsqlConnectionStringBuilder
        {
            Host = uri.Host,
        };

        if (uri.Port > 0)
            builder.Port = uri.Port;

        var database = Uri.UnescapeDataString(uri.AbsolutePath.TrimStart('/'));
        if (!string.IsNullOrWhiteSpace(database))
            builder.Database = database;

        if (!string.IsNullOrWhiteSpace(uri.UserInfo))
        {
            var parts = uri.UserInfo.Split(':', 2);
            builder.Username = Uri.UnescapeDataString(parts[0]);
            if (parts.Length > 1)
                builder.Password = Uri.UnescapeDataString(parts[1]);
        }

        foreach (var (key, value) in ParseQuery(uri.Query))
        {
            if (!QueryKeywordMap.TryGetValue(key, out var keyword))
                continue;

            builder[keyword] = NormalizeKeywordValue(keyword, value);
        }

        return builder.ConnectionString;
    }

    private static bool IsPostgresUri(string connectionString)
    {
        return connectionString.StartsWith("postgres://", StringComparison.OrdinalIgnoreCase)
            || connectionString.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase);
    }

    private static IEnumerable<(string Key, string Value)> ParseQuery(string query)
    {
        var trimmed = query.TrimStart('?');
        if (string.IsNullOrWhiteSpace(trimmed))
            yield break;

        foreach (var part in trimmed.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var pieces = part.Split('=', 2);
            var key = DecodeQueryValue(pieces[0]);
            var value = pieces.Length > 1 ? DecodeQueryValue(pieces[1]) : string.Empty;
            if (!string.IsNullOrWhiteSpace(key))
                yield return (key, value);
        }
    }

    private static string DecodeQueryValue(string value)
    {
        return Uri.UnescapeDataString(value.Replace("+", " ", StringComparison.Ordinal));
    }

    private static object NormalizeKeywordValue(string keyword, string value)
    {
        if (keyword is "SSL Mode" or "Channel Binding")
            return NormalizeEnumLikeValue(value);

        return value;
    }

    private static string NormalizeEnumLikeValue(string value)
    {
        var normalized = value.Trim().Replace("_", "-", StringComparison.Ordinal).ToLowerInvariant();
        return normalized switch
        {
            "disable" => "Disable",
            "prefer" => "Prefer",
            "require" => "Require",
            "allow" => "Allow",
            "verify-ca" => "VerifyCA",
            "verify-full" => "VerifyFull",
            _ => value,
        };
    }
}
