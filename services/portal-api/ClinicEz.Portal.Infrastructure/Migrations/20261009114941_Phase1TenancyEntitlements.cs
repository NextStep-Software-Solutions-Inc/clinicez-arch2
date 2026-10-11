using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ClinicEz.Portal.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class Phase1TenancyEntitlements : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SubscriptionPlanFeatures",
                schema: "main");

            migrationBuilder.DropTable(
                name: "SubscriptionPlans",
                schema: "main");

            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_TenantId_Email",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropIndex(
                name: "IX_Facilities_BranchId",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "SubscriptionId",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionPlanId",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "SubscriptionStatus",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropColumn(
                name: "XenditCustomerId",
                schema: "main",
                table: "Tenants");

            migrationBuilder.AddColumn<Guid>(
                name: "WorkspaceMemberId",
                schema: "main",
                table: "StaffMembers",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<string>(
                name: "AppVersion",
                schema: "main",
                table: "Facilities",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "LastSeenAt",
                schema: "main",
                table: "Facilities",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EdgeHubClients",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    CellId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Service = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: false),
                    ClientId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
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
                    table.PrimaryKey("PK_EdgeHubClients", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "EntitlementOverrides",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Limit = table.Column<long>(type: "bigint", nullable: true),
                    Enabled = table.Column<bool>(type: "boolean", nullable: true),
                    Reason = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
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
                    table.PrimaryKey("PK_EntitlementOverrides", x => x.Id);
                    table.ForeignKey(
                        name: "FK_EntitlementOverrides_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FacilityAllocations",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    MaxStaff = table.Column<int>(type: "integer", nullable: true),
                    MaxStorageMb = table.Column<int>(type: "integer", nullable: true),
                    ConcurrentTerminals = table.Column<int>(type: "integer", nullable: true),
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
                    table.PrimaryKey("PK_FacilityAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FacilityAllocations_Facilities_FacilityId",
                        column: x => x.FacilityId,
                        principalSchema: "main",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FacilityLinks",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    SourceFacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceTenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetFacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetTenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Scopes = table.Column<int>(type: "integer", nullable: false),
                    RequestedBy = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    ApprovedBy = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
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
                    table.PrimaryKey("PK_FacilityLinks", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FacilityLinks_Facilities_SourceFacilityId",
                        column: x => x.SourceFacilityId,
                        principalSchema: "main",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_FacilityLinks_Facilities_TargetFacilityId",
                        column: x => x.TargetFacilityId,
                        principalSchema: "main",
                        principalTable: "Facilities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "FinanceDailySummaries",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    Day = table.Column<DateOnly>(type: "date", nullable: false),
                    SourceType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    TotalPaid = table.Column<decimal>(type: "numeric", nullable: false),
                    TotalReversed = table.Column<decimal>(type: "numeric", nullable: false),
                    PaidInvoiceCount = table.Column<int>(type: "integer", nullable: false),
                    ReversedInvoiceCount = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_FinanceDailySummaries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FinanceInvoiceRecords",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    FacilityId = table.Column<Guid>(type: "uuid", nullable: false),
                    BranchId = table.Column<Guid>(type: "uuid", nullable: true),
                    PaidDay = table.Column<DateOnly>(type: "date", nullable: false),
                    SourceType = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Currency = table.Column<string>(type: "character varying(3)", maxLength: 3, nullable: false),
                    PaidAmount = table.Column<decimal>(type: "numeric", nullable: false),
                    ReversedAmount = table.Column<decimal>(type: "numeric", nullable: false),
                    Reversed = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_FinanceInvoiceRecords", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Plans",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Slug = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Rank = table.Column<int>(type: "integer", nullable: false),
                    Version = table.Column<int>(type: "integer", nullable: false),
                    PriceMonthly = table.Column<decimal>(type: "numeric", nullable: false),
                    PriceAnnually = table.Column<decimal>(type: "numeric", nullable: false),
                    IsHighlighted = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresCheckout = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_Plans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WorkspaceMembers",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    Email = table.Column<string>(type: "character varying(254)", maxLength: 254, nullable: false),
                    FullName = table.Column<string>(type: "text", nullable: false),
                    Role = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    InvitationToken = table.Column<string>(type: "text", nullable: true),
                    InvitationExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    JoinedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_WorkspaceMembers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WorkspaceMembers_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlanEntitlements",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Kind = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    Limit = table.Column<long>(type: "bigint", nullable: true),
                    Enabled = table.Column<bool>(type: "boolean", nullable: true),
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
                    table.PrimaryKey("PK_PlanEntitlements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanEntitlements_Plans_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "main",
                        principalTable: "Plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PlanFeatures",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_PlanFeatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PlanFeatures_Plans_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "main",
                        principalTable: "Plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Subscriptions",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    PlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    IsAnnual = table.Column<bool>(type: "boolean", nullable: false),
                    TrialEndsAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    CurrentPeriodEnd = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    EntitlementVersion = table.Column<int>(type: "integer", nullable: false),
                    ProviderName = table.Column<string>(type: "character varying(32)", maxLength: 32, nullable: true),
                    ProviderCustomerId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    ProviderSubscriptionId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
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
                    table.PrimaryKey("PK_Subscriptions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Subscriptions_Plans_PlanId",
                        column: x => x.PlanId,
                        principalSchema: "main",
                        principalTable: "Plans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Subscriptions_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OwnershipTransfers",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetMemberId = table.Column<Guid>(type: "uuid", nullable: false),
                    OfferedByUserId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Status = table.Column<string>(type: "character varying(16)", maxLength: 16, nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ResolvedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
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
                    table.PrimaryKey("PK_OwnershipTransfers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OwnershipTransfers_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OwnershipTransfers_WorkspaceMembers_TargetMemberId",
                        column: x => x.TargetMemberId,
                        principalSchema: "main",
                        principalTable: "WorkspaceMembers",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql("""
                INSERT INTO main."WorkspaceMembers"
                    ("Id", "TenantId", "UserId", "Email", "FullName", "Role", "Status", "InvitationToken",
                     "InvitationExpiresAt", "JoinedAt", "CreatedAt", "CreatedBy", "UpdatedAt", "UpdatedBy",
                     "IsDeleted", "DeletedAt", "DeletedBy")
                SELECT s."Id", s."TenantId", s."UserId", LEFT(s."Email", 254), s."FullName",
                       CASE WHEN s."Role" IN ('Owner', 'Admin') THEN 'Admin' ELSE 'Member' END,
                       CASE s."Status" WHEN 'PendingInvitation' THEN 'Invited' WHEN 'Suspended' THEN 'Suspended' ELSE 'Active' END,
                       s."InvitationToken", s."InvitationExpiresAt", s."JoinedAt", s."CreatedAt", s."CreatedBy",
                       s."UpdatedAt", s."UpdatedBy", s."IsDeleted", s."DeletedAt", s."DeletedBy"
                FROM main."StaffMembers" s;

                UPDATE main."WorkspaceMembers" m
                SET "Role" = 'Owner'
                FROM main."Tenants" t
                WHERE m."TenantId" = t."Id" AND m."UserId" = t."OwnerId";

                INSERT INTO main."WorkspaceMembers"
                    ("Id", "TenantId", "UserId", "Email", "FullName", "Role", "Status", "JoinedAt",
                     "CreatedAt", "CreatedBy", "IsDeleted")
                SELECT gen_random_uuid(), t."Id", t."OwnerId", LEFT(t."Email", 254),
                       TRIM(t."FirstName" || ' ' || t."LastName"), 'Owner', 'Active', t."CreatedAt",
                       t."CreatedAt", t."CreatedBy", FALSE
                FROM main."Tenants" t
                WHERE NOT EXISTS (
                    SELECT 1 FROM main."WorkspaceMembers" m WHERE m."TenantId" = t."Id" AND m."Role" = 'Owner');

                UPDATE main."StaffMembers" SET "WorkspaceMemberId" = "Id";
                """);

            migrationBuilder.DropColumn(
                name: "Email",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "FullName",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "InvitationExpiresAt",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "InvitationToken",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "JoinedAt",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "Status",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "UserId",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.CreateIndex(
                name: "UX_Tenants_OwnerId_Active",
                schema: "main",
                table: "Tenants",
                column: "OwnerId",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_TenantId",
                schema: "main",
                table: "StaffMembers",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_WorkspaceMemberId",
                schema: "main",
                table: "StaffMembers",
                column: "WorkspaceMemberId",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_BranchId_FacilityType",
                schema: "main",
                table: "Facilities",
                columns: new[] { "BranchId", "FacilityType" },
                unique: true,
                filter: "\"IsDeleted\" = false AND \"BranchId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_EdgeHubClients_TenantId_Service",
                schema: "main",
                table: "EdgeHubClients",
                columns: new[] { "TenantId", "Service" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_EntitlementOverrides_TenantId_Key",
                schema: "main",
                table: "EntitlementOverrides",
                columns: new[] { "TenantId", "Key" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityAllocations_FacilityId",
                schema: "main",
                table: "FacilityAllocations",
                column: "FacilityId",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityAllocations_TenantId",
                schema: "main",
                table: "FacilityAllocations",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityLinks_SourceFacilityId_TargetFacilityId",
                schema: "main",
                table: "FacilityLinks",
                columns: new[] { "SourceFacilityId", "TargetFacilityId" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityLinks_SourceTenantId",
                schema: "main",
                table: "FacilityLinks",
                column: "SourceTenantId");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityLinks_TargetFacilityId",
                schema: "main",
                table: "FacilityLinks",
                column: "TargetFacilityId");

            migrationBuilder.CreateIndex(
                name: "IX_FacilityLinks_TargetTenantId",
                schema: "main",
                table: "FacilityLinks",
                column: "TargetTenantId");

            migrationBuilder.CreateIndex(
                name: "IX_FinanceDailySummaries_TenantId_Day",
                schema: "main",
                table: "FinanceDailySummaries",
                columns: new[] { "TenantId", "Day" });

            migrationBuilder.CreateIndex(
                name: "IX_FinanceDailySummaries_TenantId_FacilityId_Day_SourceType_Cu~",
                schema: "main",
                table: "FinanceDailySummaries",
                columns: new[] { "TenantId", "FacilityId", "Day", "SourceType", "Currency" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_FinanceInvoiceRecords_InvoiceId",
                schema: "main",
                table: "FinanceInvoiceRecords",
                column: "InvoiceId",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_FinanceInvoiceRecords_TenantId",
                schema: "main",
                table: "FinanceInvoiceRecords",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_OwnershipTransfers_TargetMemberId",
                schema: "main",
                table: "OwnershipTransfers",
                column: "TargetMemberId");

            migrationBuilder.CreateIndex(
                name: "IX_OwnershipTransfers_TenantId",
                schema: "main",
                table: "OwnershipTransfers",
                column: "TenantId",
                unique: true,
                filter: "\"IsDeleted\" = false AND \"Status\" = 'Pending'");

            migrationBuilder.CreateIndex(
                name: "IX_PlanEntitlements_PlanId_Key",
                schema: "main",
                table: "PlanEntitlements",
                columns: new[] { "PlanId", "Key" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_PlanFeatures_PlanId",
                schema: "main",
                table: "PlanFeatures",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_Plans_Slug",
                schema: "main",
                table: "Plans",
                column: "Slug",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Subscriptions_PlanId",
                schema: "main",
                table: "Subscriptions",
                column: "PlanId");

            migrationBuilder.CreateIndex(
                name: "IX_Subscriptions_ProviderCustomerId",
                schema: "main",
                table: "Subscriptions",
                column: "ProviderCustomerId");

            migrationBuilder.CreateIndex(
                name: "IX_Subscriptions_ProviderSubscriptionId",
                schema: "main",
                table: "Subscriptions",
                column: "ProviderSubscriptionId");

            migrationBuilder.CreateIndex(
                name: "IX_Subscriptions_TenantId",
                schema: "main",
                table: "Subscriptions",
                column: "TenantId",
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMembers_TenantId_Email",
                schema: "main",
                table: "WorkspaceMembers",
                columns: new[] { "TenantId", "Email" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMembers_TenantId_UserId",
                schema: "main",
                table: "WorkspaceMembers",
                columns: new[] { "TenantId", "UserId" },
                unique: true,
                filter: "\"IsDeleted\" = false AND \"UserId\" IS NOT NULL");

            migrationBuilder.CreateIndex(
                name: "IX_WorkspaceMembers_UserId",
                schema: "main",
                table: "WorkspaceMembers",
                column: "UserId");

            migrationBuilder.AddForeignKey(
                name: "FK_StaffMembers_WorkspaceMembers_WorkspaceMemberId",
                schema: "main",
                table: "StaffMembers",
                column: "WorkspaceMemberId",
                principalSchema: "main",
                principalTable: "WorkspaceMembers",
                principalColumn: "Id",
                onDelete: ReferentialAction.Cascade);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_StaffMembers_WorkspaceMembers_WorkspaceMemberId",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropTable(
                name: "EdgeHubClients",
                schema: "main");

            migrationBuilder.DropTable(
                name: "EntitlementOverrides",
                schema: "main");

            migrationBuilder.DropTable(
                name: "FacilityAllocations",
                schema: "main");

            migrationBuilder.DropTable(
                name: "FacilityLinks",
                schema: "main");

            migrationBuilder.DropTable(
                name: "FinanceDailySummaries",
                schema: "main");

            migrationBuilder.DropTable(
                name: "FinanceInvoiceRecords",
                schema: "main");

            migrationBuilder.DropTable(
                name: "OwnershipTransfers",
                schema: "main");

            migrationBuilder.DropTable(
                name: "PlanEntitlements",
                schema: "main");

            migrationBuilder.DropTable(
                name: "PlanFeatures",
                schema: "main");

            migrationBuilder.DropTable(
                name: "Subscriptions",
                schema: "main");

            migrationBuilder.DropTable(
                name: "WorkspaceMembers",
                schema: "main");

            migrationBuilder.DropTable(
                name: "Plans",
                schema: "main");

            migrationBuilder.DropIndex(
                name: "UX_Tenants_OwnerId_Active",
                schema: "main",
                table: "Tenants");

            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_TenantId",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropIndex(
                name: "IX_StaffMembers_WorkspaceMemberId",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropIndex(
                name: "IX_Facilities_BranchId_FacilityType",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "WorkspaceMemberId",
                schema: "main",
                table: "StaffMembers");

            migrationBuilder.DropColumn(
                name: "AppVersion",
                schema: "main",
                table: "Facilities");

            migrationBuilder.DropColumn(
                name: "LastSeenAt",
                schema: "main",
                table: "Facilities");

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionId",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionPlanId",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "SubscriptionStatus",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "XenditCustomerId",
                schema: "main",
                table: "Tenants",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "Email",
                schema: "main",
                table: "StaffMembers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "FullName",
                schema: "main",
                table: "StaffMembers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "InvitationExpiresAt",
                schema: "main",
                table: "StaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "InvitationToken",
                schema: "main",
                table: "StaffMembers",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "JoinedAt",
                schema: "main",
                table: "StaffMembers",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Status",
                schema: "main",
                table: "StaffMembers",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<string>(
                name: "UserId",
                schema: "main",
                table: "StaffMembers",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "SubscriptionPlans",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    Description = table.Column<string>(type: "text", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    IsHighlighted = table.Column<bool>(type: "boolean", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    PriceAnnually = table.Column<decimal>(type: "numeric", nullable: false),
                    PriceMonthly = table.Column<decimal>(type: "numeric", nullable: false),
                    RequiresCheckout = table.Column<bool>(type: "boolean", nullable: false),
                    Slug = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true),
                    XenditPlanId = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionPlans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionPlanFeatures",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    SubscriptionPlanId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    CreatedBy = table.Column<string>(type: "text", nullable: false),
                    DeletedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    DeletedBy = table.Column<string>(type: "text", nullable: true),
                    DisplayOrder = table.Column<int>(type: "integer", nullable: false),
                    IsDeleted = table.Column<bool>(type: "boolean", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    UpdatedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    UpdatedBy = table.Column<string>(type: "text", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SubscriptionPlanFeatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubscriptionPlanFeatures_SubscriptionPlans_SubscriptionPlan~",
                        column: x => x.SubscriptionPlanId,
                        principalSchema: "main",
                        principalTable: "SubscriptionPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StaffMembers_TenantId_Email",
                schema: "main",
                table: "StaffMembers",
                columns: new[] { "TenantId", "Email" },
                unique: true,
                filter: "\"IsDeleted\" = false");

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_BranchId",
                schema: "main",
                table: "Facilities",
                column: "BranchId");

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlanFeatures_SubscriptionPlanId",
                schema: "main",
                table: "SubscriptionPlanFeatures",
                column: "SubscriptionPlanId");

            migrationBuilder.CreateIndex(
                name: "IX_SubscriptionPlans_Slug",
                schema: "main",
                table: "SubscriptionPlans",
                column: "Slug",
                unique: true);
        }
    }
}
