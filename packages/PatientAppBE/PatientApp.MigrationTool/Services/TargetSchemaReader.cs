using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.EntityFrameworkCore.Metadata.Internal;
using Microsoft.Extensions.Options;
using PatientApp.Infrastructure.Persistence;
using PatientApp.MigrationTool.Models;

namespace PatientApp.MigrationTool.Services;

public sealed class TargetSchemaReader(IOptions<MigrationToolOptions> options)
{
    public TargetDatabaseSchema Read()
    {
        var connectionString = string.IsNullOrWhiteSpace(options.Value.TargetConnection)
            ? "Host=localhost;Database=patientapp_migration_metadata;Username=metadata;Password=metadata"
            : PostgresConnectionString.Normalize(options.Value.TargetConnection);

        var dbOptions = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseNpgsql(connectionString, npgsql => npgsql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName))
            .UseSnakeCaseNamingConvention()
            .Options;

        using var context = new ApplicationDbContext(dbOptions);
        var tables = context.Model.GetEntityTypes()
            .Where(e => e.GetTableName() is not null)
            .Select(BuildTable)
            .Where(t => t.Columns.Count > 0)
            .OrderBy(t => t.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new TargetDatabaseSchema { Tables = tables };
    }

    private static TargetTableInfo BuildTable(IEntityType entityType)
    {
        var tableName = entityType.GetTableName() ?? string.Empty;
        var modelSchema = entityType.GetSchema();
        var databaseSchema = modelSchema ?? "public";
        var store = StoreObjectIdentifier.Table(tableName, modelSchema);
        var primaryKey = entityType.FindPrimaryKey()?.Properties.ToHashSet() ?? [];

        var foreignKeys = entityType.GetForeignKeys()
            .SelectMany(fk =>
            {
                var principalTable = fk.PrincipalEntityType.GetTableName() ?? string.Empty;
                var principalSchema = fk.PrincipalEntityType.GetSchema();
                return fk.Properties.Select((property, index) => new TargetForeignKeyInfo
                {
                    ColumnName = ResolveColumnName(property, store).Name,
                    PrincipalTable = principalTable,
                    PrincipalColumn = ResolveColumnName(
                        fk.PrincipalKey.Properties[index],
                        StoreObjectIdentifier.Table(principalTable, principalSchema)).Name,
                });
            })
            .ToArray();
        var uniqueIndexes = entityType.GetIndexes()
            .Where(index => index.IsUnique)
            .Select(index => new TargetUniqueIndexInfo
            {
                Name = index.GetDatabaseName() ?? string.Join("_", index.Properties.Select(p => ResolveColumnName(p, store).Name)),
                Columns = index.Properties.Select(p => ResolveColumnName(p, store).Name).ToArray(),
                Filter = index.GetFilter(),
            })
            .Where(index => index.Columns.Count > 0)
            .ToArray();

        var columns = entityType.GetProperties()
            .Select(property =>
            {
                var resolvedColumn = ResolveColumnName(property, store);
                var fk = foreignKeys.FirstOrDefault(candidate =>
                    string.Equals(candidate.ColumnName, resolvedColumn.Name, StringComparison.OrdinalIgnoreCase));

                return new TargetColumnInfo
                {
                    Name = resolvedColumn.Name,
                    ClrType = property.ClrType,
                    IsNullable = property.IsNullable,
                    IsPrimaryKey = primaryKey.Contains(property),
                    IsForeignKey = fk is not null,
                    IsShadow = property.IsShadowProperty(),
                    IsStoreColumnResolved = resolvedColumn.IsStoreResolved,
                    MaxLength = property.GetMaxLength(),
                    PrincipalTable = fk?.PrincipalTable,
                    PrincipalColumn = fk?.PrincipalColumn,
                };
            })
            .Where(c => !c.IsShadow)
            .OrderBy(c => c.Name, StringComparer.OrdinalIgnoreCase)
            .ToArray();

        return new TargetTableInfo
        {
            Schema = databaseSchema,
            Name = tableName,
            Columns = columns,
            ForeignKeys = foreignKeys,
            UniqueIndexes = uniqueIndexes,
        };
    }

    private static (string Name, bool IsStoreResolved) ResolveColumnName(
        IProperty property,
        StoreObjectIdentifier store)
    {
        var storeColumnName = property.GetColumnName(store);
        if (!string.IsNullOrWhiteSpace(storeColumnName))
            return (storeColumnName, true);

        var relationalColumnName = property.GetColumnName();
        if (!string.IsNullOrWhiteSpace(relationalColumnName))
            return (relationalColumnName, true);

        return (property.Name, false);
    }
}
