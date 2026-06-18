using PatientApp.MigrationTool.Models;
using PatientApp.MigrationTool.Services;
using Microsoft.Extensions.Options;
using PatientApp.Domain.Enums;
using System.Reflection;

namespace PatientApp.MigrationTool.Tests;

public sealed class MappingEngineTests
{
    [Fact]
    public void DeterministicGuid_IsStableForSameSourceIdentity()
    {
        var first = DeterministicGuid.Create("public.legacy_patients:42");
        var second = DeterministicGuid.Create("public.legacy_patients:42");
        var other = DeterministicGuid.Create("public.legacy_patients:43");

        Assert.Equal(first, second);
        Assert.NotEqual(first, other);
    }

    [Fact]
    public void NameMatcher_MatchesCommonPatientColumnSynonyms()
    {
        var columns = new[]
        {
            Column("id", 1),
            Column("fname", 2),
            Column("lname", 3),
            Column("dob", 4),
            Column("contact_no", 5),
        };

        Assert.Equal("fname", NameMatcher.FindBestColumn(columns, "first_name")?.Name);
        Assert.Equal("lname", NameMatcher.FindBestColumn(columns, "last_name")?.Name);
        Assert.Equal("dob", NameMatcher.FindBestColumn(columns, "date_of_birth")?.Name);
        Assert.Equal("contact_no", NameMatcher.FindBestColumn(columns, "mobile")?.Name);
    }

    [Fact]
    public void PostgresConnectionString_NormalizesPostgresUriForNpgsql()
    {
        var normalized = PostgresConnectionString.Normalize(
            "postgresql://clinic_owner:p%40ss%3Aword@ep-example-pooler.ap-southeast-1.aws.neon.tech/clinic-db?sslmode=require&channel_binding=require");

        Assert.False(normalized.StartsWith("postgresql://", StringComparison.OrdinalIgnoreCase));
        Assert.Contains("Host=ep-example-pooler.ap-southeast-1.aws.neon.tech", normalized);
        Assert.Contains("Database=clinic-db", normalized);
        Assert.Contains("Username=clinic_owner", normalized);
        Assert.Contains("Password=p@ss:word", normalized);
        Assert.Contains("SSL Mode=Require", normalized);
        Assert.Contains("Channel Binding=Require", normalized);
    }

    [Fact]
    public void PostgresConnectionString_LeavesNpgsqlConnectionStringUntouched()
    {
        const string connectionString = "Host=localhost;Database=patientapp;Username=app;Password=secret";

        Assert.Equal(connectionString, PostgresConnectionString.Normalize(connectionString));
    }

    [Fact]
    public void TargetSchemaReader_UsesDatabaseColumnNamesForDefaultSchemaEntities()
    {
        var schema = new TargetSchemaReader(Options.Create(new MigrationToolOptions())).Read();
        var patients = schema.FindTable("patients");
        var emergencyContacts = schema.FindTable("emergency_contacts");

        Assert.NotNull(patients);
        Assert.NotNull(emergencyContacts);
        Assert.Contains(patients.Columns, c => c.Name == "alt_phone" && c.IsStoreColumnResolved);
        Assert.DoesNotContain(patients.Columns, c => c.Name == "AltPhone");
        Assert.Contains(emergencyContacts.Columns, c => c.Name == "alt_phone" && c.IsStoreColumnResolved);
        Assert.DoesNotContain(emergencyContacts.Columns, c => c.Name == "AltPhone");
    }

    [Fact]
    public void TargetSchemaReader_DoesNotLeakClrPropertyNamesAsInsertColumns()
    {
        var schema = new TargetSchemaReader(Options.Create(new MigrationToolOptions())).Read();
        var columns = schema.Tables.SelectMany(table => table.Columns.Select(column => $"{table.Name}.{column.Name}")).ToArray();

        Assert.DoesNotContain(schema.Tables.SelectMany(table => table.Columns), column => !column.IsStoreColumnResolved);
        Assert.DoesNotContain(columns, column => column.Any(char.IsUpper));
    }

    [Fact]
    public void TargetSchemaReader_ExposesUniqueIndexes()
    {
        var schema = new TargetSchemaReader(Options.Create(new MigrationToolOptions())).Read();
        var organizations = schema.FindTable("organizations");

        Assert.NotNull(organizations);
        Assert.Contains(organizations.UniqueIndexes, index =>
            index.Name == "ix_organizations_slug"
            && index.Columns.SequenceEqual(["slug"]));
    }

