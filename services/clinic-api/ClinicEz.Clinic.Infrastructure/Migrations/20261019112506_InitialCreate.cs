using System;
using Microsoft.EntityFrameworkCore.Migrations;

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
                .Annotation("Npgsql:PostgresExtension:btree_gist", ",,");

            migrationBuilder.CreateTable(
                name: "Appointments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    ServiceType = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Reason = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Notes = table.Column<string>(type: "text", nullable: true),
                    ShareFieldsJson = table.Column<string>(type: "text", nullable: false),
                    AttachedFileIdsJson = table.Column<string>(type: "text", nullable: false),
                    SharedScopes = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    SharedItemsJson = table.Column<string>(type: "text", nullable: false),
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
                    table.PrimaryKey("PK_Appointments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "clinic_staff_notifications",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_clinic_staff_notifications", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClinicAuditEntries",
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
                    table.PrimaryKey("PK_ClinicAuditEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClinicRoles",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClinicRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClinicRooms",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ClinicRooms", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ClinicSettings",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantSlug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    FacilitySlug = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClinicName = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    TaxIdentificationNumber = table.Column<string>(type: "text", nullable: true),
                    AccreditationNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    PmccNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    SoftwareCertificateId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    KonsultaEndpoint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsPhilHealthConfigured = table.Column<bool>(type: "boolean", nullable: false),
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
                    LetterheadHeader = table.Column<string>(type: "text", nullable: true),
                    LetterheadSubHeader = table.Column<string>(type: "text", nullable: true),
                    LetterheadAddress = table.Column<string>(type: "text", nullable: true),
                    LetterheadContact = table.Column<string>(type: "text", nullable: true),
                    LetterheadFooter = table.Column<string>(type: "text", nullable: true),
                    PrimaryColorHex = table.Column<string>(type: "text", nullable: false),
                    PrimaryLogoUrl = table.Column<string>(type: "text", nullable: true),
                    PaperSize = table.Column<string>(type: "text", nullable: false),
                    PreferredChartLayout = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "modal"),
                    IsJoinEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    JoinCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    JoinCodeExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    IsDirectoryPublished = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    IsOnlineBookingPaused = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    PatientSearchDisplayFieldsJson = table.Column<string>(type: "text", nullable: true),
                    EodReconciliationTime = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "21:00"),
                    AutoEodEnabled = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    TvDisplayMaskPatientNames = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    EnableQueuePushNotifications = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    QueuePushNotificationThreshold = table.Column<int>(type: "integer", nullable: false, defaultValue: 2),
                    EnableChipLevelQueueCalling = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    StaffNotificationRetentionDays = table.Column<int>(type: "integer", nullable: false),
                    EnableStatAudioAlert = table.Column<bool>(type: "boolean", nullable: false),
                    EnableStatVibrationAlert = table.Column<bool>(type: "boolean", nullable: false),
                    SpecialtyMode = table.Column<string>(type: "text", nullable: true),
                    EnableDentalModule = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_ClinicSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CustomFieldDefinitions",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_CustomFieldDefinitions", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DentalToothRecords",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    ToothNumber = table.Column<int>(type: "integer", nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Surface = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Notes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("PK_DentalToothRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "DoctorLeaves",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                name: "Invoices",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: true),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    InvoiceDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    AppointmentId = table.Column<Guid>(type: "uuid", nullable: true),
                    ConsultationId = table.Column<Guid>(type: "uuid", nullable: true),
                    AttendingDoctorId = table.Column<Guid>(type: "uuid", nullable: true),
                    AttendingDoctorName = table.Column<string>(type: "text", nullable: true),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Invoices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "LabOrders",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: true),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    ObservationsJson = table.Column<string>(type: "text", nullable: true),
                    PathologistImpression = table.Column<string>(type: "text", nullable: true),
                    VerifiedByPathologist = table.Column<string>(type: "text", nullable: true),
                    PathologistPrcLicense = table.Column<string>(type: "text", nullable: true),
                    ReportReleasedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    HasCriticalPanicAlert = table.Column<bool>(type: "boolean", nullable: false),
                    CriticalFindingsJson = table.Column<string>(type: "text", nullable: true),
                    PanicAlertTriggeredAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PanicAcknowledgedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    PanicAcknowledgedBy = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_LabOrders", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "MedicalCertificates",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_MedicalCertificates", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PatientAllergies",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientAllergies", x => x.Id);
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
                name: "PatientImmunizations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    PhilHealthLibrary = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PhilHealthCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    VaccineName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    BrandName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    Manufacturer = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
                    LotBatchNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ExpirationDate = table.Column<DateOnly>(type: "date", nullable: false),
                    DoseSequence = table.Column<int>(type: "integer", nullable: false),
                    IsSeriesCompleted = table.Column<bool>(type: "boolean", nullable: false),
                    Route = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    InjectionSite = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AdministeredAtUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AdministeredByStaffId = table.Column<Guid>(type: "uuid", nullable: false),
                    AdministeredByStaffName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PatientImmunizations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "PatientProblems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    Icd10Code = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    ProblemTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    IsChronicNcd = table.Column<bool>(type: "boolean", nullable: false),
                    OnsetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ResolvedDate = table.Column<DateOnly>(type: "date", nullable: true),
                    ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RecordedByDoctorId = table.Column<Guid>(type: "uuid", nullable: false),
                    RecordedByDoctorName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
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
                    table.PrimaryKey("PK_PatientProblems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Patients",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientCode = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    FirstName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    LastName = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    MiddleName = table.Column<string>(type: "text", nullable: true),
                    Suffix = table.Column<string>(type: "text", nullable: true),
                    DateOfBirth = table.Column<DateOnly>(type: "date", nullable: false),
                    Gender = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    CivilStatus = table.Column<string>(type: "text", nullable: true),
                    ContactNumber = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Email = table.Column<string>(type: "text", nullable: true),
                    AddressLine = table.Column<string>(type: "text", nullable: true),
                    Barangay = table.Column<string>(type: "text", nullable: true),
                    City = table.Column<string>(type: "text", nullable: true),
                    Province = table.Column<string>(type: "text", nullable: true),
                    EmergencyContactName = table.Column<string>(type: "text", nullable: true),
                    EmergencyContactPhone = table.Column<string>(type: "text", nullable: true),
                    EmergencyContactRelationship = table.Column<string>(type: "text", nullable: true),
                    PhilHealthNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: true),
                    PhilHealthCaseNo = table.Column<string>(type: "text", nullable: true),
                    PhilHealthEnlistmentNo = table.Column<string>(type: "text", nullable: true),
                    PhilHealthProfilingTransNo = table.Column<string>(type: "text", nullable: true),
                    SeniorCitizenId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PwdId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    BloodType = table.Column<string>(type: "text", nullable: true),
                    Allergies = table.Column<string>(type: "text", nullable: true),
                    ChronicConditions = table.Column<string>(type: "text", nullable: true),
                    Alerts = table.Column<string>(type: "text", nullable: true),
                    SyncPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    ClinicEzId = table.Column<string>(type: "character varying(40)", maxLength: 40, nullable: true),
                    ShareGrantId = table.Column<Guid>(type: "uuid", nullable: true),
                    ShareGrantScopes = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    ShareGrantExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CustomFields = table.Column<string>(type: "text", nullable: false),
                    VerificationStatus = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false, defaultValue: "Verified"),
                    PersonalMedicalHistoryNotes = table.Column<string>(type: "text", nullable: true),
                    FamilyMedicalHistoryNotes = table.Column<string>(type: "text", nullable: true),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Products", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "RecordAttachments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RecordAttachments", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ReferralLetters",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    ClinicalSummary = table.Column<string>(type: "text", nullable: false),
                    CurrentMedications = table.Column<string>(type: "text", nullable: true),
                    AttachedDiagnostics = table.Column<string>(type: "text", nullable: true),
                    IsSigned = table.Column<bool>(type: "boolean", nullable: false),
                    SignedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_ReferralLetters", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ServiceItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: true),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    Name = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    StandardPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    PhilHealthCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthDescription = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    IsPhilHealthFormulary = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
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
                    table.PrimaryKey("PK_ServiceItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ShareImports",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    RequestedByStaffId = table.Column<Guid>(type: "uuid", nullable: true),
                    Purpose = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    AddToQueue = table.Column<bool>(type: "boolean", nullable: false),
                    ChiefComplaint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    DenialReason = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    DenialCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    ClinicPatientId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ShareImports", x => x.Id);
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
                name: "YakapTransmittals",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    TransmittalNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ReportTagging = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    EffectiveYear = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false),
                    PackageType = table.Column<string>(type: "character varying(20)", maxLength: 20, nullable: false),
                    Status = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    PhilHealthTransactionNumber = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    RawXmlPayload = table.Column<string>(type: "text", nullable: true),
                    EncryptedPayloadHash = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ValidationErrors = table.Column<string>(type: "text", nullable: false),
                    SubmittedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SubmittedBy = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: true),
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
                    table.PrimaryKey("PK_YakapTransmittals", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StaffMembers",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StaffMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StaffMembers_ClinicRoles_ClinicRoleId",
                        column: x => x.ClinicRoleId,
                        principalSchema: "public",
                        principalTable: "ClinicRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "Procedures",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "text", nullable: true),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Procedures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Procedures_ClinicRooms_TargetRoomId",
                        column: x => x.TargetRoomId,
                        principalSchema: "public",
                        principalTable: "ClinicRooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "QueueItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    CheckInTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CalledTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CompletedTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ChiefComplaint = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    SyncPatientId = table.Column<Guid>(type: "uuid", nullable: true),
                    ApproachingNotificationSent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
                    CalledNotificationSent = table.Column<bool>(type: "boolean", nullable: false, defaultValue: false),
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
                    table.PrimaryKey("PK_QueueItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_QueueItems_Appointments_AppointmentId",
                        column: x => x.AppointmentId,
                        principalSchema: "public",
                        principalTable: "Appointments",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_QueueItems_ClinicRooms_RoomId",
                        column: x => x.RoomId,
                        principalSchema: "public",
                        principalTable: "ClinicRooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                name: "InvoiceLineItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ServiceItemId = table.Column<Guid>(type: "uuid", nullable: true),
                    ItemCode = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    UnitPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    TotalPrice = table.Column<decimal>(type: "numeric(18,2)", precision: 18, scale: 2, nullable: false)
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
                    TenantId = table.Column<string>(type: "text", nullable: true),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                    PhilHealthServiceCode = table.Column<string>(type: "text", nullable: true)
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
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                name: "NcdRiskAssessments",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    CalculatedRiskScorePercent = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    VoidReason = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_NcdRiskAssessments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NcdRiskAssessments_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PatientFamilyHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConditionTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Icd10Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SpecificDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    Relationship = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
                    ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("PK_PatientFamilyHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientFamilyHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PatientPastMedicalHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConditionTitle = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    PhilHealthMdiseaseCode = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    Icd10Code = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SpecificDescription = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
                    OnsetDate = table.Column<DateOnly>(type: "date", nullable: true),
                    IsResolved = table.Column<bool>(type: "boolean", nullable: false),
                    ClinicalNotes = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("PK_PatientPastMedicalHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientPastMedicalHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PatientPhysicalExamProfiles",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    GenSurveyId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    GenSurveyRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    SkinId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    SkinRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    HeentId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "11"),
                    HeentRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    ChestId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "6"),
                    ChestRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    HeartId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "5"),
                    HeartRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    AbdomenId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "7"),
                    AbdomenRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    NeuroId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "6"),
                    NeuroRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    RectalId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    RectalRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
                    GuId = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "1"),
                    GuRemarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("PK_PatientPhysicalExamProfiles", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientPhysicalExamProfiles_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PatientReproductiveHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsApplicable = table.Column<bool>(type: "boolean", nullable: false),
                    MenarcheAge = table.Column<int>(type: "integer", nullable: true),
                    LastMenstrualPeriod = table.Column<DateOnly>(type: "date", nullable: true),
                    PeriodDurationDays = table.Column<int>(type: "integer", nullable: true),
                    CycleIntervalDays = table.Column<int>(type: "integer", nullable: true),
                    PadsPerDay = table.Column<int>(type: "integer", nullable: true),
                    IsMenopausal = table.Column<bool>(type: "boolean", nullable: false),
                    MenopauseAge = table.Column<int>(type: "integer", nullable: true),
                    ContraceptiveMethod = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: true),
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
                    table.PrimaryKey("PK_PatientReproductiveHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientReproductiveHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PatientSocialHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    IsSmoker = table.Column<bool>(type: "boolean", nullable: false),
                    PacksPerDay = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    CigarettesPerDay = table.Column<int>(type: "integer", nullable: true),
                    YearsSmoking = table.Column<int>(type: "integer", nullable: true),
                    SmokingPackYears = table.Column<decimal>(type: "numeric(5,2)", precision: 5, scale: 2, nullable: true),
                    SmokingStoppedDate = table.Column<DateOnly>(type: "date", nullable: true),
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
                    DietaryHabits = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: true),
                    Remarks = table.Column<string>(type: "character varying(1000)", maxLength: 1000, nullable: true),
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
                    table.PrimaryKey("PK_PatientSocialHistories", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PatientSocialHistories_Patients_PatientId",
                        column: x => x.PatientId,
                        principalSchema: "public",
                        principalTable: "Patients",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PatientSurgicalHistories",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProcedureName = table.Column<string>(type: "character varying(255)", maxLength: 255, nullable: false),
                    SurgeryDate = table.Column<DateOnly>(type: "date", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RefreshTokens",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    StaffMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                name: "Consultations",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    IsYakapEligible = table.Column<bool>(type: "boolean", nullable: false),
                    PhilHealthSignSympCode = table.Column<string>(type: "text", nullable: true),
                    PhilHealthOtherComplaint = table.Column<string>(type: "text", nullable: true),
                    PhilHealthPainSite = table.Column<string>(type: "text", nullable: true),
                    PhilHealthCaseNo = table.Column<string>(type: "text", nullable: true),
                    PhilHealthSoapTransNo = table.Column<string>(type: "text", nullable: true),
                    DoctorPhilHealthPan = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    PhilHealthAtc = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HciCaseNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    HciTransNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    SoapTransNo = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    GeneralSurveyId = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    GeneralSurveyRemarks = table.Column<string>(type: "text", nullable: true),
                    PhysicalExamFindingsJson = table.Column<string>(type: "text", nullable: true),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                        name: "FK_Consultations_QueueItems_QueueItemId",
                        column: x => x.QueueItemId,
                        principalSchema: "public",
                        principalTable: "QueueItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "TriageVitals",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    QueueItemId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    Notes = table.Column<string>(type: "text", nullable: true),
                    PreAssessmentNotes = table.Column<string>(type: "text", nullable: true),
                    PreAssessmentRemarks = table.Column<string>(type: "text", nullable: true),
                    TriageAcuityReason = table.Column<string>(type: "text", nullable: true),
                    VisualAcuityLeft = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
                    VisualAcuityRight = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: true),
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TriageVitals", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TriageVitals_QueueItems_QueueItemId",
                        column: x => x.QueueItemId,
                        principalSchema: "public",
                        principalTable: "QueueItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
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
                    DeletedBy = table.Column<string>(type: "text", nullable: true)
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
                name: "YakapTransmittalItems",
                schema: "public",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<string>(type: "character varying(100)", maxLength: 100, nullable: false),
                    ClinicId = table.Column<Guid>(type: "uuid", nullable: false),
                    YakapTransmittalId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientId = table.Column<Guid>(type: "uuid", nullable: false),
                    PatientName = table.Column<string>(type: "character varying(150)", maxLength: 150, nullable: false),
                    PhilHealthIdentificationNumber = table.Column<string>(type: "character varying(30)", maxLength: 30, nullable: false),
                    ConsultationEncounterId = table.Column<Guid>(type: "uuid", nullable: true),
                    EncounterDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    ItemType = table.Column<string>(type: "character varying(50)", maxLength: 50, nullable: false),
                    ReportStatus = table.Column<string>(type: "character varying(10)", maxLength: 10, nullable: false, defaultValue: "U"),
                    DeficiencyRemarks = table.Column<string>(type: "character varying(500)", maxLength: 500, nullable: true),
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
                    table.PrimaryKey("PK_YakapTransmittalItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_YakapTransmittalItems_Consultations_ConsultationEncounterId",
                        column: x => x.ConsultationEncounterId,
                        principalSchema: "public",
                        principalTable: "Consultations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_YakapTransmittalItems_YakapTransmittals_YakapTransmittalId",
                        column: x => x.YakapTransmittalId,
                        principalSchema: "public",
                        principalTable: "YakapTransmittals",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_ClinicId_DoctorId_ScheduledAt_EndTimeUtc",
                schema: "public",
                table: "Appointments",
                columns: new[] { "ClinicId", "DoctorId", "ScheduledAt", "EndTimeUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_ScheduledAt",
                schema: "public",
                table: "Appointments",
                column: "ScheduledAt");

            migrationBuilder.CreateIndex(
                name: "IX_Appointments_TenantId_ClinicId",
                schema: "public",
                table: "Appointments",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_clinic_staff_notifications_ClinicId_IsRead_CreatedAt",
                schema: "public",
                table: "clinic_staff_notifications",
                columns: new[] { "ClinicId", "IsRead", "CreatedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_clinic_staff_notifications_RecipientStaffId",
                schema: "public",
                table: "clinic_staff_notifications",
                column: "RecipientStaffId");

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_ActorStaffId_Timestamp",
                schema: "public",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "ActorStaffId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_Category_Timestamp",
                schema: "public",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "Category", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_PatientId_Timestamp",
                schema: "public",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "PatientId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_Severity_Timestamp",
                schema: "public",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "Severity", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_ClinicId_TargetEntityType_TargetEntityId",
                schema: "public",
                table: "ClinicAuditEntries",
                columns: new[] { "ClinicId", "TargetEntityType", "TargetEntityId" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicAuditEntries_TenantId_ClinicId_Timestamp",
                schema: "public",
                table: "ClinicAuditEntries",
                columns: new[] { "TenantId", "ClinicId", "Timestamp" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicRoles_TenantId_ClinicId",
                schema: "public",
                table: "ClinicRoles",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicRooms_ClinicId_Name",
                schema: "public",
                table: "ClinicRooms",
                columns: new[] { "ClinicId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicRooms_TenantId_ClinicId_DisplayOrder",
                schema: "public",
                table: "ClinicRooms",
                columns: new[] { "TenantId", "ClinicId", "DisplayOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_ClinicSettings_TenantId_ClinicId",
                schema: "public",
                table: "ClinicSettings",
                columns: new[] { "TenantId", "ClinicId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Consultations_AppointmentId",
                schema: "public",
                table: "Consultations",
                column: "AppointmentId");

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
                name: "IX_Consultations_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "Consultations",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_CustomFieldDefinitions_TenantId_ClinicId_EntityType_FieldKey",
                schema: "public",
                table: "CustomFieldDefinitions",
                columns: new[] { "TenantId", "ClinicId", "EntityType", "FieldKey" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_ClinicId_ConsultationId",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "ClinicId", "ConsultationId" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_ClinicId_PatientId_ToothNumber",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "ClinicId", "PatientId", "ToothNumber" });

            migrationBuilder.CreateIndex(
                name: "IX_DentalToothRecords_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "DentalToothRecords",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

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
                name: "IX_DoctorScheduleTemplates_ClinicId_DoctorId_DayOfWeek_IsActive",
                schema: "public",
                table: "DoctorScheduleTemplates",
                columns: new[] { "ClinicId", "DoctorId", "DayOfWeek", "IsActive" });

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
                name: "IX_InvoiceLineItems_InvoiceId",
                schema: "public",
                table: "InvoiceLineItems",
                column: "InvoiceId");

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
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_LabOrderItems_LabOrderId",
                schema: "public",
                table: "LabOrderItems",
                column: "LabOrderId");

            migrationBuilder.CreateIndex(
                name: "IX_LabOrders_TenantId_ClinicId_OrderNumber",
                schema: "public",
                table: "LabOrders",
                columns: new[] { "TenantId", "ClinicId", "OrderNumber" },
                unique: true);

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
                filter: "\"ReportId\" IS NOT NULL");

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
                name: "IX_MedicalCertificates_TenantId_ClinicId_CertificateNumber",
                schema: "public",
                table: "MedicalCertificates",
                columns: new[] { "TenantId", "ClinicId", "CertificateNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MedicalCertificates_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "MedicalCertificates",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_NcdRiskAssessments_ClinicId_AssessmentDate",
                schema: "public",
                table: "NcdRiskAssessments",
                columns: new[] { "ClinicId", "AssessmentDate" });

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
                name: "IX_PatientAllergies_ClinicId_PatientId_Category",
                schema: "public",
                table: "PatientAllergies",
                columns: new[] { "ClinicId", "PatientId", "Category" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientAllergies_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientAllergies",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientCodeSequenceTrackers_TenantId_ClinicId_Year",
                schema: "public",
                table: "PatientCodeSequenceTrackers",
                columns: new[] { "TenantId", "ClinicId", "Year" },
                unique: true);

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
                name: "IX_PatientImmunizations_ClinicId_AdministeredAtUtc",
                schema: "public",
                table: "PatientImmunizations",
                columns: new[] { "ClinicId", "AdministeredAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_LotBatchNumber_ExpirationDate",
                schema: "public",
                table: "PatientImmunizations",
                columns: new[] { "LotBatchNumber", "ExpirationDate" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientImmunizations_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientImmunizations",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPastMedicalHistories_ClinicId_PatientId_PhilHealthMd~",
                schema: "public",
                table: "PatientPastMedicalHistories",
                columns: new[] { "ClinicId", "PatientId", "PhilHealthMdiseaseCode" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPastMedicalHistories_PatientId",
                schema: "public",
                table: "PatientPastMedicalHistories",
                column: "PatientId");

            migrationBuilder.CreateIndex(
                name: "IX_PatientPastMedicalHistories_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientPastMedicalHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExamProfiles_PatientId",
                schema: "public",
                table: "PatientPhysicalExamProfiles",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientPhysicalExamProfiles_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientPhysicalExamProfiles",
                columns: new[] { "TenantId", "ClinicId", "PatientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientProblems_ClinicId_Icd10Code",
                schema: "public",
                table: "PatientProblems",
                columns: new[] { "ClinicId", "Icd10Code" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientProblems_ClinicId_PatientId_Status",
                schema: "public",
                table: "PatientProblems",
                columns: new[] { "ClinicId", "PatientId", "Status" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientProblems_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientProblems",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_PatientReproductiveHistories_PatientId",
                schema: "public",
                table: "PatientReproductiveHistories",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientReproductiveHistories_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientReproductiveHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_ClinicEzId",
                schema: "public",
                table: "Patients",
                columns: new[] { "ClinicId", "ClinicEzId" });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_ClinicId_SyncPatientId",
                schema: "public",
                table: "Patients",
                columns: new[] { "ClinicId", "SyncPatientId" });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_TenantId_ClinicId_LastName_FirstName",
                schema: "public",
                table: "Patients",
                columns: new[] { "TenantId", "ClinicId", "LastName", "FirstName" });

            migrationBuilder.CreateIndex(
                name: "IX_Patients_TenantId_ClinicId_PatientCode",
                schema: "public",
                table: "Patients",
                columns: new[] { "TenantId", "ClinicId", "PatientCode" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientSocialHistories_PatientId",
                schema: "public",
                table: "PatientSocialHistories",
                column: "PatientId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PatientSocialHistories_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "PatientSocialHistories",
                columns: new[] { "TenantId", "ClinicId", "PatientId" },
                unique: true);

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
                name: "IX_Payments_InvoiceId",
                schema: "public",
                table: "Payments",
                column: "InvoiceId");

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
                name: "IX_Prescriptions_ConsultationEncounterId",
                schema: "public",
                table: "Prescriptions",
                column: "ConsultationEncounterId");

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
                name: "IX_QueueItems_AppointmentId",
                schema: "public",
                table: "QueueItems",
                column: "AppointmentId");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_RoomId",
                schema: "public",
                table: "QueueItems",
                column: "RoomId");

            migrationBuilder.CreateIndex(
                name: "IX_QueueItems_TenantId_ClinicId_QueueDate",
                schema: "public",
                table: "QueueItems",
                columns: new[] { "TenantId", "ClinicId", "QueueDate" });

            migrationBuilder.CreateIndex(
                name: "IX_RecordAttachments_TenantId_ClinicId_PatientId",
                schema: "public",
                table: "RecordAttachments",
                columns: new[] { "TenantId", "ClinicId", "PatientId" });

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
                unique: true);

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
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ServiceItems_TenantId_ClinicId_Code",
                schema: "public",
                table: "ServiceItems",
                columns: new[] { "TenantId", "ClinicId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ShareImports_ClinicId_RequestedAt",
                schema: "public",
                table: "ShareImports",
                columns: new[] { "ClinicId", "RequestedAt" });

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_ClinicId_Email",
                schema: "public",
                table: "StaffMembers",
                columns: new[] { "ClinicId", "Email" });

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_ClinicRoleId",
                schema: "public",
                table: "StaffMembers",
                column: "ClinicRoleId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_TenantId_ClinicId",
                schema: "public",
                table: "StaffMembers",
                columns: new[] { "TenantId", "ClinicId" });

            migrationBuilder.CreateIndex(
                name: "IX_TriageVitals_QueueItemId",
                schema: "public",
                table: "TriageVitals",
                column: "QueueItemId",
                unique: true);

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
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_workspace_profiles_TenantSlug",
                schema: "public",
                table: "workspace_profiles",
                column: "TenantSlug");

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittalItems_ConsultationEncounterId",
                schema: "public",
                table: "YakapTransmittalItems",
                column: "ConsultationEncounterId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittalItems_TenantId_ClinicId_YakapTransmittalId",
                schema: "public",
                table: "YakapTransmittalItems",
                columns: new[] { "TenantId", "ClinicId", "YakapTransmittalId" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittalItems_YakapTransmittalId",
                schema: "public",
                table: "YakapTransmittalItems",
                column: "YakapTransmittalId");

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittals_TenantId_BranchId",
                schema: "public",
                table: "YakapTransmittals",
                columns: new[] { "TenantId", "BranchId" });

            migrationBuilder.CreateIndex(
                name: "IX_YakapTransmittals_TenantId_ClinicId_TransmittalNumber",
                schema: "public",
                table: "YakapTransmittals",
                columns: new[] { "TenantId", "ClinicId", "TransmittalNumber" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "clinic_staff_notifications",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ClinicAuditEntries",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ClinicSettings",
                schema: "public");

            migrationBuilder.DropTable(
                name: "CustomFieldDefinitions",
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
                name: "LabOrderItems",
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
                name: "PatientAllergies",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientCodeSequenceTrackers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientFamilyHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientImmunizations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientPastMedicalHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientPhysicalExamProfiles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientProblems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientReproductiveHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientSocialHistories",
                schema: "public");

            migrationBuilder.DropTable(
                name: "PatientSurgicalHistories",
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
                name: "RecordAttachments",
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
                name: "ShareImports",
                schema: "public");

            migrationBuilder.DropTable(
                name: "TriageVitals",
                schema: "public");

            migrationBuilder.DropTable(
                name: "UploadGrants",
                schema: "public");

            migrationBuilder.DropTable(
                name: "workspace_profiles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "YakapTransmittalItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "DoctorScheduleTemplates",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Patients",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Invoices",
                schema: "public");

            migrationBuilder.DropTable(
                name: "StaffMembers",
                schema: "public");

            migrationBuilder.DropTable(
                name: "LabOrders",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Consultations",
                schema: "public");

            migrationBuilder.DropTable(
                name: "YakapTransmittals",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ClinicRoles",
                schema: "public");

            migrationBuilder.DropTable(
                name: "QueueItems",
                schema: "public");

            migrationBuilder.DropTable(
                name: "Appointments",
                schema: "public");

            migrationBuilder.DropTable(
                name: "ClinicRooms",
                schema: "public");
        }
    }
}
