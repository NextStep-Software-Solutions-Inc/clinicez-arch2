using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace ClinicEz.Clinic.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "public");

            migrationBuilder.AlterDatabase()
                .Annotation("Npgsql:PostgresExtension:btree_gist", ",,")
                .Annotation("Npgsql:PostgresExtension:pg_trgm", ",,");

            migrationBuilder.CreateTable(
                name: "AuditEntries",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Timestamp = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Action = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ActorStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    ActorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ActorRole = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClientIpAddress = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UserAgent = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    TargetEntityType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    TargetEntityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientNameMasked = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    PatientPinMasked = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Outcome = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    MetadataJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomFieldDefinitions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    EntityType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    FieldKey = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Label = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DataType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsRequired = table.Column<bool>(type: "boolean", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    OptionsJson = table.Column<string>(type: "text", nullable: true),
                    Placeholder = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    VisibilityRuleJson = table.Column<string>(type: "text", nullable: true),
                    ConditionalOptionsJson = table.Column<string>(type: "text", nullable: true),
                    BoundaryMode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CustomFieldDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DataProtectionKeys",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    FriendlyName = table.Column<string>(type: "text", nullable: true),
                    Xml = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DataProtectionKeys", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DoctorLeaves",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PartialDayStartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    PartialDayEndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    LeaveType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorLeaves", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DoctorScheduleOverrides",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Date = table.Column<DateOnly>(type: "date", nullable: false),
                    IsWorking = table.Column<bool>(type: "boolean", nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    IsOvernightShift = table.Column<bool>(type: "boolean", nullable: false),
                    SlotDurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    Reason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorScheduleOverrides", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DoctorScheduleTemplates",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DayOfWeek = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    IsOvernightShift = table.Column<bool>(type: "boolean", nullable: false),
                    SlotDurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    MaxPatientsPerSlot = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    EffectiveStartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EffectiveEndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorScheduleTemplates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EodReconciliationAudits",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReconciliationDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ReconciledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    TriggerType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReconciledBy = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    StaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    TotalTicketsProcessed = table.Column<int>(type: "integer", nullable: false),
                    AffectedTicketNumbersJson = table.Column<string>(type: "text", nullable: false),
                    Notes = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EodReconciliationAudits", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "IdempotencyRecords",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Scope = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Key = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Method = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Path = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    RequestHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    StatusCode = table.Column<int>(type: "integer", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ResponseBody = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_IdempotencyRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "interop_inbox",
                schema: "public",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ProcessedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_interop_inbox", x => x.MessageId);
                });

            migrationBuilder.CreateTable(
                name: "interop_outbox",
                schema: "public",
                columns: table => new
                {
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Type = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    EnvelopeJson = table.Column<string>(type: "text", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false),
                    NextAttemptAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DispatchedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeadLetteredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastError = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_interop_outbox", x => x.MessageId);
                });

            migrationBuilder.CreateTable(
                name: "PatientCodeSequenceTrackers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Year = table.Column<int>(type: "integer", nullable: false),
                    CurrentSequence = table.Column<int>(type: "integer", nullable: false),
                    LastAssignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientCodeSequenceTrackers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Patients",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientCode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MiddleName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Suffix = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: false),
                    Sex = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Gender = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    GenderIdentity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CivilStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    BloodType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ContactNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AlternateContactNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    LandlineNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Email = table.Column<string>(type: "text", nullable: true),
                    Occupation = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EmergencyContactName = table.Column<string>(type: "text", nullable: true),
                    EmergencyContactNumber = table.Column<string>(type: "text", nullable: true),
                    EmergencyContactRelationship = table.Column<string>(type: "text", nullable: true),
                    PhilHealthNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    SeniorCitizenId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PwdId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CloudPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    ClinicEzId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    ShareGrantId = table.Column<Guid>(type: "uuid", nullable: true),
                    ShareGrantScopes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ShareGrantExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MaidenLastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PreferredName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Nationality = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Religion = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsDeceased = table.Column<bool>(type: "boolean", nullable: false),
                    DeceasedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CustomFields = table.Column<string>(type: "jsonb", nullable: false),
                    HasActiveSafetyAlert = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    SearchText = table.Column<string>(type: "text", nullable: true, computedColumnSql: "lower(coalesce(\"FirstName\", '') || ' ' || coalesce(\"LastName\", '') || ' ' || coalesce(\"MiddleName\", '') || ' ' || coalesce(\"PatientCode\", '') || ' ' || coalesce(\"ContactNumber\", '') || ' ' || coalesce(\"PhilHealthNumber\", '') || ' ' || coalesce(\"ClinicEzId\", ''))", stored: true),
                    VerificationStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Patients", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PhilHealthCatalogImportLogs",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Library = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    KitVersion = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ContentHash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Added = table.Column<int>(type: "integer", nullable: false),
                    Updated = table.Column<int>(type: "integer", nullable: false),
                    Unchanged = table.Column<int>(type: "integer", nullable: false),
                    Deactivated = table.Column<int>(type: "integer", nullable: false),
                    DuplicatesIgnored = table.Column<int>(type: "integer", nullable: false),
                    Message = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhilHealthCatalogImportLogs", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PhilHealthCatalogItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Library = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ItemKey = table.Column<string>(type: "character varying(160)", maxLength: 160, nullable: false),
                    Code = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Description = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    PhilHealthCode = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    RequiresSpecifyText = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    AttributesJson = table.Column<string>(type: "text", nullable: true),
                    KitVersion = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhilHealthCatalogItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PhilHealthDailySequences",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    AccreditationNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Prefix = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    ManilaDate = table.Column<DateOnly>(type: "date", nullable: false),
                    LastValue = table.Column<long>(type: "bigint", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhilHealthDailySequences", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PhilHealthSequenceTrackers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    SequenceType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    EffectiveYear = table.Column<string>(type: "text", nullable: false),
                    CurrentSequence = table.Column<int>(type: "integer", nullable: false),
                    LastAssignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PhilHealthSequenceTrackers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Products",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Sku = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Price = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PsgcLocations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PsgcCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    Name = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Level = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ParentPsgcCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    RegionPsgc = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ProvincePsgc = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    CityMunicipalityPsgc = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ZipCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PsgcLocations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Roles",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsSystem = table.Column<bool>(type: "boolean", nullable: false),
                    Permissions = table.Column<string>(type: "text", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Roles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Rooms",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    Code = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    Type = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Description = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Rooms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ServiceItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StandardPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    PhilHealthCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthDescription = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsPhilHealthFormulary = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsNurseOrderable = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ServiceItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Settings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantSlug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FacilitySlug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClinicName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TaxIdentificationNumber = table.Column<string>(type: "text", nullable: true),
                    AccreditationNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PmccNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SoftwareCertificateId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    KonsultaEndpoint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    PhilHealthSecretKey = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    PhilHealthBaseUrl = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsPhilHealthConfigured = table.Column<bool>(type: "boolean", nullable: false),
                    IsPhilHealthOverridden = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    BranchName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    BranchPhilHealthAccreditationNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BranchPmccNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BranchSoftwareCertificateId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BranchKonsultaEndpoint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    BranchPhilHealthSecretKey = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    BranchPhilHealthBaseUrl = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsBranchPhilHealthAccredited = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    LicenseToken = table.Column<string>(type: "text", nullable: true),
                    PlanTier = table.Column<string>(type: "text", nullable: false),
                    MaxStaffLimit = table.Column<int>(type: "integer", nullable: false),
                    LicenseExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EntitlementVersion = table.Column<int>(type: "integer", nullable: false),
                    OperatingHours = table.Column<string>(type: "text", nullable: false),
                    DefaultSlotDurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    QueuePrefix = table.Column<string>(type: "text", nullable: false),
                    InvoicePrefix = table.Column<string>(type: "text", nullable: false),
                    DefaultConsultationFee = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    VatRate = table.Column<decimal>(type: "numeric(5,4)", precision: 5, scale: 4, nullable: false),
                    DefaultDoctorSharePercentage = table.Column<decimal>(type: "numeric", nullable: false),
                    CashierMode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "ClinicDesk"),
                    LetterheadHeader = table.Column<string>(type: "text", nullable: true),
                    LetterheadSubHeader = table.Column<string>(type: "text", nullable: true),
                    LetterheadAddress = table.Column<string>(type: "text", nullable: true),
                    LetterheadContact = table.Column<string>(type: "text", nullable: true),
                    LetterheadDohLto = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LetterheadFooter = table.Column<string>(type: "text", nullable: true),
                    LetterheadAccentColorHex = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PrimaryColorHex = table.Column<string>(type: "text", nullable: false),
                    PrimaryLogoUrl = table.Column<string>(type: "text", nullable: true),
                    PaperSize = table.Column<string>(type: "text", nullable: false),
                    PreferredChartLayout = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "modal"),
                    IsJoinEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    JoinCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    JoinCodeExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsWorkspaceEligible = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsDirectoryPublished = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsOnlineBookingPaused = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PatientSearchDisplayFieldsJson = table.Column<string>(type: "text", nullable: true),
                    EodReconciliationTime = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "21:00"),
                    AutoEodEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    TvDisplayMaskPatientNames = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    TvDisplayPin = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EnableQueuePushNotifications = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    QueuePushNotificationThreshold = table.Column<int>(type: "integer", nullable: false, defaultValue: 2),
                    EnableChipLevelQueueCalling = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    StaffNotificationRetentionDays = table.Column<int>(type: "integer", nullable: false),
                    EnableStatAudioAlert = table.Column<bool>(type: "boolean", nullable: false),
                    EnableStatVibrationAlert = table.Column<bool>(type: "boolean", nullable: false),
                    SpecialtyMode = table.Column<string>(type: "text", nullable: true),
                    EnableDentalModule = table.Column<bool>(type: "boolean", nullable: false),
                    DefaultApproverName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DefaultApproverTitle = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DocumentSignatoriesJson = table.Column<string>(type: "text", nullable: true),
                    EnableAppointmentReminders = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    AppointmentReminder24hEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    AppointmentReminder2hEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    EnableStaffAppointmentNotifications = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    TimeZoneId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    DateFormat = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    TimeFormat = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    TeleconsultRecordingPolicy = table.Column<string>(type: "text", nullable: false),
                    TeleconsultRecordingRetentionDays = table.Column<int>(type: "integer", nullable: false),
                    TeleconsultRecordingConsentRequired = table.Column<bool>(type: "boolean", nullable: false),
                    TeleconsultPaymentPolicy = table.Column<string>(type: "text", nullable: false),
                    TeleconsultDefaultFee = table.Column<decimal>(type: "numeric", nullable: false),
                    TeleconsultAutoExemptYakap = table.Column<bool>(type: "boolean", nullable: false),
                    IsKioskIntakeEnabled = table.Column<bool>(type: "boolean", nullable: false),
                    KioskTokenVersion = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Settings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StaffNotifications",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RecipientStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecipientRole = table.Column<string>(type: "text", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Urgency = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ActionRoute = table.Column<string>(type: "text", nullable: true),
                    ActionParamsJson = table.Column<string>(type: "text", nullable: true),
                    SourceType = table.Column<string>(type: "text", nullable: true),
                    SourceId = table.Column<string>(type: "text", nullable: true),
                    IsRead = table.Column<bool>(type: "boolean", nullable: false),
                    ReadAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffNotifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "workspace_profiles",
                schema: "public",
                columns: table => new
                {
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TenantSlug = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Version = table.Column<long>(type: "bigint", nullable: false),
                    ProfileJson = table.Column<string>(type: "text", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_workspace_profiles", x => x.TenantId);
                });

            migrationBuilder.CreateTable(
                name: "DoctorBreakTimes",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TemplateId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    StartTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    EndTime = table.Column<TimeOnly>(type: "time without time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DoctorBreakTimes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DoctorBreakTimes_DoctorScheduleTemplates_TemplateId",
                        column: x => x.TemplateId,
                        principalSchema: "public",
                        principalTable: "DoctorScheduleTemplates",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Appointments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DraftId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorName = table.Column<string>(type: "text", nullable: true),
                    ScheduledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    DurationMinutes = table.Column<int>(type: "integer", nullable: false),
                    EndTimeUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    xmin = table.Column<uint>(type: "xid", rowVersion: true, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    VisitWorkflowMode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ServiceType = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Reason = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    ShareFieldsJson = table.Column<string>(type: "text", nullable: false),
                    AttachedFileIdsJson = table.Column<string>(type: "text", nullable: false),
                    SharedScopes = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SharedItemsJson = table.Column<string>(type: "text", nullable: false),
                    Reminder24hSent = table.Column<bool>(type: "boolean", nullable: false),
                    Reminder2hSent = table.Column<bool>(type: "boolean", nullable: false),
                    Reminder24hSentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Reminder2hSentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastReminderSentAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastReminderType = table.Column<string>(type: "text", nullable: true),
                    AppointmentType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PaymentPolicy = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PaymentStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: true),
                    InvoiceRequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    PaidAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PaymentReceiptNumber = table.Column<string>(type: "text", nullable: true),
                    PaymentMethod = table.Column<string>(type: "text", nullable: true),
                    IsEmergencyOverride = table.Column<bool>(type: "boolean", nullable: false),
                    EmergencyOverrideReasonCode = table.Column<string>(type: "text", nullable: true),
                    EmergencyOverrideReasonNote = table.Column<string>(type: "text", nullable: true),
                    EmergencyOverrideDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    EmergencyOverrideDoctorName = table.Column<string>(type: "text", nullable: true),
                    EmergencyOverrideAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CallId = table.Column<Guid>(type: "uuid", nullable: true),
                    AdmittedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AdmittedByDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Appointments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Appointments_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DentalToothRecords",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToothNumber = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Surface = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ActiveSurface = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    IsCurrent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    SupersededAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SupersededByRecordId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecordedBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IsVoided = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    VoidedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VoidedBy = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    VoidReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_DentalToothRecords", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DentalToothRecords_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Invoices",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    InvoiceDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    IsWalkInRetail = table.Column<bool>(type: "boolean", nullable: false),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    AttendingDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    GrossAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    DiscountType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DiscountIdNumber = table.Column<string>(type: "text", nullable: true),
                    DiscountPercentage = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: false),
                    DiscountAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    NetAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    AmountPaid = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    RefundedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    BalanceDue = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    BilledByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    BilledByStaffName = table.Column<string>(type: "text", nullable: true),
                    BillingRequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Invoices_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "LabOrders",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OrderNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    OrderedByDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    OrderedByDoctorName = table.Column<string>(type: "text", nullable: true),
                    OrderDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ClinicalDiagnosis = table.Column<string>(type: "text", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    Stage = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StageChangedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    StageReportedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StageReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    QuotedAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    QuotedCurrency = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    PaymentRequired = table.Column<bool>(type: "boolean", nullable: false),
                    TargetTenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    TargetFacilityId = table.Column<Guid>(type: "uuid", nullable: true),
                    LaboratoryTenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LaboratoryFacilityId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LaboratoryName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClaimToken = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClaimExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ExternalLabName = table.Column<string>(type: "text", nullable: true),
                    ExternalReportUrl = table.Column<string>(type: "text", nullable: true),
                    ExternalReportType = table.Column<string>(type: "text", nullable: true),
                    UploadedBy = table.Column<string>(type: "text", nullable: true),
                    PathologistImpression = table.Column<string>(type: "text", nullable: true),
                    VerifiedByPathologist = table.Column<string>(type: "text", nullable: true),
                    PathologistPrcLicense = table.Column<string>(type: "text", nullable: true),
                    ReportReleasedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    HasCriticalPanicAlert = table.Column<bool>(type: "boolean", nullable: false),
                    PanicAlertTriggeredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PanicAcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PanicAcknowledgedBy = table.Column<string>(type: "text", nullable: true),
                    PhilHealthRequestTransNo = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: true),
                    RequestingPhysicianName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    RequestingPhysicianPrcNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RequestingPhysicianPan = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SignOffPhysicianName = table.Column<string>(type: "text", nullable: true),
                    SignOffPhysicianDesignation = table.Column<string>(type: "text", nullable: true),
                    SignOffPhysicianPrcNo = table.Column<string>(type: "text", nullable: true),
                    SignOffPhysicianPan = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabOrders", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LabOrders_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "MedicalCertificates",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CertificateNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PrcLicenseNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PtrNumber = table.Column<string>(type: "text", nullable: true),
                    IssueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Diagnosis = table.Column<string>(type: "text", nullable: false),
                    ClinicalFindings = table.Column<string>(type: "text", nullable: true),
                    FitnessStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RecommendedRestDays = table.Column<int>(type: "integer", nullable: true),
                    RestStartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    RestEndDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    IsSigned = table.Column<bool>(type: "boolean", nullable: false),
                    SignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SecurityDigest = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MedicalCertificates", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MedicalCertificates_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "NcdRiskAssessments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssessmentDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AssessedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssessedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    EatsProcessedFoodWeekly = table.Column<bool>(type: "boolean", nullable: true),
                    ThreeServingsVegetablesDaily = table.Column<bool>(type: "boolean", nullable: true),
                    TwoToThreeServingsFruitDaily = table.Column<bool>(type: "boolean", nullable: true),
                    PhysicalActivityAtLeast150MinsWeekly = table.Column<bool>(type: "boolean", nullable: true),
                    DiagnosedDiabetes = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    HasPolyphagia = table.Column<bool>(type: "boolean", nullable: true),
                    HasPolydipsia = table.Column<bool>(type: "boolean", nullable: true),
                    HasPolyuria = table.Column<bool>(type: "boolean", nullable: true),
                    DiabetesMedicationStatus = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    HasRaisedBloodGlucose = table.Column<bool>(type: "boolean", nullable: true),
                    FastingBloodSugarMgDl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    FastingBloodSugarMmolL = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    FastingBloodSugarDate = table.Column<DateOnly>(type: "date", nullable: true),
                    HasChestPain = table.Column<bool>(type: "boolean", nullable: true),
                    PainInCenterOfChestOrLeftArm = table.Column<bool>(type: "boolean", nullable: true),
                    PainWhenWalkingUphill = table.Column<bool>(type: "boolean", nullable: true),
                    SlowsDownWhenPainOccurs = table.Column<bool>(type: "boolean", nullable: true),
                    PainRelievedWithin10Mins = table.Column<bool>(type: "boolean", nullable: true),
                    PainRelievedByNitrates = table.Column<bool>(type: "boolean", nullable: true),
                    PainRelievedWithin10MinsOrNitrates = table.Column<bool>(type: "boolean", nullable: true),
                    SevereChestPainOver30Mins = table.Column<bool>(type: "boolean", nullable: true),
                    TransientNeurologicalDeficits = table.Column<bool>(type: "boolean", nullable: true),
                    HasRaisedBloodLipids = table.Column<bool>(type: "boolean", nullable: true),
                    TotalCholesterolMgDl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    TotalCholesterolDate = table.Column<DateOnly>(type: "date", nullable: true),
                    HasHistoryAnginaHeartAttack = table.Column<bool>(type: "boolean", nullable: true),
                    HasHistoryStrokeOrTia = table.Column<bool>(type: "boolean", nullable: true),
                    UrineKetonesPresent = table.Column<bool>(type: "boolean", nullable: true),
                    UrineKetonesValue = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UrineKetonesDate = table.Column<DateOnly>(type: "date", nullable: true),
                    UrineProteinPresent = table.Column<bool>(type: "boolean", nullable: true),
                    UrineProteinValue = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UrineProteinDate = table.Column<DateOnly>(type: "date", nullable: true),
                    RiskBand = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "BandA"),
                    CvdRiskLevelCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    HighSaltIntake = table.Column<bool>(type: "boolean", nullable: true),
                    CalculatedRiskScorePercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    VoidReason = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NcdRiskAssessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NcdRiskAssessments_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientAddresses",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    AddressType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    IsSameAsPermanent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    RegionPsgc = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ProvincePsgc = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    CityMunicipalityPsgc = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    BarangayPsgc = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    RegionName = table.Column<string>(type: "text", nullable: true),
                    ProvinceName = table.Column<string>(type: "text", nullable: true),
                    CityMunicipalityName = table.Column<string>(type: "text", nullable: true),
                    BarangayName = table.Column<string>(type: "text", nullable: true),
                    ZipCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    StreetAddress = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientAddresses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientAddresses_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientAlerts",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RecordedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecordedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientAlerts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientAlerts_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientAllergies",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Allergen = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    AllergenDrugCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReactionManifestation = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    IsAnaphylactic = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OnsetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientAllergies", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientAllergies_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientFamilyHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConditionTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Icd10Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SpecificDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Relationship = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    RelativeAgeAtOnset = table.Column<int>(type: "integer", nullable: true),
                    IsRelativeDeceased = table.Column<bool>(type: "boolean", nullable: true),
                    ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ConditionCategoryCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    FbsMgDl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    FbsMmolL = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    FbsDate = table.Column<DateOnly>(type: "date", nullable: true),
                    RbsMgDl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    RbsMmolL = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    RbsDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientFamilyHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientFamilyHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientGuardians",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PhilHealthPin = table.Column<string>(type: "character varying(12)", maxLength: 12, nullable: true),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MiddleName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Suffix = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    BirthDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Sex = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ContactNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    RelationshipCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    RelationshipOtherSpecify = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsPrimaryGuardian = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    IsEmergencyContact = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientGuardians", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientGuardians_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientHomeMedications",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    GenericDrugName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    BrandName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PhilHealthDrugCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DoseStrength = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Form = table.Column<string>(type: "text", nullable: true),
                    Route = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Frequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Duration = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsPndfListed = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PrescribingPhysicianName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: true),
                    StoppedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    Indication = table.Column<string>(type: "text", nullable: true),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientHomeMedications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientHomeMedications_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientHospitalizationHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReasonForAdmission = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    AdmissionDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DischargeDate = table.Column<DateOnly>(type: "date", nullable: true),
                    AdmissionYear = table.Column<int>(type: "integer", nullable: true),
                    PrimaryIcd10Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    HospitalFacilityName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    AttendingPhysicianName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    DischargeDisposition = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClinicalSummaryNotes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientHospitalizationHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientHospitalizationHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientImmunizations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    VaccineCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VaccineName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PhilHealthLibrary = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PhilHealthVaccinationStatusCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    BrandName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Manufacturer = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    LotBatchNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExpirationDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DoseSequence = table.Column<int>(type: "integer", nullable: false),
                    TotalDosesInSeries = table.Column<int>(type: "integer", nullable: true),
                    NextDueDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsSeriesCompleted = table.Column<bool>(type: "boolean", nullable: false),
                    Route = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    InjectionSite = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    AdministeredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AdministeredByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    AdministeredByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    AdministeredByPrcLicense = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HasAdverseReaction = table.Column<bool>(type: "boolean", nullable: false),
                    AdverseReactionSeverity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "None"),
                    AdverseReactionRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AdverseReactionRecordedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsHistorical = table.Column<bool>(type: "boolean", nullable: false),
                    HistoricalFacilityName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    IsSynchronizedToPatientApp = table.Column<bool>(type: "boolean", nullable: false),
                    SynchronizedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientImmunizations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientImmunizations_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientInjuryHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    InjuryDescription = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    InjuryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    InjuryYear = table.Column<int>(type: "integer", nullable: true),
                    MechanismOfInjury = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    BodySite = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Icd10ExternalCauseCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    TreatedAtFacilityName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ResidualSequelae = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientInjuryHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientInjuryHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientPhilHealthMemberships",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    MemberType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DependentRelationship = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    MemberPin = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    PrincipalMemberPin = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PrincipalLastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PrincipalFirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PrincipalMiddleName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PrincipalSuffix = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PrincipalDateOfBirth = table.Column<DateOnly>(type: "date", nullable: true),
                    PrincipalGender = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    MembershipCategoryCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    MembershipCategoryDesc = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    EmployerPin = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    EmployerName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    DefaultWalkInAtc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PrincipalMemberLandlineNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    PrincipalMemberMobileNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    PrincipalMemberEmail = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientPhilHealthMemberships", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientPhilHealthMemberships_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientReproductiveHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsApplicable = table.Column<bool>(type: "boolean", nullable: false),
                    MenarcheAge = table.Column<int>(type: "integer", nullable: true),
                    CoitarcheAge = table.Column<int>(type: "integer", nullable: true),
                    LastMenstrualPeriod = table.Column<DateOnly>(type: "date", nullable: true),
                    PeriodDurationDays = table.Column<int>(type: "integer", nullable: true),
                    CycleIntervalDays = table.Column<int>(type: "integer", nullable: true),
                    PadsPerDay = table.Column<int>(type: "integer", nullable: true),
                    IsMenopausal = table.Column<bool>(type: "boolean", nullable: false),
                    MenopauseAge = table.Column<int>(type: "integer", nullable: true),
                    ContraceptiveMethod = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    IsCurrentlyPregnant = table.Column<bool>(type: "boolean", nullable: false),
                    ExpectedDeliveryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    LastPapSmearDate = table.Column<DateOnly>(type: "date", nullable: true),
                    LastMammogramDate = table.Column<DateOnly>(type: "date", nullable: true),
                    Gravidity = table.Column<int>(type: "integer", nullable: false),
                    Parity = table.Column<int>(type: "integer", nullable: false),
                    TermBirths = table.Column<int>(type: "integer", nullable: false),
                    PretermBirths = table.Column<int>(type: "integer", nullable: false),
                    Abortions = table.Column<int>(type: "integer", nullable: false),
                    LivingChildren = table.Column<int>(type: "integer", nullable: false),
                    DeliveryType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HadPreEclampsiaHypertension = table.Column<bool>(type: "boolean", nullable: false),
                    ReceivedFamilyPlanningCounseling = table.Column<bool>(type: "boolean", nullable: false),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    HasMenarche = table.Column<bool>(type: "boolean", nullable: true),
                    HasLastMenstrualPeriod = table.Column<bool>(type: "boolean", nullable: true),
                    IsMenstrualRegular = table.Column<bool>(type: "boolean", nullable: true),
                    HasDysmenorrhea = table.Column<bool>(type: "boolean", nullable: true),
                    DysmenorrheaSeverity = table.Column<string>(type: "text", nullable: true),
                    ContraceptiveUseStatusCode = table.Column<string>(type: "text", nullable: true),
                    DesiredContraceptiveMethodCodes = table.Column<string>(type: "text", nullable: true),
                    LastPapSmearYear = table.Column<int>(type: "integer", nullable: true),
                    LastPapSmearResult = table.Column<string>(type: "text", nullable: true),
                    LastMammogramYear = table.Column<int>(type: "integer", nullable: true),
                    LastMammogramResult = table.Column<string>(type: "text", nullable: true),
                    MiscarriagesCount = table.Column<int>(type: "integer", nullable: false),
                    EctopicCount = table.Column<int>(type: "integer", nullable: false),
                    StillbirthsCount = table.Column<int>(type: "integer", nullable: false),
                    HadGestationalDiabetes = table.Column<bool>(type: "boolean", nullable: false),
                    HadPostpartumHemorrhage = table.Column<bool>(type: "boolean", nullable: false),
                    PreviousCsCount = table.Column<int>(type: "integer", nullable: true),
                    LastDeliveryYear = table.Column<int>(type: "integer", nullable: true),
                    PrenatalCheckupCountCode = table.Column<string>(type: "text", nullable: true),
                    AgeOfGestation = table.Column<string>(type: "text", nullable: true),
                    HasGynecologicalDisease = table.Column<bool>(type: "boolean", nullable: true),
                    GynecologicalDiseaseSpec = table.Column<string>(type: "text", nullable: true),
                    HasGynecologicalSti = table.Column<bool>(type: "boolean", nullable: true),
                    GynecologicalStiSpec = table.Column<string>(type: "text", nullable: true),
                    MenstrualFrequencyCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    VisualInspectionAceticAcidYear = table.Column<int>(type: "integer", nullable: true),
                    HpvDnaTestYear = table.Column<int>(type: "integer", nullable: true),
                    ClinicalBreastExamYear = table.Column<int>(type: "integer", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientReproductiveHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientReproductiveHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientSexualHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsentStatusCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    EverHadSex = table.Column<bool>(type: "boolean", nullable: false),
                    AgeAtFirstSexualContact = table.Column<int>(type: "integer", nullable: true),
                    IsSexuallyActive = table.Column<bool>(type: "boolean", nullable: false),
                    PartnerCountLastYear = table.Column<int>(type: "integer", nullable: true),
                    PartnerTypes = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    HasMalePartnerActivity = table.Column<bool>(type: "boolean", nullable: true),
                    MalePartnerRecentAnalNeovagYm = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    MalePartnerRecentCondomlessYm = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    HasFemalePartnerActivity = table.Column<bool>(type: "boolean", nullable: true),
                    FemalePartnerRecentAnalNeovagYm = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    FemalePartnerRecentCondomlessYm = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    SexualRiskBehaviorCodes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    RecentRiskMonthYear = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    OtherRiskConcernsSpec = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                    HasStiHistory = table.Column<bool>(type: "boolean", nullable: true),
                    StiSpecification = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                    LastHivScreenMonthYear = table.Column<string>(type: "character varying(7)", maxLength: 7, nullable: true),
                    SexualPractices = table.Column<string>(type: "text", nullable: true),
                    ContraceptiveMethodsUsed = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    SexualViolenceHistory = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientSexualHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientSexualHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientSocialHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsSmoker = table.Column<bool>(type: "boolean", nullable: false),
                    PacksPerDay = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CigarettesPerDay = table.Column<int>(type: "integer", nullable: true),
                    YearsSmoking = table.Column<int>(type: "integer", nullable: true),
                    SmokingPackYears = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    SmokingStoppedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    TobaccoType = table.Column<string>(type: "text", nullable: true),
                    IsAlcoholDrinker = table.Column<bool>(type: "boolean", nullable: false),
                    AlcoholDrinksPerWeek = table.Column<int>(type: "integer", nullable: true),
                    AlcoholBottlesPerDay = table.Column<int>(type: "integer", nullable: true),
                    AlcoholFrequency = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    UsesIllicitDrugs = table.Column<bool>(type: "boolean", nullable: false),
                    SubstanceUseHistory = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DrugTypes = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsSexuallyActive = table.Column<bool>(type: "boolean", nullable: false),
                    CoitarcheAge = table.Column<int>(type: "integer", nullable: true),
                    PhysicalActivityFrequency = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ExerciseMinutesPerWeek = table.Column<int>(type: "integer", nullable: true),
                    SleepHoursPerNight = table.Column<int>(type: "integer", nullable: true),
                    DietaryHabits = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Occupation = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Industry = table.Column<string>(type: "text", nullable: true),
                    EducationLevel = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    LivingArrangement = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    EducationAttainmentCode = table.Column<string>(type: "text", nullable: true),
                    EmploymentStatusCode = table.Column<string>(type: "text", nullable: true),
                    SecondhandSmokeExposureCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    SmokingStartYear = table.Column<int>(type: "integer", nullable: true),
                    SmokingQuitYear = table.Column<int>(type: "integer", nullable: true),
                    IsCurrentVapeUser = table.Column<bool>(type: "boolean", nullable: true),
                    CurrentVapeYears = table.Column<int>(type: "integer", nullable: true),
                    IsFormerVapeUser = table.Column<bool>(type: "boolean", nullable: true),
                    FormerVapeYears = table.Column<int>(type: "integer", nullable: true),
                    VapeDeviceCode = table.Column<string>(type: "text", nullable: true),
                    NicotineConcentrationMg = table.Column<decimal>(type: "numeric", nullable: true),
                    AlcoholDrinkerSubtypeCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    AlcoholTypeCodes = table.Column<string>(type: "text", nullable: true),
                    AlcoholGlassesPerOccasion = table.Column<int>(type: "integer", nullable: true),
                    AlcoholIntakeYears = table.Column<int>(type: "integer", nullable: true),
                    AlcoholStartYear = table.Column<int>(type: "integer", nullable: true),
                    AlcoholQuitYear = table.Column<int>(type: "integer", nullable: true),
                    CurrentSubstanceSpec = table.Column<string>(type: "text", nullable: true),
                    FormerSubstanceSpec = table.Column<string>(type: "text", nullable: true),
                    FamilySubstanceAbuseHistory = table.Column<string>(type: "text", nullable: true),
                    DietaryIntakeCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    BreastfeedingStatusCode = table.Column<string>(type: "text", nullable: true),
                    IsPhysicallyActive = table.Column<bool>(type: "boolean", nullable: false),
                    ModerateActivityMinutesPerWeek = table.Column<int>(type: "integer", nullable: true),
                    VigorousActivityMinutesPerWeek = table.Column<int>(type: "integer", nullable: true),
                    CaffeineCupsPerDay = table.Column<decimal>(type: "numeric", nullable: true),
                    StressRating = table.Column<string>(type: "text", nullable: true),
                    StressCauses = table.Column<string>(type: "text", nullable: true),
                    UsesFluorideToothpaste = table.Column<bool>(type: "boolean", nullable: false),
                    DentalCheckupStatusCode = table.Column<string>(type: "text", nullable: true),
                    LastDentalCheckupYear = table.Column<int>(type: "integer", nullable: true),
                    NeighborhoodCommunicableDisease = table.Column<string>(type: "text", nullable: true),
                    MentalHealthEventCode = table.Column<string>(type: "text", nullable: true),
                    OtherMentalHealthEvent = table.Column<string>(type: "text", nullable: true),
                    DietCodes = table.Column<string>(type: "text", nullable: true),
                    ImmunizationSummaryCode = table.Column<string>(type: "text", nullable: true),
                    SmokingFreqCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    AlcoholFreqCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    IllicitDrugUseCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    SexuallyActiveCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    PartnersGenderCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    PhysicalActivityCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    WaterSourceCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ToiletFacilityCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    SmokingStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    AlcoholStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientSocialHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientSocialHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientSurgicalHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProcedureName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ProcedureCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SurgeryDate = table.Column<DateOnly>(type: "date", nullable: true),
                    SurgeryYear = table.Column<int>(type: "integer", nullable: true),
                    BodySite = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Laterality = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SurgeonName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    AnesthesiaType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    HospitalName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Findings = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Complications = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientSurgicalHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientSurgicalHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "RecordAttachments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecordType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Title = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StorageUri = table.Column<string>(type: "text", nullable: false),
                    DocumentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    UploadedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    UploadedByStaffName = table.Column<string>(type: "text", nullable: true),
                    VerificationStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Verified"),
                    RejectionReason = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VerifiedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    VerifiedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    EncryptionAlgorithm = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "AES-256-GCM"),
                    EncryptionKeyId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EncryptionIvBase64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EncryptionTagBase64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EncryptedSizeBytes = table.Column<long>(type: "bigint", nullable: true),
                    EncryptedHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    WrappedKeyJson = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecordAttachments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RecordAttachments_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ReferralLetters",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferralNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReferringDoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReferringDoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ReferredToDoctor = table.Column<string>(type: "text", nullable: true),
                    ReferredToFacility = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ReferredDepartment = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ReferralDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Urgency = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReasonForReferral = table.Column<string>(type: "text", nullable: false),
                    ProvisionalDiagnosis = table.Column<string>(type: "text", nullable: false),
                    ClinicalSummary = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: false),
                    CurrentMedications = table.Column<string>(type: "text", nullable: true),
                    AttachedDiagnostics = table.Column<string>(type: "text", nullable: true),
                    IsSigned = table.Column<bool>(type: "boolean", nullable: false),
                    SignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SecurityDigest = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ReferringDoctorPrcNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthReferralTransNo = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: true),
                    ReferralTypeCodes = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PrimaryCareServiceCodes = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FacilityServiceCodes = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SpecialistType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SpecialistOtherSpecify = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    OthersSpecify = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ReceivingFacilityAccreditationNo = table.Column<string>(type: "text", nullable: true),
                    ReferringDoctorDesignation = table.Column<string>(type: "text", nullable: true),
                    ReferringDoctorPhilHealthPan = table.Column<string>(type: "text", nullable: true),
                    TransportMode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    VitalSignsSummary = table.Column<string>(type: "text", nullable: true),
                    TreatmentGiven = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ReferralLetters", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReferralLetters_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "ShareImports",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AddToQueue = table.Column<bool>(type: "boolean", nullable: false),
                    ChiefComplaint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DenialReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DenialCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    ClinicEzId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    GrantId = table.Column<Guid>(type: "uuid", nullable: true),
                    Scopes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    GrantExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ItemsImported = table.Column<int>(type: "integer", nullable: false),
                    RedemptionNumber = table.Column<int>(type: "integer", nullable: true),
                    MaxRedemptions = table.Column<int>(type: "integer", nullable: true),
                    IsRefresh = table.Column<bool>(type: "boolean", nullable: false),
                    ItemsJson = table.Column<string>(type: "text", nullable: true),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    QueueNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    RequestedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CompletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShareImports", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ShareImports_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StaffMembers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ClinicRoleId = table.Column<Guid>(type: "uuid", nullable: true),
                    AssignedRoomIdsJson = table.Column<string>(type: "text", nullable: true),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MiddleName = table.Column<string>(type: "text", nullable: true),
                    Title = table.Column<string>(type: "text", nullable: true),
                    Role = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Email = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    PhoneNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PrcLicenseNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PtrNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    S2LicenseNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Specialty = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PhilHealthPan = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SignatureSpecimen = table.Column<string>(type: "text", nullable: true),
                    DefaultSignatureMode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Active"),
                    InvitationToken = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    InvitationExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    InviteAcceptedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PasswordHash = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    MustChangePassword = table.Column<bool>(type: "boolean", nullable: false),
                    FailedLoginCount = table.Column<int>(type: "integer", nullable: false),
                    LockoutEnd = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastLoginAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TokenVersion = table.Column<int>(type: "integer", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StaffMembers_Roles_ClinicRoleId",
                        column: x => x.ClinicRoleId,
                        principalSchema: "public",
                        principalTable: "Roles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Procedures",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProcedureCode = table.Column<string>(type: "text", nullable: true),
                    ProcedureName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    OrderedByDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    OrderedByDoctorName = table.Column<string>(type: "text", nullable: true),
                    PerformedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    PerformedByStaffName = table.Column<string>(type: "text", nullable: true),
                    PerformedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ScheduledAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PreProcedureVitalsJson = table.Column<string>(type: "text", nullable: true),
                    PostProcedureVitalsJson = table.Column<string>(type: "text", nullable: true),
                    MedicationAdministered = table.Column<string>(type: "text", nullable: true),
                    LotNumber = table.Column<string>(type: "text", nullable: true),
                    ExpirationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SiteRoute = table.Column<string>(type: "text", nullable: true),
                    ClinicalNotes = table.Column<string>(type: "text", nullable: true),
                    Complications = table.Column<string>(type: "text", nullable: true),
                    TargetRoomId = table.Column<Guid>(type: "uuid", nullable: true),
                    TargetRoomName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ToothNumber = table.Column<int>(type: "integer", nullable: true),
                    ToothSurface = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Procedures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Procedures_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Procedures_Rooms_TargetRoomId",
                        column: x => x.TargetRoomId,
                        principalSchema: "public",
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "QueueItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueNumber = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SequenceNumber = table.Column<int>(type: "integer", nullable: false),
                    QueueDate = table.Column<DateOnly>(type: "date", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    RoomId = table.Column<Guid>(type: "uuid", nullable: true),
                    RoomOrStation = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Priority = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    VisitWorkflowMode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CheckInTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CalledTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ChiefComplaint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    CloudPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    ApproachingNotificationSent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CalledNotificationSent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    VisitType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Consultation"),
                    DischargeNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    DischargedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DischargedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    DivertedToFacility = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    TransportMode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ParamedicOrEscortName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    HandoverSummary = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    DivertedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DivertedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_QueueItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QueueItems_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalSchema: "public",
                        principalTable: "Appointments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QueueItems_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_QueueItems_Rooms_RoomId",
                        column: x => x.RoomId,
                        principalSchema: "public",
                        principalTable: "Rooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "InvoiceLineItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ServiceItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ItemCode = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    TotalPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InvoiceLineItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_InvoiceLineItems_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalSchema: "public",
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Payments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    PaymentNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PaymentDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Method = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReferenceNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ReceivedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    ReceivedByStaffName = table.Column<string>(type: "text", nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Payments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Payments_Invoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalSchema: "public",
                        principalTable: "Invoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LabOrderItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    TestName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Instructions = table.Column<string>(type: "text", nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PhilHealthServiceCode = table.Column<string>(type: "text", nullable: true),
                    TestCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PhilHealthResultTransNo = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: true),
                    LoincCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsPhysicianRecommended = table.Column<bool>(type: "boolean", nullable: false),
                    PatientComplianceCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DiagnosticFee = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    IsDoneOutsideFacility = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ExternalFacilityName = table.Column<string>(type: "text", nullable: true),
                    PerformedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PathologistRadiologistName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    PathologistRadiologistPrcNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PathologistPan = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RecommendationCode = table.Column<string>(type: "text", nullable: true),
                    ClientConsentCode = table.Column<string>(type: "text", nullable: true),
                    UnlistedTestSpecification = table.Column<string>(type: "text", nullable: true),
                    PhilHealthTestStatusCode = table.Column<string>(type: "text", nullable: true),
                    TestLocationCode = table.Column<string>(type: "text", nullable: true),
                    ResultRemarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabOrderItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LabOrderItems_LabOrders_LabOrderId",
                        column: x => x.LabOrderId,
                        principalSchema: "public",
                        principalTable: "LabOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LabResults",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReportId = table.Column<Guid>(type: "uuid", nullable: true),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Verification = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ExternalLabName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    Notes = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    FileName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    ContentType = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FileSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(400)", maxLength: 400, nullable: true),
                    EncryptionIvBase64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    EncryptionTagBase64 = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    WrappedKeyJson = table.Column<string>(type: "text", nullable: true),
                    EncryptedHash = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    UploadedByPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    VerifiedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    VerifiedByName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    VerifiedByPrc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VerifiedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReviewRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabResults", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LabResults_LabOrders_LabOrderId",
                        column: x => x.LabOrderId,
                        principalSchema: "public",
                        principalTable: "LabOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "UploadGrants",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<byte[]>(type: "bytea", maxLength: 32, nullable: false),
                    Kind = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    MaxUploads = table.Column<int>(type: "integer", nullable: false),
                    Used = table.Column<int>(type: "integer", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_UploadGrants", x => x.Id);
                    table.ForeignKey(
                        name: "FK_UploadGrants_LabOrders_LabOrderId",
                        column: x => x.LabOrderId,
                        principalSchema: "public",
                        principalTable: "LabOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PatientIdentityVerifications",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    VerificationDate = table.Column<DateOnly>(type: "date", nullable: false),
                    Mode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PcuTransactionId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PcuStatusCode = table.Column<int>(type: "integer", nullable: true),
                    PcuAuthorizationId = table.Column<string>(type: "text", nullable: true),
                    PcuLaunchUrl = table.Column<string>(type: "text", nullable: true),
                    PcuResultCode = table.Column<string>(type: "text", nullable: true),
                    PcuPinMatched = table.Column<bool>(type: "boolean", nullable: true),
                    OneTimePin = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    OtpValidationStatus = table.Column<string>(type: "text", nullable: true),
                    ValidIdTypeCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    ValidIdNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ValidIdAttachmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ValidIdTransmittedOnDate = table.Column<bool>(type: "boolean", nullable: false),
                    VerifiedManilaDate = table.Column<DateOnly>(type: "date", nullable: true),
                    FirstUploadedOnDate = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    VerifiedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VerifiedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    VerifiedByStaffName = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientIdentityVerifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientIdentityVerifications_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PatientIdentityVerifications_RecordAttachments_ValidIdAttac~",
                        column: x => x.ValidIdAttachmentId,
                        principalSchema: "public",
                        principalTable: "RecordAttachments",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    TokenHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    FamilyId = table.Column<Guid>(type: "uuid", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    RevokedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ReplacedByTokenId = table.Column<Guid>(type: "uuid", nullable: true),
                    DeviceLabel = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RefreshTokens", x => x.Id);
                    table.ForeignKey(
                        name: "FK_RefreshTokens_StaffMembers_StaffMemberId",
                        column: x => x.StaffMemberId,
                        principalSchema: "public",
                        principalTable: "StaffMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "LabObservations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    LabOrderId = table.Column<Guid>(type: "uuid", nullable: false),
                    LabOrderItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    LoincCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    AnalyteCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    AnalyteName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ValueText = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: false),
                    NumericValue = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    Unit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ReferenceRangeLow = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    ReferenceRangeHigh = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    AbnormalFlag = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    IsCriticalPanic = table.Column<bool>(type: "boolean", nullable: false),
                    ReferenceRangeText = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Method = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PerformedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ValueConventional = table.Column<decimal>(type: "numeric(18,4)", precision: 18, scale: 4, nullable: true),
                    UnitConventional = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ValueSi = table.Column<decimal>(type: "numeric", nullable: true),
                    UnitSi = table.Column<string>(type: "text", nullable: true),
                    QualitativeCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    FindingCode = table.Column<string>(type: "text", nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_LabObservations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_LabObservations_LabOrderItems_LabOrderItemId",
                        column: x => x.LabOrderItemId,
                        principalSchema: "public",
                        principalTable: "LabOrderItems",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_LabObservations_LabOrders_LabOrderId",
                        column: x => x.LabOrderId,
                        principalSchema: "public",
                        principalTable: "LabOrders",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Consultations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    EncounterDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Subjective = table.Column<string>(type: "text", nullable: false),
                    Objective = table.Column<string>(type: "text", nullable: false),
                    Assessment = table.Column<string>(type: "text", nullable: false),
                    Plan = table.Column<string>(type: "text", nullable: false),
                    HomeInstructions = table.Column<string>(type: "text", nullable: true),
                    DoctorPrcLicense = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DoctorPtr = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DoctorS2License = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsSigned = table.Column<bool>(type: "boolean", nullable: false),
                    SignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    VisitWorkflowMode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsYakapEligible = table.Column<bool>(type: "boolean", nullable: false),
                    PhilHealthSignSympCode = table.Column<string>(type: "text", nullable: true),
                    PhilHealthOtherComplaint = table.Column<string>(type: "text", nullable: true),
                    PhilHealthPainSite = table.Column<string>(type: "text", nullable: true),
                    PhilHealthCaseNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthSoapTransNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DoctorPhilHealthPan = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthAtc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsWalkedIn = table.Column<bool>(type: "boolean", nullable: false),
                    HasCoPayment = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CoPaymentDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CoPaymentAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    CoPaymentBalance = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    PhilHealthManagementCodes = table.Column<string>(type: "text", nullable: true),
                    PhilHealthVisitType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SpecificDiagnosisCodes = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    CounselingCodes = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RoutineVaccineName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    RoutineVaccineDate = table.Column<DateOnly>(type: "date", nullable: true),
                    AdultsRoutineScreeningCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PediatricRoutineScreeningCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PrenatalScreeningServicesCode = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    BreastCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CervicalCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ColorectalCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ProstateCancerScreeningCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DiagnosticServicesOption = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    HasMedicationPrescription = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    HasReferral = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    OtherMedicalAdviceSpec = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    HasFollowUp = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    FollowUpDate = table.Column<DateOnly>(type: "date", nullable: true),
                    FollowUpScheduleText = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FollowUpReason = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                    FollowUpVaccineName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    FollowUpVaccineNextDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ClinicalDisposition = table.Column<string>(type: "text", nullable: true),
                    ServiceDeliveryMethod = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PatientIdentityVerificationId = table.Column<Guid>(type: "uuid", nullable: true),
                    DoctorDesignation = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ConsultationReasonCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ConsultationReasonDetails = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                    PrescriptionNumber = table.Column<string>(type: "text", nullable: true),
                    RxPublicVerificationToken = table.Column<string>(type: "text", nullable: true),
                    RxClaimToken = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    RxClaimExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RxDispenseStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RxDispensedPharmacyName = table.Column<string>(type: "text", nullable: true),
                    RxDispensedPharmacistName = table.Column<string>(type: "text", nullable: true),
                    RxDispensedPharmacistPrc = table.Column<string>(type: "text", nullable: true),
                    RxDispensedReceiptNumber = table.Column<string>(type: "text", nullable: true),
                    RxDispensedReceiptUrl = table.Column<string>(type: "text", nullable: true),
                    RxDispensedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RxNotes = table.Column<string>(type: "text", nullable: true),
                    RxStage = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    RxStageReason = table.Column<string>(type: "text", nullable: true),
                    RxQuotedAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    RxStageReportedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    RxPharmacyTenantId = table.Column<string>(type: "text", nullable: true),
                    RxPharmacyFacilityId = table.Column<string>(type: "text", nullable: true),
                    RxPharmacyName = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Consultations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Consultations_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalSchema: "public",
                        principalTable: "Appointments",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Consultations_PatientIdentityVerifications_PatientIdentityV~",
                        column: x => x.PatientIdentityVerificationId,
                        principalSchema: "public",
                        principalTable: "PatientIdentityVerifications",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Consultations_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Consultations_QueueItems_QueueItemId",
                        column: x => x.QueueItemId,
                        principalSchema: "public",
                        principalTable: "QueueItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "PatientYakapEnlistments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    EffectiveYear = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Source = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PackageType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    EnlistmentDate = table.Column<DateOnly>(type: "date", nullable: false),
                    ValidUntil = table.Column<DateOnly>(type: "date", nullable: false),
                    CaseNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EnlistmentTransNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EnlistmentTransDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ProfilingTransNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ProfilingDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ProfilingAtc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsWalkedIn = table.Column<bool>(type: "boolean", nullable: false),
                    HasPatientConsent = table.Column<bool>(type: "boolean", nullable: false),
                    ConsentSignedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    HciAccreditationNumber = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    SelectionControlNumber = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: true),
                    YesReferenceNo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    RegistrationStatusCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    EmpanelmentMethod = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    IsPwd = table.Column<bool>(type: "boolean", nullable: false),
                    IsIndigenousPerson = table.Column<bool>(type: "boolean", nullable: false),
                    IdentityVerificationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ProfilingTime = table.Column<TimeOnly>(type: "time without time zone", nullable: true),
                    FpeClassificationType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    ServiceDeliveryMethod = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    FacilitatorType = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    FacilitatorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    McaFlag = table.Column<bool>(type: "boolean", nullable: false),
                    HasCoPayment = table.Column<bool>(type: "boolean", nullable: false),
                    CoPaymentDate = table.Column<DateOnly>(type: "date", nullable: true),
                    CoPaymentAmount = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    CoPaymentBalance = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    SuspendedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SuspensionReason = table.Column<string>(type: "text", nullable: true),
                    TransferredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TransferredToPmcc = table.Column<string>(type: "text", nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    CreatedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    CreatedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientYakapEnlistments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientYakapEnlistments_PatientIdentityVerifications_Identi~",
                        column: x => x.IdentityVerificationId,
                        principalSchema: "public",
                        principalTable: "PatientIdentityVerifications",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PatientYakapEnlistments_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Diagnoses",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: false),
                    Icd10Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    IsPrimary = table.Column<bool>(type: "boolean", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Diagnoses", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Diagnoses_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "EncounterAdolescentAssessments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: false),
                    SmrAssessed = table.Column<bool>(type: "boolean", nullable: false),
                    PubicHairStage = table.Column<int>(type: "integer", nullable: true),
                    BreastStage = table.Column<int>(type: "integer", nullable: true),
                    GenitalStage = table.Column<int>(type: "integer", nullable: true),
                    SmrResultCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    RapidHeadsssAssentConsent = table.Column<bool>(type: "boolean", nullable: false),
                    EducationEmploymentCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    RelationshipStatusCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    LivingArrangementCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    LivingArrangementOtherSpec = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: true),
                    Q01HomeViolenceOrConflict = table.Column<bool>(type: "boolean", nullable: true),
                    Q02SchoolOrWorkProblems = table.Column<bool>(type: "boolean", nullable: true),
                    Q03BodyImageOrEatingDistress = table.Column<bool>(type: "boolean", nullable: true),
                    Q04LackOfFriendsOrActivities = table.Column<bool>(type: "boolean", nullable: true),
                    Q05TobaccoAlcoholDrugUse = table.Column<bool>(type: "boolean", nullable: true),
                    Q06SexuallyActiveUnsafeSex = table.Column<bool>(type: "boolean", nullable: true),
                    Q07DepressionOrSadness = table.Column<bool>(type: "boolean", nullable: true),
                    Q08SuicidalThoughtsOrSelfHarm = table.Column<bool>(type: "boolean", nullable: true),
                    Q09BullyingOrCyberbullying = table.Column<bool>(type: "boolean", nullable: true),
                    Q10PhysicalOrSexualAbuse = table.Column<bool>(type: "boolean", nullable: true),
                    Q11DangerousBehaviorsOrWeapons = table.Column<bool>(type: "boolean", nullable: true),
                    Q12RequestsConfidentialCounseling = table.Column<bool>(type: "boolean", nullable: true),
                    ProceedToFullHeadsss = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncounterAdolescentAssessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncounterAdolescentAssessments_Consultations_ConsultationEn~",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EncounterHeadsssDomainAssessments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: false),
                    Domain = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    AssentConsentStatus = table.Column<bool>(type: "boolean", maxLength: 20, nullable: false),
                    GuideQuestionCodes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    PatientAnswers = table.Column<string>(type: "character varying(2000)", maxLength: 2000, nullable: true),
                    RedFlagCodes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: true),
                    RequiresUrgentReferral = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    ActionTakenOrIntervention = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncounterHeadsssDomainAssessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncounterHeadsssDomainAssessments_Consultations_Consultatio~",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EncounterObGyneExams",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: false),
                    FundicHeightCm = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    FetalHeartToneBpm = table.Column<int>(type: "integer", nullable: true),
                    EstimatedFetalWeightGrams = table.Column<int>(type: "integer", nullable: true),
                    LeopoldL1 = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    LeopoldL2 = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    LeopoldL3 = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    LeopoldL4 = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    PerinealInspection = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    SpeculumExam = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    InternalExam = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    BimanualExam = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    RectovaginalExam = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncounterObGyneExams", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncounterObGyneExams_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EncounterPediatricMilestones",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: false),
                    MilestoneVisitAgeCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    IsGrossMotorAtPar = table.Column<bool>(type: "boolean", nullable: true),
                    IsFineMotorAtPar = table.Column<bool>(type: "boolean", nullable: true),
                    IsLanguageAtPar = table.Column<bool>(type: "boolean", nullable: true),
                    IsCognitiveAtPar = table.Column<bool>(type: "boolean", nullable: true),
                    IsPsychosocialAtPar = table.Column<bool>(type: "boolean", nullable: true),
                    IsOverallDevelopmentAtPar = table.Column<bool>(type: "boolean", nullable: true),
                    GrossMotorRemarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    FineMotorRemarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    LanguageRemarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CognitiveRemarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    PsychosocialRemarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DevelopmentalRemarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncounterPediatricMilestones", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncounterPediatricMilestones_Consultations_ConsultationEnco~",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EncounterReviewOfSystemsItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: false),
                    System = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SymptomCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    SymptomTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsNormal = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    OtherSpecification = table.Column<string>(type: "text", nullable: true),
                    Remarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncounterReviewOfSystemsItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncounterReviewOfSystemsItems_Consultations_ConsultationEnc~",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientBpMonitoringLogs",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                    EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                    AverageAmSystolic = table.Column<decimal>(type: "numeric", nullable: true),
                    AverageAmDiastolic = table.Column<decimal>(type: "numeric", nullable: true),
                    AveragePmSystolic = table.Column<decimal>(type: "numeric", nullable: true),
                    AveragePmDiastolic = table.Column<decimal>(type: "numeric", nullable: true),
                    OverallAverageSystolic = table.Column<decimal>(type: "numeric", nullable: true),
                    OverallAverageDiastolic = table.Column<decimal>(type: "numeric", nullable: true),
                    ClinicalInterpretation = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientBpMonitoringLogs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientBpMonitoringLogs_Consultations_ConsultationEncounter~",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PatientBpMonitoringLogs_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientMedicalHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    VerificationStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ConditionTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Icd10Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SnomedCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SpecificDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    IsChronicNcd = table.Column<bool>(type: "boolean", nullable: false),
                    OnsetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ResolvedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsOnDialysis = table.Column<bool>(type: "boolean", nullable: true),
                    DialysisType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DialysisYearStarted = table.Column<int>(type: "integer", nullable: true),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RecordedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecordedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientMedicalHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientMedicalHistories_Consultations_ConsultationEncounter~",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PatientMedicalHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientPhysicalExams",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExamDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExaminedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    ExaminedByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    GeneralSurveyStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    GeneralSurveyCodes = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    GeneralSurveyRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CbeRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SkinRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    HeentRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ChestLungsRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    HeartRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AbdomenRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    NeurologicalRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    DigitalRectalRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    GenitourinaryRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    MusculoskeletalRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    PsychiatricRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    LymphaticRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    GenSurveyId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SkinId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HeentId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ChestId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HeartId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    AbdomenId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    NeuroId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    RectalId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    GuId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientPhysicalExams", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientPhysicalExams_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_PatientPhysicalExams_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientVitals",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    NurseId = table.Column<Guid>(type: "uuid", nullable: true),
                    RecordedByNurseName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    RecordedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    SystolicBp = table.Column<int>(type: "integer", nullable: true),
                    DiastolicBp = table.Column<int>(type: "integer", nullable: true),
                    HeartRateBpm = table.Column<int>(type: "integer", nullable: true),
                    TemperatureCelsius = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    RespiratoryRateBreathsPerMin = table.Column<int>(type: "integer", nullable: true),
                    OxygenSaturationPercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    HeightCm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    WeightKg = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    Bmi = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    PainScore = table.Column<int>(type: "integer", nullable: true),
                    BloodGlucoseRandomMgDl = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    PreAssessmentNotes = table.Column<string>(type: "text", nullable: true),
                    PreAssessmentRemarks = table.Column<string>(type: "text", nullable: true),
                    TriageAcuityReason = table.Column<string>(type: "text", nullable: true),
                    VisionChartTypeCode = table.Column<string>(type: "text", nullable: true),
                    VisualAcuityLeft = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VisualAcuityRight = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VisionBothEyes = table.Column<string>(type: "text", nullable: true),
                    VisionCorrectedLeft = table.Column<string>(type: "text", nullable: true),
                    VisionCorrectedRight = table.Column<string>(type: "text", nullable: true),
                    VisionCorrectedBoth = table.Column<string>(type: "text", nullable: true),
                    NearVisionLeft = table.Column<string>(type: "text", nullable: true),
                    NearVisionRight = table.Column<string>(type: "text", nullable: true),
                    NearVisionBoth = table.Column<string>(type: "text", nullable: true),
                    VisualAcuityRemarks = table.Column<string>(type: "text", nullable: true),
                    HasSamFormAccomplished = table.Column<bool>(type: "boolean", nullable: true),
                    SamFormCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    HeadCircumferenceCm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    MidUpperArmCircumferenceCm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    IsMeasuredRecumbent = table.Column<bool>(type: "boolean", nullable: false),
                    ZScoreWeightForAge = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    ZScoreLengthForAge = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    ZScoreWeightForLength = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    WaistCircumferenceCm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    HipCircumferenceCm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    BodyLengthCm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    SkinfoldThicknessMm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    LimbsCircumferenceCm = table.Column<decimal>(type: "numeric(6,2)", precision: 6, scale: 2, nullable: true),
                    GrowthZScoreCategory = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    GrowthZScoreCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientVitals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientVitals_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_PatientVitals_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_PatientVitals_QueueItems_QueueItemId",
                        column: x => x.QueueItemId,
                        principalSchema: "public",
                        principalTable: "QueueItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Prescriptions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: false),
                    GenericName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    BrandName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Dosage = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Form = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Sig = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    DurationDays = table.Column<int>(type: "integer", nullable: true),
                    Refills = table.Column<int>(type: "integer", nullable: false),
                    IsDangerousDrug = table.Column<bool>(type: "boolean", nullable: false),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    PhilHealthDrugCode = table.Column<string>(type: "text", nullable: true),
                    Route = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DoseQuantity = table.Column<decimal>(type: "numeric", nullable: false),
                    DoseUnit = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Frequency = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: true),
                    TotalCost = table.Column<decimal>(type: "numeric", nullable: true),
                    PhilHealthCategory = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    DrugGroupingCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PhilHealthMedsTransNo = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: true),
                    GenericCode = table.Column<string>(type: "text", nullable: true),
                    SaltCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    StrengthCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    FormCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    UnitCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    PackageCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    CategoryCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    RouteCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    FrequencyCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    InstructionDuration = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PrescriptionDate = table.Column<DateOnly>(type: "date", nullable: true),
                    PrescribingPhysicianName = table.Column<string>(type: "text", nullable: true),
                    PrescribingPhysicianPrcNo = table.Column<string>(type: "text", nullable: true),
                    DispensingFacilityName = table.Column<string>(type: "text", nullable: true),
                    IsDispensed = table.Column<bool>(type: "boolean", nullable: false),
                    DispensedQuantity = table.Column<int>(type: "integer", nullable: true),
                    DispensedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    DispensingPersonnel = table.Column<string>(type: "text", nullable: true),
                    IsGamotCovered = table.Column<bool>(type: "boolean", nullable: false),
                    UniquePrescriptionSecurityCode = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Prescriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Prescriptions_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TeleconsultRecordingSessions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    CallId = table.Column<Guid>(type: "uuid", nullable: false),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    DoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    DoctorName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ConsentStatus = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ClinicianConsentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PatientConsentAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PatientConsentIpAddress = table.Column<string>(type: "text", nullable: true),
                    PatientConsentUserAgent = table.Column<string>(type: "text", nullable: true),
                    RejectionReason = table.Column<string>(type: "text", nullable: true),
                    RecordingState = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StoragePolicy = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    StoppedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    TotalDurationSeconds = table.Column<int>(type: "integer", nullable: false),
                    SegmentCount = table.Column<int>(type: "integer", nullable: false),
                    TotalSizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    ContainerFormat = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ManifestStorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    EncryptionAlgorithm = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    EncryptionKeyId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    HasGaps = table.Column<bool>(type: "boolean", nullable: false),
                    RetentionPolicyDays = table.Column<int>(type: "integer", nullable: false),
                    ExpiresAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsLegalHold = table.Column<bool>(type: "boolean", nullable: false),
                    LegalHoldReason = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: true),
                    LegalHoldPlacedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LegalHoldPlacedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    LegalHoldPlacedByStaffName = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    IsPurged = table.Column<bool>(type: "boolean", nullable: false),
                    PurgedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PurgedBy = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeleconsultRecordingSessions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeleconsultRecordingSessions_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalSchema: "public",
                        principalTable: "Appointments",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TeleconsultRecordingSessions_Consultations_ConsultationId",
                        column: x => x.ConsultationId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_TeleconsultRecordingSessions_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "YakapSubmissions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientYakapEnlistmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceRecordId = table.Column<Guid>(type: "uuid", nullable: true),
                    AccreditationNo = table.Column<string>(type: "character varying(9)", maxLength: 9, nullable: false),
                    CaseNo = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: false),
                    SubmissionType = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: false),
                    ReportStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    LocalTransactionNo = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: false),
                    UploadTransactionNo = table.Column<string>(type: "character varying(23)", maxLength: 23, nullable: true),
                    YesReferenceNo = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: true),
                    ProcessingStatus = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    PayloadSha256Hash = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: true),
                    SubmittedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastPolledAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    NextPollAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    AttemptCount = table.Column<int>(type: "integer", nullable: false, defaultValue: 0),
                    LastErrorMessage = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_YakapSubmissions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_YakapSubmissions_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_YakapSubmissions_PatientYakapEnlistments_PatientYakapEnlist~",
                        column: x => x.PatientYakapEnlistmentId,
                        principalSchema: "public",
                        principalTable: "PatientYakapEnlistments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_YakapSubmissions_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "EncounterPediatricDangerSigns",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PediatricMilestoneId = table.Column<Guid>(type: "uuid", nullable: false),
                    Domain = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    DangerSignCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Description = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsPresent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    Remarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EncounterPediatricDangerSigns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EncounterPediatricDangerSigns_EncounterPediatricMilestones_~",
                        column: x => x.PediatricMilestoneId,
                        principalSchema: "public",
                        principalTable: "EncounterPediatricMilestones",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientBpMonitoringDays",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    BpMonitoringLogId = table.Column<Guid>(type: "uuid", nullable: false),
                    DayNumber = table.Column<int>(type: "integer", nullable: false),
                    MeasurementDate = table.Column<DateOnly>(type: "date", nullable: false),
                    LocationCode = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    TakenAfterMedication = table.Column<bool>(type: "boolean", nullable: false),
                    AmSystolic = table.Column<int>(type: "integer", nullable: true),
                    AmDiastolic = table.Column<int>(type: "integer", nullable: true),
                    AmHeartRate = table.Column<int>(type: "integer", nullable: true),
                    PmSystolic = table.Column<int>(type: "integer", nullable: true),
                    PmDiastolic = table.Column<int>(type: "integer", nullable: true),
                    PmHeartRate = table.Column<int>(type: "integer", nullable: true),
                    Remarks = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientBpMonitoringDays", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientBpMonitoringDays_PatientBpMonitoringLogs_BpMonitorin~",
                        column: x => x.BpMonitoringLogId,
                        principalSchema: "public",
                        principalTable: "PatientBpMonitoringLogs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "PatientPhysicalExamFindings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    PhysicalExamId = table.Column<Guid>(type: "uuid", nullable: false),
                    System = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsNormal = table.Column<bool>(type: "boolean", nullable: false),
                    FindingTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthFindingCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    BodySite = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    Laterality = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientPhysicalExamFindings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientPhysicalExamFindings_PatientPhysicalExams_PhysicalEx~",
                        column: x => x.PhysicalExamId,
                        principalSchema: "public",
                        principalTable: "PatientPhysicalExams",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TeleconsultRecordingSegments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SessionId = table.Column<Guid>(type: "uuid", nullable: false),
                    SegmentIndex = table.Column<int>(type: "integer", nullable: false),
                    DurationMs = table.Column<int>(type: "integer", nullable: false),
                    StorageKey = table.Column<string>(type: "character varying(512)", maxLength: 512, nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    Sha256Checksum = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IvBase64 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    TagBase64 = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ReceivedAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TeleconsultRecordingSegments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TeleconsultRecordingSegments_TeleconsultRecordingSessions_S~",
                        column: x => x.SessionId,
                        principalSchema: "public",
                        principalTable: "TeleconsultRecordingSessions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "YakapSubmissionErrors",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    YakapSubmissionId = table.Column<Guid>(type: "uuid", nullable: false),
                    FieldPath = table.Column<string>(type: "character varying(250)", maxLength: 250, nullable: false),
                    Issue = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: false),
                    ErrorCode = table.Column<string>(type: "text", nullable: true),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_YakapSubmissionErrors", x => x.Id);
                    table.ForeignKey(
                        name: "FK_YakapSubmissionErrors_YakapSubmissions_YakapSubmissionId",
                        column: x => x.YakapSubmissionId,
                        principalSchema: "public",
                        principalTable: "YakapSubmissions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_ClinicId_DoctorId_ScheduledAt_EndTimeUtc",
                schema: "public",
                table: "Appointments",
                columns: new[] { "ClinicId", "DoctorId", "ScheduledAt", "EndTimeUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_ClinicId_PatientId",
                schema: "public",
                table: "Appointments",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_PatientId",
                schema: "public",
                table: "Appointments",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_ScheduledAt",
                schema: "public",
                table: "Appointments",
                column: "ScheduledAt");

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_Status_ScheduledAt_Reminder24hSent",
                schema: "public",
                table: "Appointments",
                columns: new[] { "Status", "ScheduledAt", "Reminder24hSent" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_Status_ScheduledAt_Reminder2hSent",
                schema: "public",
                table: "Appointments",
                columns: new[] { "Status", "ScheduledAt", "Reminder2hSent" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_TenantId_ClinicId",
                schema: "public",
                table: "Appointments",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_ClinicId_ActorStaffId_Timestamp",
                schema: "public",
                table: "AuditEntries",
                columns: new[] { "ClinicId", "ActorStaffId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_ClinicId_Category_Timestamp",
                schema: "public",
                table: "AuditEntries",
                columns: new[] { "ClinicId", "Category", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_ClinicId_PatientId_Timestamp",
                schema: "public",
                table: "AuditEntries",
                columns: new[] { "ClinicId", "PatientId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_ClinicId_Severity_Timestamp",
                schema: "public",
                table: "AuditEntries",
                columns: new[] { "ClinicId", "Severity", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_ClinicId_TargetEntityType_TargetEntityId",
                schema: "public",
                table: "AuditEntries",
                columns: new[] { "ClinicId", "TargetEntityType", "TargetEntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_AuditEntries_TenantId_ClinicId_Timestamp",
                schema: "public",
                table: "AuditEntries",
                columns: new[] { "TenantId", "ClinicId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_AppointmentId",
                schema: "public",
                table: "Consultations",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_ClinicId_PatientId",
                schema: "public",
                table: "Consultations",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_ClinicId_PatientId_EncounterDate",
                schema: "public",
                table: "Consultations",
                columns: new[] { "ClinicId", "PatientId", "EncounterDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_PatientId",
                schema: "public",
                table: "Consultations",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_PatientIdentityVerificationId",
                schema: "public",
                table: "Consultations",
                column: "PatientIdentityVerificationId");

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_QueueItemId",
                schema: "public",
                table: "Consultations",
                column: "QueueItemId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_TenantId_BranchId",
                schema: "public",
                table: "Consultations",
                columns: new[] { "TenantId", "BranchId" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_TenantId_ClinicId_EncounterDate",
                schema: "public",
                table: "Consultations",
                columns: new[] { "TenantId", "ClinicId", "EncounterDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "Consultations",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey",
                schema: "public",
                table: "CustomFieldDefinitions",
                columns: new[] { "TenantId", "ClinicId", "EntityType", "FieldKey" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_ClinicId_ConsultationId",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "ClinicId", "ConsultationId" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_ClinicId_PatientId",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_ClinicId_PatientId_ToothNumber",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "ClinicId", "PatientId", "ToothNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_ClinicId_PatientId_ToothNumber_IsCurrent",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "ClinicId", "PatientId", "ToothNumber", "IsCurrent" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_PatientId",
                schema: "public",
                table: "DentalToothRecords",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Diagnoses_ClinicId_ConsultationEncounterId",
                schema: "public",
                table: "Diagnoses",
                columns: new[] { "ClinicId", "ConsultationEncounterId" });

            migrationBuilder.CreateIndex(
                name: "IX_Diagnoses_ConsultationEncounterId",
                schema: "public",
                table: "Diagnoses",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_DoctorBreakTimes_TemplateId",
                schema: "public",
                table: "DoctorBreakTimes",
                column: "TemplateId");

            migrationBuilder.CreateIndex(
                name: "IX_DoctorBreakTimes_TenantId_ClinicId",
                schema: "public",
                table: "DoctorBreakTimes",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorLeaves_ClinicId_DoctorId_StartDate_EndDate",
                schema: "public",
                table: "DoctorLeaves",
                columns: new[] { "ClinicId", "DoctorId", "StartDate", "EndDate" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorScheduleOverrides_ClinicId_DoctorId_Date",
                schema: "public",
                table: "DoctorScheduleOverrides",
                columns: new[] { "ClinicId", "DoctorId", "Date" });

            migrationBuilder.CreateIndex(
                name: "IX_DoctorScheduleTemplates_ClinicId_DoctorId_DayOfWeek",
                schema: "public",
                table: "DoctorScheduleTemplates",
                columns: new[] { "ClinicId", "DoctorId", "DayOfWeek" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterAdolescentAssessments_ClinicId_ConsultationEncount~",
                schema: "public",
                table: "EncounterAdolescentAssessments",
                columns: new[] { "ClinicId", "ConsultationEncounterId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterAdolescentAssessments_ConsultationEncounterId",
                schema: "public",
                table: "EncounterAdolescentAssessments",
                column: "ConsultationEncounterId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EncounterAdolescentAssessments_TenantId_ClinicId",
                schema: "public",
                table: "EncounterAdolescentAssessments",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterHeadsssDomainAssessments_ClinicId_ConsultationEnco~",
                schema: "public",
                table: "EncounterHeadsssDomainAssessments",
                columns: new[] { "ClinicId", "ConsultationEncounterId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterHeadsssDomainAssessments_ConsultationEncounterId",
                schema: "public",
                table: "EncounterHeadsssDomainAssessments",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterHeadsssDomainAssessments_TenantId_ClinicId",
                schema: "public",
                table: "EncounterHeadsssDomainAssessments",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterObGyneExams_ClinicId_ConsultationEncounterId",
                schema: "public",
                table: "EncounterObGyneExams",
                columns: new[] { "ClinicId", "ConsultationEncounterId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterObGyneExams_ConsultationEncounterId",
                schema: "public",
                table: "EncounterObGyneExams",
                column: "ConsultationEncounterId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_EncounterObGyneExams_TenantId_ClinicId",
                schema: "public",
                table: "EncounterObGyneExams",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterPediatricDangerSigns_ClinicId_PediatricMilestoneId",
                schema: "public",
                table: "EncounterPediatricDangerSigns",
                columns: new[] { "ClinicId", "PediatricMilestoneId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterPediatricDangerSigns_PediatricMilestoneId",
                schema: "public",
                table: "EncounterPediatricDangerSigns",
                column: "PediatricMilestoneId");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterPediatricDangerSigns_TenantId_ClinicId",
                schema: "public",
                table: "EncounterPediatricDangerSigns",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterPediatricMilestones_ClinicId_ConsultationEncounter~",
                schema: "public",
                table: "EncounterPediatricMilestones",
                columns: new[] { "ClinicId", "ConsultationEncounterId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterPediatricMilestones_ConsultationEncounterId",
                schema: "public",
                table: "EncounterPediatricMilestones",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterPediatricMilestones_TenantId_ClinicId",
                schema: "public",
                table: "EncounterPediatricMilestones",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterReviewOfSystemsItems_ClinicId_ConsultationEncounte~",
                schema: "public",
                table: "EncounterReviewOfSystemsItems",
                columns: new[] { "ClinicId", "ConsultationEncounterId" });

            migrationBuilder.CreateIndex(
                name: "IX_EncounterReviewOfSystemsItems_ConsultationEncounterId",
                schema: "public",
                table: "EncounterReviewOfSystemsItems",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_EncounterReviewOfSystemsItems_TenantId_ClinicId",
                schema: "public",
                table: "EncounterReviewOfSystemsItems",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_EodReconciliationAudits_TenantId_ClinicId_ReconciliationDate",
                schema: "public",
                table: "EodReconciliationAudits",
                columns: new[] { "TenantId", "ClinicId", "ReconciliationDate" });

            migrationBuilder.CreateIndex(
                name: "IX_IdempotencyRecords_CreatedAt",
                schema: "public",
                table: "IdempotencyRecords",
                column: "CreatedAt");

            migrationBuilder.CreateIndex(
                name: "IX_IdempotencyRecords_Scope_Key",
                schema: "public",
                table: "IdempotencyRecords",
                columns: new[] { "Scope", "Key" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_interop_inbox_ProcessedAtUtc",
                schema: "public",
                table: "interop_inbox",
                column: "ProcessedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_CorrelationId",
                schema: "public",
                table: "interop_outbox",
                column: "CorrelationId");

            migrationBuilder.CreateIndex(
                name: "IX_interop_outbox_DispatchedAtUtc_DeadLetteredAtUtc_NextAttemp~",
                schema: "public",
                table: "interop_outbox",
                columns: new[] { "DispatchedAtUtc", "DeadLetteredAtUtc", "NextAttemptAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLineItems_ClinicId_InvoiceId",
                schema: "public",
                table: "InvoiceLineItems",
                columns: new[] { "ClinicId", "InvoiceId" });

            migrationBuilder.CreateIndex(
                name: "IX_InvoiceLineItems_InvoiceId",
                schema: "public",
                table: "InvoiceLineItems",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_ClinicId_PatientId",
                schema: "public",
                table: "Invoices",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_PatientId",
                schema: "public",
                table: "Invoices",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_TenantId_ClinicId_InvoiceDate",
                schema: "public",
                table: "Invoices",
                columns: new[] { "TenantId", "ClinicId", "InvoiceDate" });

            migrationBuilder.CreateIndex(
                name: "IX_Invoices_TenantId_ClinicId_InvoiceNumber",
                schema: "public",
                table: "Invoices",
                columns: new[] { "TenantId", "ClinicId", "InvoiceNumber" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_LabObservations_ClinicId_AnalyteCode",
                schema: "public",
                table: "LabObservations",
                columns: new[] { "ClinicId", "AnalyteCode" });

            migrationBuilder.CreateIndex(
                name: "IX_LabObservations_ClinicId_LabOrderId",
                schema: "public",
                table: "LabObservations",
                columns: new[] { "ClinicId", "LabOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_LabObservations_ClinicId_LabOrderItemId",
                schema: "public",
                table: "LabObservations",
                columns: new[] { "ClinicId", "LabOrderItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_LabObservations_LabOrderId",
                schema: "public",
                table: "LabObservations",
                column: "LabOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_LabObservations_LabOrderItemId",
                schema: "public",
                table: "LabObservations",
                column: "LabOrderItemId");

            migrationBuilder.CreateIndex(
                name: "IX_LabOrderItems_ClinicId_LabOrderId",
                schema: "public",
                table: "LabOrderItems",
                columns: new[] { "ClinicId", "LabOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_LabOrderItems_LabOrderId",
                schema: "public",
                table: "LabOrderItems",
                column: "LabOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_LabOrders_ClinicId_PatientId",
                schema: "public",
                table: "LabOrders",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_LabOrders_PatientId",
                schema: "public",
                table: "LabOrders",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_LabOrders_TenantId_ClinicId_OrderDate",
                schema: "public",
                table: "LabOrders",
                columns: new[] { "TenantId", "ClinicId", "OrderDate" });

            migrationBuilder.CreateIndex(
                name: "IX_LabOrders_TenantId_ClinicId_OrderNumber",
                schema: "public",
                table: "LabOrders",
                columns: new[] { "TenantId", "ClinicId", "OrderNumber" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_ClinicId_LabOrderId",
                schema: "public",
                table: "LabResults",
                columns: new[] { "ClinicId", "LabOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_ClinicId_LabOrderId_ReportId",
                schema: "public",
                table: "LabResults",
                columns: new[] { "ClinicId", "LabOrderId", "ReportId" },
                unique: true,
                filter: "\"IsDeleted\" = false AND \"ReportId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_ClinicId_Verification_SubmittedAt",
                schema: "public",
                table: "LabResults",
                columns: new[] { "ClinicId", "Verification", "SubmittedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_LabResults_LabOrderId",
                schema: "public",
                table: "LabResults",
                column: "LabOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalCertificates_ClinicId_PatientId",
                schema: "public",
                table: "MedicalCertificates",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalCertificates_PatientId",
                schema: "public",
                table: "MedicalCertificates",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalCertificates_TenantId_ClinicId_CertificateNumber",
                schema: "public",
                table: "MedicalCertificates",
                columns: new[] { "TenantId", "ClinicId", "CertificateNumber" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_MedicalCertificates_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "MedicalCertificates",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_MedicalCertificates_TenantId_ClinicId_SecurityDigest",
                schema: "public",
                table: "MedicalCertificates",
                columns: new[] { "TenantId", "ClinicId", "SecurityDigest" });

            migrationBuilder.CreateIndex(
                name: "IX_NcdRiskAssessments_ClinicId_AssessmentDate",
                schema: "public",
                table: "NcdRiskAssessments",
                columns: new[] { "ClinicId", "AssessmentDate" });

            migrationBuilder.CreateIndex(
                name: "IX_NcdRiskAssessments_ClinicId_PatientId",
                schema: "public",
                table: "NcdRiskAssessments",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_NcdRiskAssessments_PatientId",
                schema: "public",
                table: "NcdRiskAssessments",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_NcdRiskAssessments_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "NcdRiskAssessments",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAddresses_ClinicId_PatientId",
                schema: "public",
                table: "PatientAddresses",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAddresses_ClinicId_PatientId_AddressType",
                schema: "public",
                table: "PatientAddresses",
                columns: new[] { "ClinicId", "PatientId", "AddressType" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientAddresses_PatientId",
                schema: "public",
                table: "PatientAddresses",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientAddresses_TenantId_ClinicId",
                schema: "public",
                table: "PatientAddresses",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAlerts_ClinicId_PatientId",
                schema: "public",
                table: "PatientAlerts",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAlerts_ClinicId_PatientId_Status",
                schema: "public",
                table: "PatientAlerts",
                columns: new[] { "ClinicId", "PatientId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAlerts_ClinicId_Severity",
                schema: "public",
                table: "PatientAlerts",
                columns: new[] { "ClinicId", "Severity" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAlerts_PatientId",
                schema: "public",
                table: "PatientAlerts",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientAllergies_ClinicId_PatientId",
                schema: "public",
                table: "PatientAllergies",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAllergies_ClinicId_PatientId_Category",
                schema: "public",
                table: "PatientAllergies",
                columns: new[] { "ClinicId", "PatientId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAllergies_PatientId",
                schema: "public",
                table: "PatientAllergies",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientAllergies_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientAllergies",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientBpMonitoringDays_BpMonitoringLogId",
                schema: "public",
                table: "PatientBpMonitoringDays",
                column: "BpMonitoringLogId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientBpMonitoringDays_ClinicId_BpMonitoringLogId_DayNumber",
                schema: "public",
                table: "PatientBpMonitoringDays",
                columns: new[] { "ClinicId", "BpMonitoringLogId", "DayNumber" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientBpMonitoringDays_TenantId_ClinicId",
                schema: "public",
                table: "PatientBpMonitoringDays",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientBpMonitoringLogs_ClinicId_PatientId",
                schema: "public",
                table: "PatientBpMonitoringLogs",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientBpMonitoringLogs_ConsultationEncounterId",
                schema: "public",
                table: "PatientBpMonitoringLogs",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientBpMonitoringLogs_PatientId",
                schema: "public",
                table: "PatientBpMonitoringLogs",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientBpMonitoringLogs_TenantId_ClinicId",
                schema: "public",
                table: "PatientBpMonitoringLogs",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientCodeSequenceTrackers_TenantId_ClinicId_Year",
                schema: "public",
                table: "PatientCodeSequenceTrackers",
                columns: new[] { "TenantId", "ClinicId", "Year" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientFamilyHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientFamilyHistories",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientFamilyHistories_ClinicId_PatientId_PhilHealthMdiseas~",
                schema: "public",
                table: "PatientFamilyHistories",
                columns: new[] { "ClinicId", "PatientId", "PhilHealthMdiseaseCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientFamilyHistories_PatientId",
                schema: "public",
                table: "PatientFamilyHistories",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientFamilyHistories_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientFamilyHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientGuardians_ClinicId_PatientId",
                schema: "public",
                table: "PatientGuardians",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientGuardians_PatientId",
                schema: "public",
                table: "PatientGuardians",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientGuardians_TenantId_ClinicId",
                schema: "public",
                table: "PatientGuardians",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientHomeMedications_ClinicId_PatientId",
                schema: "public",
                table: "PatientHomeMedications",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientHomeMedications_PatientId",
                schema: "public",
                table: "PatientHomeMedications",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientHomeMedications_TenantId_ClinicId",
                schema: "public",
                table: "PatientHomeMedications",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientHospitalizationHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientHospitalizationHistories",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientHospitalizationHistories_PatientId",
                schema: "public",
                table: "PatientHospitalizationHistories",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientHospitalizationHistories_TenantId_ClinicId",
                schema: "public",
                table: "PatientHospitalizationHistories",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientIdentityVerifications_ClinicId_PatientId",
                schema: "public",
                table: "PatientIdentityVerifications",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientIdentityVerifications_ClinicId_PatientId_Verificatio~",
                schema: "public",
                table: "PatientIdentityVerifications",
                columns: new[] { "ClinicId", "PatientId", "VerificationDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientIdentityVerifications_PatientId",
                schema: "public",
                table: "PatientIdentityVerifications",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientIdentityVerifications_TenantId_ClinicId",
                schema: "public",
                table: "PatientIdentityVerifications",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientIdentityVerifications_ValidIdAttachmentId",
                schema: "public",
                table: "PatientIdentityVerifications",
                column: "ValidIdAttachmentId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_ClinicId_AdministeredAtUtc",
                schema: "public",
                table: "PatientImmunizations",
                columns: new[] { "ClinicId", "AdministeredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_ClinicId_PatientId",
                schema: "public",
                table: "PatientImmunizations",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_LotBatchNumber_ExpirationDate",
                schema: "public",
                table: "PatientImmunizations",
                columns: new[] { "LotBatchNumber", "ExpirationDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_PatientId",
                schema: "public",
                table: "PatientImmunizations",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientImmunizations",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientInjuryHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientInjuryHistories",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientInjuryHistories_PatientId",
                schema: "public",
                table: "PatientInjuryHistories",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientInjuryHistories_TenantId_ClinicId",
                schema: "public",
                table: "PatientInjuryHistories",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_ClinicId_Icd10Code",
                schema: "public",
                table: "PatientMedicalHistories",
                columns: new[] { "ClinicId", "Icd10Code" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientMedicalHistories",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_ClinicId_PatientId_Status",
                schema: "public",
                table: "PatientMedicalHistories",
                columns: new[] { "ClinicId", "PatientId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_ClinicId_PhilHealthMdiseaseCode",
                schema: "public",
                table: "PatientMedicalHistories",
                columns: new[] { "ClinicId", "PhilHealthMdiseaseCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_ConsultationEncounterId",
                schema: "public",
                table: "PatientMedicalHistories",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_PatientId",
                schema: "public",
                table: "PatientMedicalHistories",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientMedicalHistories_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientMedicalHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhilHealthMemberships_ClinicId_MemberPin",
                schema: "public",
                table: "PatientPhilHealthMemberships",
                columns: new[] { "ClinicId", "MemberPin" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhilHealthMemberships_ClinicId_PatientId",
                schema: "public",
                table: "PatientPhilHealthMemberships",
                columns: new[] { "ClinicId", "PatientId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhilHealthMemberships_PatientId",
                schema: "public",
                table: "PatientPhilHealthMemberships",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExamFindings_ClinicId_PhysicalExamId",
                schema: "public",
                table: "PatientPhysicalExamFindings",
                columns: new[] { "ClinicId", "PhysicalExamId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExamFindings_ClinicId_System",
                schema: "public",
                table: "PatientPhysicalExamFindings",
                columns: new[] { "ClinicId", "System" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExamFindings_PhysicalExamId",
                schema: "public",
                table: "PatientPhysicalExamFindings",
                column: "PhysicalExamId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExams_ClinicId_ConsultationEncounterId",
                schema: "public",
                table: "PatientPhysicalExams",
                columns: new[] { "ClinicId", "ConsultationEncounterId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExams_ClinicId_PatientId",
                schema: "public",
                table: "PatientPhysicalExams",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExams_ClinicId_PatientId_ExamDate",
                schema: "public",
                table: "PatientPhysicalExams",
                columns: new[] { "ClinicId", "PatientId", "ExamDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExams_ConsultationEncounterId",
                schema: "public",
                table: "PatientPhysicalExams",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExams_PatientId",
                schema: "public",
                table: "PatientPhysicalExams",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientReproductiveHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientReproductiveHistories",
                columns: new[] { "ClinicId", "PatientId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientReproductiveHistories_PatientId",
                schema: "public",
                table: "PatientReproductiveHistories",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_ClinicEzId",
                schema: "public",
                table: "Patients",
                columns: new[] { "ClinicId", "ClinicEzId" },
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_CloudPatientId",
                schema: "public",
                table: "Patients",
                columns: new[] { "ClinicId", "CloudPatientId" },
                unique: true,
                filter: "\"IsDeleted\" = false AND \"CloudPatientId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_PatientCode",
                schema: "public",
                table: "Patients",
                columns: new[] { "ClinicId", "PatientCode" },
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_TenantId_LastName_FirstName",
                schema: "public",
                table: "Patients",
                columns: new[] { "ClinicId", "TenantId", "LastName", "FirstName" },
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Patients_CustomFields",
                schema: "public",
                table: "Patients",
                column: "CustomFields")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "jsonb_path_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_SearchText",
                schema: "public",
                table: "Patients",
                column: "SearchText")
                .Annotation("Npgsql:IndexMethod", "gin")
                .Annotation("Npgsql:IndexOperators", new[] { "gin_trgm_ops" });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_TenantId_ClinicId_PatientCode",
                schema: "public",
                table: "Patients",
                columns: new[] { "TenantId", "ClinicId", "PatientCode" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientSexualHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientSexualHistories",
                columns: new[] { "ClinicId", "PatientId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientSexualHistories_PatientId",
                schema: "public",
                table: "PatientSexualHistories",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientSexualHistories_TenantId_ClinicId",
                schema: "public",
                table: "PatientSexualHistories",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientSocialHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientSocialHistories",
                columns: new[] { "ClinicId", "PatientId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientSocialHistories_PatientId",
                schema: "public",
                table: "PatientSocialHistories",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientSurgicalHistories_ClinicId_PatientId",
                schema: "public",
                table: "PatientSurgicalHistories",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientSurgicalHistories_PatientId_SurgeryDate",
                schema: "public",
                table: "PatientSurgicalHistories",
                columns: new[] { "PatientId", "SurgeryDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientSurgicalHistories_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientSurgicalHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientVitals_ClinicId_PatientId",
                schema: "public",
                table: "PatientVitals",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientVitals_ClinicId_PatientId_RecordedAt",
                schema: "public",
                table: "PatientVitals",
                columns: new[] { "ClinicId", "PatientId", "RecordedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientVitals_ClinicId_QueueItemId",
                schema: "public",
                table: "PatientVitals",
                columns: new[] { "ClinicId", "QueueItemId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientVitals_ConsultationEncounterId",
                schema: "public",
                table: "PatientVitals",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientVitals_PatientId",
                schema: "public",
                table: "PatientVitals",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientVitals_QueueItemId",
                schema: "public",
                table: "PatientVitals",
                column: "QueueItemId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientVitals_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientVitals",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientYakapEnlistments_ClinicId_EffectiveYear",
                schema: "public",
                table: "PatientYakapEnlistments",
                columns: new[] { "ClinicId", "EffectiveYear" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientYakapEnlistments_ClinicId_PatientId",
                schema: "public",
                table: "PatientYakapEnlistments",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientYakapEnlistments_ClinicId_PatientId_EffectiveYear",
                schema: "public",
                table: "PatientYakapEnlistments",
                columns: new[] { "ClinicId", "PatientId", "EffectiveYear" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PatientYakapEnlistments_ClinicId_Status",
                schema: "public",
                table: "PatientYakapEnlistments",
                columns: new[] { "ClinicId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientYakapEnlistments_IdentityVerificationId",
                schema: "public",
                table: "PatientYakapEnlistments",
                column: "IdentityVerificationId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientYakapEnlistments_PatientId",
                schema: "public",
                table: "PatientYakapEnlistments",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_InvoiceId",
                schema: "public",
                table: "Payments",
                column: "InvoiceId");

            migrationBuilder.CreateIndex(
                name: "IX_Payments_TenantId_ClinicId_PaymentDate",
                schema: "public",
                table: "Payments",
                columns: new[] { "TenantId", "ClinicId", "PaymentDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PhilHealthCatalogImportLogs_Library_CreatedAt",
                schema: "public",
                table: "PhilHealthCatalogImportLogs",
                columns: new[] { "Library", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_PhilHealthCatalogItems_Library_Code",
                schema: "public",
                table: "PhilHealthCatalogItems",
                columns: new[] { "Library", "Code" });

            migrationBuilder.CreateIndex(
                name: "IX_PhilHealthCatalogItems_Library_ItemKey",
                schema: "public",
                table: "PhilHealthCatalogItems",
                columns: new[] { "Library", "ItemKey" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PhilHealthDailySequences_ClinicId_AccreditationNo_Prefix_Ma~",
                schema: "public",
                table: "PhilHealthDailySequences",
                columns: new[] { "ClinicId", "AccreditationNo", "Prefix", "ManilaDate" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Prescriptions_ClinicId_ConsultationEncounterId",
                schema: "public",
                table: "Prescriptions",
                columns: new[] { "ClinicId", "ConsultationEncounterId" });

            migrationBuilder.CreateIndex(
                name: "IX_Prescriptions_ConsultationEncounterId",
                schema: "public",
                table: "Prescriptions",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_Procedures_ClinicId_PatientId",
                schema: "public",
                table: "Procedures",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Procedures_PatientId",
                schema: "public",
                table: "Procedures",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_Procedures_TargetRoomId",
                schema: "public",
                table: "Procedures",
                column: "TargetRoomId");

            migrationBuilder.CreateIndex(
                name: "IX_Procedures_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "Procedures",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Procedures_TenantId_ClinicId_ScheduledAt",
                schema: "public",
                table: "Procedures",
                columns: new[] { "TenantId", "ClinicId", "ScheduledAt" });

            migrationBuilder.CreateIndex(
                name: "IX_Products_TenantId_ClinicId",
                schema: "public",
                table: "Products",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_PsgcLocations_Level_ParentPsgcCode",
                schema: "public",
                table: "PsgcLocations",
                columns: new[] { "Level", "ParentPsgcCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PsgcLocations_Name",
                schema: "public",
                table: "PsgcLocations",
                column: "Name");

            migrationBuilder.CreateIndex(
                name: "IX_PsgcLocations_PsgcCode",
                schema: "public",
                table: "PsgcLocations",
                column: "PsgcCode",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_AppointmentId",
                schema: "public",
                table: "QueueItems",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_ClinicId_PatientId",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_PatientId",
                schema: "public",
                table: "QueueItems",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_RoomId",
                schema: "public",
                table: "QueueItems",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_CheckInTime",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "CheckInTime" });

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_QueueDate",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "QueueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_QueueDate_Status",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "QueueDate", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_VisitType",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "VisitType" });

            migrationBuilder.CreateIndex(
                name: "IX_RecordAttachments_ClinicId_PatientId",
                schema: "public",
                table: "RecordAttachments",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_RecordAttachments_PatientId",
                schema: "public",
                table: "RecordAttachments",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_RecordAttachments_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "RecordAttachments",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_ReferralLetters_ClinicId_PatientId",
                schema: "public",
                table: "ReferralLetters",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_ReferralLetters_PatientId",
                schema: "public",
                table: "ReferralLetters",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_ReferralLetters_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "ReferralLetters",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_ReferralLetters_TenantId_ClinicId_ReferralNumber",
                schema: "public",
                table: "ReferralLetters",
                columns: new[] { "TenantId", "ClinicId", "ReferralNumber" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_ReferralLetters_TenantId_ClinicId_SecurityDigest",
                schema: "public",
                table: "ReferralLetters",
                columns: new[] { "TenantId", "ClinicId", "SecurityDigest" });

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_FamilyId",
                schema: "public",
                table: "RefreshTokens",
                column: "FamilyId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_StaffMemberId",
                schema: "public",
                table: "RefreshTokens",
                column: "StaffMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_RefreshTokens_TokenHash",
                schema: "public",
                table: "RefreshTokens",
                column: "TokenHash",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Roles_TenantId_ClinicId",
                schema: "public",
                table: "Roles",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_Rooms_ClinicId_Name",
                schema: "public",
                table: "Rooms",
                columns: new[] { "ClinicId", "Name" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Rooms_TenantId_ClinicId_DisplayOrder",
                schema: "public",
                table: "Rooms",
                columns: new[] { "TenantId", "ClinicId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ServiceItems_TenantId_ClinicId_Code",
                schema: "public",
                table: "ServiceItems",
                columns: new[] { "TenantId", "ClinicId", "Code" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Settings_TenantId_ClinicId",
                schema: "public",
                table: "Settings",
                columns: new[] { "TenantId", "ClinicId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_ShareImports_ClinicId_PatientId",
                schema: "public",
                table: "ShareImports",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_ShareImports_ClinicId_RequestedAt",
                schema: "public",
                table: "ShareImports",
                columns: new[] { "ClinicId", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_ShareImports_PatientId",
                schema: "public",
                table: "ShareImports",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_ClinicId_Email",
                schema: "public",
                table: "StaffMembers",
                columns: new[] { "ClinicId", "Email" },
                unique: true,
                filter: "\"IsDeleted\" = false AND \"Email\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_ClinicRoleId",
                schema: "public",
                table: "StaffMembers",
                column: "ClinicRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_InvitationToken",
                schema: "public",
                table: "StaffMembers",
                column: "InvitationToken",
                unique: true,
                filter: "\"IsDeleted\" = false AND \"InvitationToken\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_TenantId_ClinicId",
                schema: "public",
                table: "StaffMembers",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_StaffNotifications_ClinicId_IsRead_CreatedAt",
                schema: "public",
                table: "StaffNotifications",
                columns: new[] { "ClinicId", "IsRead", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StaffNotifications_RecipientStaffId",
                schema: "public",
                table: "StaffNotifications",
                column: "RecipientStaffId");

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSegments_ClinicId_SessionId",
                schema: "public",
                table: "TeleconsultRecordingSegments",
                columns: new[] { "ClinicId", "SessionId" });

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSegments_SessionId_SegmentIndex",
                schema: "public",
                table: "TeleconsultRecordingSegments",
                columns: new[] { "SessionId", "SegmentIndex" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSessions_AppointmentId",
                schema: "public",
                table: "TeleconsultRecordingSessions",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSessions_ClinicId_CallId",
                schema: "public",
                table: "TeleconsultRecordingSessions",
                columns: new[] { "ClinicId", "CallId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSessions_ClinicId_ConsultationId",
                schema: "public",
                table: "TeleconsultRecordingSessions",
                columns: new[] { "ClinicId", "ConsultationId" });

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSessions_ClinicId_PatientId",
                schema: "public",
                table: "TeleconsultRecordingSessions",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSessions_ConsultationId",
                schema: "public",
                table: "TeleconsultRecordingSessions",
                column: "ConsultationId");

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSessions_ExpiresAtUtc",
                schema: "public",
                table: "TeleconsultRecordingSessions",
                column: "ExpiresAtUtc",
                filter: "\"IsPurged\" = false AND \"IsLegalHold\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_TeleconsultRecordingSessions_PatientId",
                schema: "public",
                table: "TeleconsultRecordingSessions",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_UploadGrants_ClinicId_LabOrderId",
                schema: "public",
                table: "UploadGrants",
                columns: new[] { "ClinicId", "LabOrderId" });

            migrationBuilder.CreateIndex(
                name: "IX_UploadGrants_LabOrderId",
                schema: "public",
                table: "UploadGrants",
                column: "LabOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_UploadGrants_TokenHash",
                schema: "public",
                table: "UploadGrants",
                column: "TokenHash",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_workspace_profiles_TenantSlug",
                schema: "public",
                table: "workspace_profiles",
                column: "TenantSlug");

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissionErrors_ClinicId_YakapSubmissionId",
                schema: "public",
                table: "YakapSubmissionErrors",
                columns: new[] { "ClinicId", "YakapSubmissionId" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissionErrors_YakapSubmissionId",
                schema: "public",
                table: "YakapSubmissionErrors",
                column: "YakapSubmissionId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissions_ClinicId_LocalTransactionNo",
                schema: "public",
                table: "YakapSubmissions",
                columns: new[] { "ClinicId", "LocalTransactionNo" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissions_ClinicId_PatientId",
                schema: "public",
                table: "YakapSubmissions",
                columns: new[] { "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissions_ClinicId_UploadTransactionNo",
                schema: "public",
                table: "YakapSubmissions",
                columns: new[] { "ClinicId", "UploadTransactionNo" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissions_ConsultationEncounterId",
                schema: "public",
                table: "YakapSubmissions",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissions_PatientId",
                schema: "public",
                table: "YakapSubmissions",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissions_PatientYakapEnlistmentId",
                schema: "public",
                table: "YakapSubmissions",
                column: "PatientYakapEnlistmentId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapSubmissions_TenantId_ClinicId",
                schema: "public",
                table: "YakapSubmissions",
                columns: new[] { "TenantId", "ClinicId" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditEntries",
                schema: "public");

            migrationBuilder.DropTable(
                name: "CustomFieldDefinitions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DataProtectionKeys",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DentalToothRecords",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Diagnoses",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DoctorBreakTimes",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DoctorLeaves",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DoctorScheduleOverrides",
                schema: "public");

            migrationBuilder.DropTable(
                name: "EncounterAdolescentAssessments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "EncounterHeadsssDomainAssessments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "EncounterObGyneExams",
                schema: "public");

            migrationBuilder.DropTable(
                name: "EncounterPediatricDangerSigns",
                schema: "public");

            migrationBuilder.DropTable(
                name: "EncounterReviewOfSystemsItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "EodReconciliationAudits",
                schema: "public");

            migrationBuilder.DropTable(
                name: "IdempotencyRecords",
                schema: "public");

            migrationBuilder.DropTable(
                name: "interop_inbox",
                schema: "public");

            migrationBuilder.DropTable(
                name: "interop_outbox",
                schema: "public");

            migrationBuilder.DropTable(
                name: "InvoiceLineItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabObservations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabResults",
                schema: "public");

            migrationBuilder.DropTable(
                name: "MedicalCertificates",
                schema: "public");

            migrationBuilder.DropTable(
                name: "NcdRiskAssessments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientAddresses",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientAlerts",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientAllergies",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientBpMonitoringDays",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientCodeSequenceTrackers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientFamilyHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientGuardians",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientHomeMedications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientHospitalizationHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientImmunizations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientInjuryHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientMedicalHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientPhilHealthMemberships",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientPhysicalExamFindings",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientReproductiveHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientSexualHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientSocialHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientSurgicalHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientVitals",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Payments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PhilHealthCatalogImportLogs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PhilHealthCatalogItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PhilHealthDailySequences",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PhilHealthSequenceTrackers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Prescriptions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Procedures",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Products",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PsgcLocations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ReferralLetters",
                schema: "public");

            migrationBuilder.DropTable(
                name: "RefreshTokens",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ServiceItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Settings",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ShareImports",
                schema: "public");

            migrationBuilder.DropTable(
                name: "StaffNotifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "TeleconsultRecordingSegments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "UploadGrants",
                schema: "public");

            migrationBuilder.DropTable(
                name: "workspace_profiles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "YakapSubmissionErrors",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DoctorScheduleTemplates",
                schema: "public");

            migrationBuilder.DropTable(
                name: "EncounterPediatricMilestones",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabOrderItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientBpMonitoringLogs",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientPhysicalExams",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Invoices",
                schema: "public");

            migrationBuilder.DropTable(
                name: "StaffMembers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "TeleconsultRecordingSessions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "YakapSubmissions",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabOrders",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Roles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Consultations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientYakapEnlistments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "QueueItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientIdentityVerifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Appointments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Rooms",
                schema: "public");

            migrationBuilder.DropTable(
                name: "RecordAttachments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Patients",
                schema: "public");
        }
    }
}