    [Fact]
    public void MigrationRunner_GeneratesDeterministicUniqueSlugsForBlankRequiredUniqueColumns()
    {
        var targetTable = new TargetTableInfo
        {
            Schema = "public",
            Name = "organizations",
            Columns =
            [
                TargetColumn("id", typeof(Guid), primaryKey: true),
                TargetColumn("slug", typeof(string), maxLength: 100),
                TargetColumn("name", typeof(string)),
            ],
            UniqueIndexes =
            [
                new TargetUniqueIndexInfo
                {
                    Name = "ix_organizations_slug",
                    Columns = ["slug"],
                },
            ],
        };
        var targetSchema = new TargetDatabaseSchema { Tables = [targetTable] };
        var sourceTable = SourceTable("legacy_organizations", ["id", "name"]);
        var sourceSchema = new DatabaseSchema { Tables = [sourceTable] };
        var mapping = new TableMapping
        {
            SourceTableKey = sourceTable.Key,
            SourceTableName = sourceTable.Name,
            TargetTableName = targetTable.Name,
        };
        var plan = new MappingPlan { TableMappings = [mapping], TargetInsertOrder = [targetTable.Name] };
        var idMap = new Dictionary<string, IdMapEntry>(StringComparer.OrdinalIgnoreCase)
        {
            [$"{sourceTable.Key}:1"] = new() { SourceTable = sourceTable.Key, SourceKey = "1", TargetTable = targetTable.Name, TargetId = Guid.NewGuid() },
            [$"{sourceTable.Key}:2"] = new() { SourceTable = sourceTable.Key, SourceKey = "2", TargetTable = targetTable.Name, TargetId = Guid.NewGuid() },
        };
        var firstRow = SourceRow(sourceTable, 1, new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = 1,
            ["name"] = "Alpha Clinic",
        });
        var secondRow = SourceRow(sourceTable, 2, new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = 2,
            ["name"] = "Alpha Clinic",
        });
        var tracker = CreateUniqueValueTracker();

        var first = InvokeTransformRow(firstRow, mapping, sourceSchema, targetSchema, plan, idMap, tracker);
        var second = InvokeTransformRow(secondRow, mapping, sourceSchema, targetSchema, plan, idMap, tracker);

        Assert.True(first.Success);
        Assert.True(second.Success);
        var firstSlug = Assert.IsType<string>(first.Values["slug"]);
        var secondSlug = Assert.IsType<string>(second.Values["slug"]);
        Assert.StartsWith("alpha-clinic-", firstSlug);
        Assert.StartsWith("alpha-clinic-", secondSlug);
        Assert.NotEqual(firstSlug, secondSlug);
    }

    [Fact]
    public void MigrationRunner_ConvertsEnumValuesToProviderStrings()
    {
        var row = new SourceRow
        {
            Table = SourceTable("legacy_appointments", ["id", "status"]),
            Ordinal = 1,
            Values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["id"] = 1,
                ["status"] = "confirmed",
            },
        };
        var mapping = new TableMapping
        {
            SourceTableKey = row.Table.Key,
            SourceTableName = row.Table.Name,
            TargetTableName = "appointments",
        };
        var targetColumn = TargetColumn("status", typeof(AppointmentStatus));

        var conversion = InvokeConvertValue(row.Values["status"], targetColumn, row, mapping);

        Assert.True((bool)conversion.GetType().GetProperty("Success")!.GetValue(conversion)!);
        Assert.Equal("Confirmed", conversion.GetType().GetProperty("Value")!.GetValue(conversion));
    }

    [Fact]
    public void MigrationRunner_GeneratesStringDefaultsForRequiredEnums()
    {
        var row = new SourceRow
        {
            Table = SourceTable("legacy_appointments", ["id"]),
            Ordinal = 1,
            Values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["id"] = 1,
            },
        };
        var mapping = new TableMapping
        {
            SourceTableKey = row.Table.Key,
            SourceTableName = row.Table.Name,
            TargetTableName = "appointments",
        };
        var targetColumn = TargetColumn("status", typeof(AppointmentStatus));

        var conversion = InvokeConvertValue(null, targetColumn, row, mapping);

        Assert.True((bool)conversion.GetType().GetProperty("Success")!.GetValue(conversion)!);
        Assert.Equal("Pending", conversion.GetType().GetProperty("Value")!.GetValue(conversion));
    }

    [Fact]
    public void MigrationRunner_ConvertsDateTimeOffsetValuesToUtcDateTime()
    {
        var row = new SourceRow
        {
            Table = SourceTable("legacy_appointments", ["id", "scheduled_at"]),
            Ordinal = 1,
            Values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["id"] = 1,
                ["scheduled_at"] = new DateTimeOffset(2026, 6, 18, 10, 30, 0, TimeSpan.FromHours(8)),
            },
        };
        var mapping = new TableMapping
        {
            SourceTableKey = row.Table.Key,
            SourceTableName = row.Table.Name,
            TargetTableName = "appointments",
        };
        var targetColumn = TargetColumn("scheduled_at", typeof(DateTime));

        var conversion = InvokeConvertValue(row.Values["scheduled_at"], targetColumn, row, mapping);
        var value = Assert.IsType<DateTime>(conversion.GetType().GetProperty("Value")!.GetValue(conversion));

        Assert.True((bool)conversion.GetType().GetProperty("Success")!.GetValue(conversion)!);
        Assert.Equal(DateTimeKind.Utc, value.Kind);
        Assert.Equal(new DateTime(2026, 6, 18, 2, 30, 0, DateTimeKind.Utc), value);
    }

    [Fact]
    public void MigrationRunner_StringifiesJsonTransformFromScalarSource()
    {
        var row = new SourceRow
        {
            Table = SourceTable("legacy_events", ["id", "legacy_id"]),
            Ordinal = 1,
            Values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["id"] = 1,
                ["legacy_id"] = 42,
            },
        };
        var mapping = new TableMapping
        {
            SourceTableKey = row.Table.Key,
            SourceTableName = row.Table.Name,
            TargetTableName = "events",
        };
        var targetColumn = TargetColumn("raw_json", typeof(string));

        var conversion = InvokeConvertValue(row.Values["legacy_id"], targetColumn, row, mapping, "json_stringify");

        Assert.True((bool)conversion.GetType().GetProperty("Success")!.GetValue(conversion)!);
        Assert.Equal("42", conversion.GetType().GetProperty("Value")!.GetValue(conversion));
    }

    [Fact]
    public void MigrationRunner_ExplicitlyConvertsNumericSourceToStringTarget()
    {
        var row = new SourceRow
        {
            Table = SourceTable("legacy_patients", ["id", "legacy_id"]),
            Ordinal = 1,
            Values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
            {
                ["id"] = 1,
                ["legacy_id"] = 42,
            },
        };
        var mapping = new TableMapping
        {
            SourceTableKey = row.Table.Key,
            SourceTableName = row.Table.Name,
            TargetTableName = "patients",
        };
        var targetColumn = TargetColumn("external_id", typeof(string));

        var conversion = InvokeConvertValue(row.Values["legacy_id"], targetColumn, row, mapping, "convert");

        Assert.True((bool)conversion.GetType().GetProperty("Success")!.GetValue(conversion)!);
        Assert.Equal("42", conversion.GetType().GetProperty("Value")!.GetValue(conversion));
        Assert.Equal("Explicitly converted source value to target string.", conversion.GetType().GetProperty("Note")!.GetValue(conversion));
    }

    [Fact]
    public void ManualColumnMapping_OverridesAutomaticTransformSelection()
    {
        var sourceTable = SourceTable("legacy_patients", ["id", "fname", "patient_fullname"]);
        var sourceSchema = new DatabaseSchema { Tables = [sourceTable] };
        var targetTable = new TargetTableInfo
        {
            Schema = "public",
            Name = "patients",
            Columns =
            [
                TargetColumn("id", typeof(Guid), primaryKey: true),
                TargetColumn("first_name", typeof(string)),
            ],
        };
        var targetSchema = new TargetDatabaseSchema { Tables = [targetTable] };
        var configuration = new MigrationMappingConfiguration
        {
            Tables =
            {
                [sourceTable.Key] = new TableMappingOverride
                {
                    TargetTableName = "patients",
                    Columns = { ["first_name"] = "patient_fullname" },
                },
            },
        };
        var plan = new MappingEngine().Build(sourceSchema, targetSchema, configuration);
        var mapping = Assert.Single(plan.TableMappings);
        var row = SourceRow(sourceTable, 1, new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = 1,
            ["fname"] = "Auto",
            ["patient_fullname"] = "Manual",
        });
        var idMap = new Dictionary<string, IdMapEntry>(StringComparer.OrdinalIgnoreCase)
        {
            [$"{sourceTable.Key}:1"] = new() { SourceTable = sourceTable.Key, SourceKey = "1", TargetTable = targetTable.Name, TargetId = Guid.NewGuid() },
        };

        var transform = InvokeTransformRow(row, mapping, sourceSchema, targetSchema, plan, idMap, CreateUniqueValueTracker());

        Assert.Equal("manual", mapping.Status);
        Assert.Contains(mapping.ColumnMappings, column =>
            column.TargetColumn == "first_name"
            && column.SourceColumn == "patient_fullname"
            && column.Action == "manual_copy_or_convert");
        Assert.True(transform.Success);
        Assert.Equal("Manual", transform.Values["first_name"]);
    }

    [Fact]
    public void ManualColumnMapping_CanReadFromRelatedSourceTableThroughForeignKey()
    {
        var clinicTable = SourceTable("legacy_clinics", ["id", "name"]);
        var patientTable = new SourceTableInfo
        {
            Schema = "public",
            Name = "legacy_patients",
            Columns =
            [
                Column("id", 1),
                Column("clinic_id", 2),
            ],
            PrimaryKeyColumns = ["id"],
            ForeignKeys =
            [
                new SourceForeignKeyInfo
                {
                    ConstraintName = "fk_patients_clinics",
                    ColumnName = "clinic_id",
                    ReferencedSchema = clinicTable.Schema,
                    ReferencedTable = clinicTable.Name,
                    ReferencedColumn = "id",
                },
            ],
        };
        var sourceSchema = new DatabaseSchema { Tables = [patientTable, clinicTable] };
        var targetTable = new TargetTableInfo
        {
            Schema = "public",
            Name = "patients",
            Columns =
            [
                TargetColumn("id", typeof(Guid), primaryKey: true),
                TargetColumn("clinic_name", typeof(string), nullable: true),
            ],
        };
        var targetSchema = new TargetDatabaseSchema { Tables = [targetTable] };
        var configuration = new MigrationMappingConfiguration
        {
            Tables =
            {
                [patientTable.Key] = new TableMappingOverride
                {
                    TargetTableName = "patients",
                    ColumnSources =
                    {
                        ["clinic_name"] = new ColumnMappingOverride
                        {
                            SourceTableKey = clinicTable.Key,
                            SourceColumnName = "name",
                        },
                    },
                },
            },
        };
        var plan = new MappingEngine().Build(sourceSchema, targetSchema, configuration);
        var mapping = Assert.Single(plan.TableMappings, table =>
            table.TargetTableName == "patients"
            && table.SourceTableKey == patientTable.Key);
        var patientRow = SourceRow(patientTable, 1, new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = 10,
            ["clinic_id"] = 2,
        });
        var clinicRow = SourceRow(clinicTable, 1, new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase)
        {
            ["id"] = 2,
            ["name"] = "North Clinic",
        });
        var idMap = new Dictionary<string, IdMapEntry>(StringComparer.OrdinalIgnoreCase)
        {
            [$"{patientTable.Key}:10"] = new() { SourceTable = patientTable.Key, SourceKey = "10", TargetTable = targetTable.Name, TargetId = Guid.NewGuid() },
        };

        var transform = InvokeTransformRow(patientRow, mapping, sourceSchema, targetSchema, plan, idMap, CreateUniqueValueTracker(), CreateSourceRowLookup(clinicRow));

        Assert.Contains(mapping.ColumnMappings, column =>
            column.TargetColumn == "clinic_name"
            && column.SourceTableKey == clinicTable.Key
            && column.SourceColumn == "name"
            && column.Action == "manual_related_copy_or_convert");
        Assert.True(transform.Success);
        Assert.Equal("North Clinic", transform.Values["clinic_name"]);
    }

    [Fact]
    public void MappingConfigurationStore_VersionTracksOverrideContent()
    {
        var store = new MappingConfigurationStore(Options.Create(new MigrationToolOptions()));
        var first = new MigrationMappingConfiguration
        {
            Tables =
            {
                ["public.legacy_patients"] = new TableMappingOverride
                {
                    TargetTableName = "patients",
                    Columns =
                    {
                        ["first_name"] = "fname",
                        ["last_name"] = "lname",
                    },
                },
            },
        };
        var sameContentDifferentOrder = new MigrationMappingConfiguration
        {
            Tables =
            {
                ["public.legacy_patients"] = new TableMappingOverride
                {
                    TargetTableName = "patients",
                    Columns =
                    {
                        ["last_name"] = "lname",
                        ["first_name"] = "fname",
                    },
                },
            },
        };
        var changed = new MigrationMappingConfiguration
        {
            Tables =
            {
                ["public.legacy_patients"] = new TableMappingOverride
                {
                    TargetTableName = "patients",
                    Columns =
                    {
                        ["first_name"] = "patient_fullname",
                        ["last_name"] = "lname",
                    },
                },
            },
        };
        var transformChanged = new MigrationMappingConfiguration
        {
            Tables =
            {
                ["public.legacy_patients"] = new TableMappingOverride
                {
                    TargetTableName = "patients",
                    ColumnSources =
                    {
                        ["raw_json"] = new ColumnMappingOverride
                        {
                            SourceTableKey = "public.legacy_patients",
                            SourceColumnName = "payload",
                            Transform = "json_stringify",
                        },
                    },
                },
            },
        };

        Assert.Equal(store.GetVersion(first), store.GetVersion(sameContentDifferentOrder));
        Assert.NotEqual(store.GetVersion(first), store.GetVersion(changed));
        Assert.NotEqual(store.GetVersion(first), store.GetVersion(transformChanged));
    }

    [Fact]
    public void MappingEngine_MapsLegacyPatientTableToPatientsTarget()
    {
        var source = new DatabaseSchema
        {
            Tables =
            [
                new SourceTableInfo
                {
                    Schema = "public",
                    Name = "legacy_patients",
                    Columns =
                    [
                        Column("id", 1),
                        Column("fname", 2),
                        Column("lname", 3),
                        Column("dob", 4),
                    ],
                    PrimaryKeyColumns = ["id"],
                    RowCount = 2,
                },
            ],
        };

        var target = new TargetDatabaseSchema
        {
            Tables =
            [
                new TargetTableInfo
                {
                    Schema = "public",
                    Name = "patients",
                    Columns =
                    [
                        TargetColumn("id", typeof(Guid), primaryKey: true),
                        TargetColumn("first_name", typeof(string)),
                        TargetColumn("last_name", typeof(string)),
                        TargetColumn("date_of_birth", typeof(DateOnly), nullable: true),
                    ],
                },
            ],
        };

        var plan = new MappingEngine().Build(source, target);
        var mapping = Assert.Single(plan.TableMappings);

        Assert.Equal("patients", mapping.TargetTableName);
        Assert.Equal("mapped", mapping.Status);
        Assert.Contains(mapping.ColumnMappings, c => c.TargetColumn == "id" && c.Action == "generated_uuid");
        Assert.Contains(mapping.ColumnMappings, c => c.TargetColumn == "first_name" && c.SourceColumn == "fname");
    }

    [Fact]
    public void MappingEngine_OrdersPrincipalTablesBeforeDependents()
    {
        var source = new DatabaseSchema
        {
            Tables =
            [
                SourceTable("legacy_addresses", ["id", "patient_id", "city"]),
                SourceTable("legacy_patients", ["id", "first_name", "last_name"]),
            ],
        };

        var target = new TargetDatabaseSchema
        {
            Tables =
            [
                new TargetTableInfo
                {
                    Schema = "public",
                    Name = "patient_addresses",
                    Columns =
                    [
                        TargetColumn("id", typeof(Guid), primaryKey: true),
                        TargetColumn("patient_id", typeof(Guid), foreignKey: true, principalTable: "patients"),
                        TargetColumn("city", typeof(string), nullable: true),
                    ],
                    ForeignKeys =
                    [
                        new TargetForeignKeyInfo
                        {
                            ColumnName = "patient_id",
                            PrincipalTable = "patients",
                            PrincipalColumn = "id",
                        },
                    ],
                },
                new TargetTableInfo
                {
                    Schema = "public",
                    Name = "patients",
                    Columns =
                    [
                        TargetColumn("id", typeof(Guid), primaryKey: true),
                        TargetColumn("first_name", typeof(string)),
                        TargetColumn("last_name", typeof(string)),
                    ],
                },
            ],
        };

        var plan = new MappingEngine().Build(source, target);

        var order = plan.TargetInsertOrder.ToArray();
        Assert.True(
            Array.IndexOf(order, "patients") < Array.IndexOf(order, "patient_addresses"),
            "patients must be inserted before patient_addresses");
    }

    private static SourceTableInfo SourceTable(string name, IReadOnlyList<string> columns)
    {
        return new SourceTableInfo
        {
            Schema = "public",
            Name = name,
            Columns = columns.Select((column, index) => Column(column, index + 1)).ToArray(),
            PrimaryKeyColumns = columns.Contains("id", StringComparer.OrdinalIgnoreCase) ? ["id"] : [],
        };
    }

    private static SourceColumnInfo Column(string name, int ordinal)
    {
        return new SourceColumnInfo
        {
            Name = name,
            Ordinal = ordinal,
            DataType = "text",
            UdtName = "text",
            IsNullable = true,
        };
    }

    private static TargetColumnInfo TargetColumn(
        string name,
        Type type,
        bool nullable = false,
        bool primaryKey = false,
        bool foreignKey = false,
        string? principalTable = null,
        int? maxLength = null)
    {
        return new TargetColumnInfo
        {
            Name = name,
            ClrType = type,
            IsNullable = nullable,
            IsPrimaryKey = primaryKey,
            IsForeignKey = foreignKey,
            PrincipalTable = principalTable,
            MaxLength = maxLength,
        };
    }

    private static SourceRow SourceRow(SourceTableInfo table, int ordinal, Dictionary<string, object?> values)
    {
        return new SourceRow
        {
            Table = table,
            Ordinal = ordinal,
            Values = values,
        };
    }

    private static object InvokeConvertValue(
        object? sourceValue,
        TargetColumnInfo targetColumn,
        SourceRow row,
        TableMapping mapping,
        string? transform = null)
    {
        var method = typeof(MigrationRunner).GetMethod("ConvertValue", BindingFlags.NonPublic | BindingFlags.Static);
        Assert.NotNull(method);
        return method.Invoke(null, [sourceValue, targetColumn, row, mapping, transform])!;
    }

    private static RowTransformResult InvokeTransformRow(
        SourceRow row,
        TableMapping mapping,
        DatabaseSchema sourceSchema,
        TargetDatabaseSchema targetSchema,
        MappingPlan plan,
        Dictionary<string, IdMapEntry> idMap,
        object uniqueValueTracker,
        object? sourceRowLookup = null)
    {
        var runner = new MigrationRunner(null!, null!, null!, null!, null!, null!, null!);
        var method = typeof(MigrationRunner)
            .GetMethods(BindingFlags.NonPublic | BindingFlags.Instance)
            .Single(method => method.Name == "TransformRow" && method.GetParameters().Length == 8);
        Assert.NotNull(method);
        return Assert.IsType<RowTransformResult>(method.Invoke(
            runner,
            [row, mapping, sourceSchema, targetSchema, plan, idMap, uniqueValueTracker, sourceRowLookup ?? CreateSourceRowLookup()]));
    }

    private static object CreateUniqueValueTracker()
    {
        var trackerType = typeof(MigrationRunner).GetNestedType("UniqueValueTracker", BindingFlags.NonPublic);
        Assert.NotNull(trackerType);
        return Activator.CreateInstance(trackerType, nonPublic: true)!;
    }

    private static object CreateSourceRowLookup(params SourceRow[] rows)
    {
        var lookupType = typeof(MigrationRunner).GetNestedType("SourceRowLookup", BindingFlags.NonPublic);
        Assert.NotNull(lookupType);
        var lookup = Activator.CreateInstance(lookupType, nonPublic: true)!;
        var addMethod = lookupType.GetMethod("Add");
        Assert.NotNull(addMethod);

        foreach (var row in rows)
            addMethod.Invoke(lookup, [row]);

        return lookup;
    }
}
