using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.EnsureSchema(
                name: "main");

            migrationBuilder.CreateTable(
                name: "AdminRoles",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Permissions = table.Column<List<string>>(type: "text[]", nullable: false),
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
                    table.PrimaryKey("PK_AdminRoles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BlogArticles",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Title = table.Column<string>(type: "text", nullable: false),
                    Slug = table.Column<string>(type: "text", nullable: false),
                    Content = table.Column<string>(type: "text", nullable: false),
                    Summary = table.Column<string>(type: "text", nullable: false),
                    Author = table.Column<string>(type: "text", nullable: false),
                    Category = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    PublishedAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    BannerUrl = table.Column<string>(type: "text", nullable: true),
                    Views = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_BlogArticles", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ExampleEntities",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_ExampleEntities", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InboxState",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    ConsumerId = table.Column<Guid>(type: "uuid", nullable: false),
                    LockId = table.Column<Guid>(type: "uuid", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", rowVersion: true, nullable: true),
                    Received = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ReceiveCount = table.Column<int>(type: "integer", nullable: false),
                    ExpirationTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Consumed = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    Delivered = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastSequenceNumber = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InboxState", x => x.Id);
                    table.UniqueConstraint("AK_InboxState_MessageId_ConsumerId", x => new { x.MessageId, x.ConsumerId });
                });

            migrationBuilder.CreateTable(
                name: "OutboxState",
                schema: "main",
                columns: table => new
                {
                    OutboxId = table.Column<Guid>(type: "uuid", nullable: false),
                    LockId = table.Column<Guid>(type: "uuid", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "bytea", rowVersion: true, nullable: true),
                    Created = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Delivered = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    LastSequenceNumber = table.Column<long>(type: "bigint", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboxState", x => x.OutboxId);
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionPlans",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Slug = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    PriceMonthly = table.Column<decimal>(type: "numeric", nullable: false),
                    PriceAnnually = table.Column<decimal>(type: "numeric", nullable: false),
                    IsHighlighted = table.Column<bool>(type: "boolean", nullable: false),
                    RequiresCheckout = table.Column<bool>(type: "boolean", nullable: false),
                    XenditPlanId = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_SubscriptionPlans", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Tenants",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    OwnerId = table.Column<string>(type: "text", nullable: false),
                    ClinicName = table.Column<string>(type: "text", nullable: false),
                    TenantSlug = table.Column<string>(type: "text", nullable: false),
                    FacilityType = table.Column<string>(type: "text", nullable: false),
                    FirstName = table.Column<string>(type: "text", nullable: false),
                    LastName = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    XenditCustomerId = table.Column<string>(type: "text", nullable: false),
                    SubscriptionId = table.Column<string>(type: "text", nullable: false),
                    SubscriptionStatus = table.Column<string>(type: "text", nullable: false),
                    SubscriptionPlanId = table.Column<string>(type: "text", nullable: false),
                    PhoneNumber = table.Column<string>(type: "text", nullable: true),
                    Country = table.Column<string>(type: "text", nullable: true),
                    StreetLine1 = table.Column<string>(type: "text", nullable: true),
                    StreetLine2 = table.Column<string>(type: "text", nullable: true),
                    City = table.Column<string>(type: "text", nullable: true),
                    Province = table.Column<string>(type: "text", nullable: true),
                    PostalCode = table.Column<string>(type: "text", nullable: true),
                    TradingName = table.Column<string>(type: "text", nullable: true),
                    BusinessType = table.Column<string>(type: "text", nullable: true),
                    TaxId = table.Column<string>(type: "text", nullable: true),
                    ClinicalBranchesCount = table.Column<int>(type: "integer", nullable: false),
                    StaffAccountsCount = table.Column<int>(type: "integer", nullable: false),
                    ActivePatientRecordsCount = table.Column<int>(type: "integer", nullable: false),
                    MonthlyApiQuotaUsed = table.Column<int>(type: "integer", nullable: false),
                    MonthlyApiQuotaLimit = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_Tenants", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AdminUsers",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    ClerkUserId = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    FullName = table.Column<string>(type: "text", nullable: false),
                    RoleId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_AdminUsers", x => x.Id);
                    table.ForeignKey(
                        name: "FK_AdminUsers_AdminRoles_RoleId",
                        column: x => x.RoleId,
                        principalSchema: "main",
                        principalTable: "AdminRoles",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OutboxMessage",
                schema: "main",
                columns: table => new
                {
                    SequenceNumber = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    EnqueueTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    SentTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Headers = table.Column<string>(type: "text", nullable: true),
                    Properties = table.Column<string>(type: "text", nullable: true),
                    InboxMessageId = table.Column<Guid>(type: "uuid", nullable: true),
                    InboxConsumerId = table.Column<Guid>(type: "uuid", nullable: true),
                    OutboxId = table.Column<Guid>(type: "uuid", nullable: true),
                    MessageId = table.Column<Guid>(type: "uuid", nullable: false),
                    ContentType = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    MessageType = table.Column<string>(type: "text", nullable: false),
                    Body = table.Column<string>(type: "text", nullable: false),
                    ConversationId = table.Column<Guid>(type: "uuid", nullable: true),
                    CorrelationId = table.Column<Guid>(type: "uuid", nullable: true),
                    InitiatorId = table.Column<Guid>(type: "uuid", nullable: true),
                    RequestId = table.Column<Guid>(type: "uuid", nullable: true),
                    SourceAddress = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    DestinationAddress = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ResponseAddress = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    FaultAddress = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    ExpirationTime = table.Column<DateTime>(type: "timestamp with time zone", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OutboxMessage", x => x.SequenceNumber);
                    table.ForeignKey(
                        name: "FK_OutboxMessage_InboxState_InboxMessageId_InboxConsumerId",
                        columns: x => new { x.InboxMessageId, x.InboxConsumerId },
                        principalSchema: "main",
                        principalTable: "InboxState",
                        principalColumns: new[] { "MessageId", "ConsumerId" });
                    table.ForeignKey(
                        name: "FK_OutboxMessage_OutboxState_OutboxId",
                        column: x => x.OutboxId,
                        principalSchema: "main",
                        principalTable: "OutboxState",
                        principalColumn: "OutboxId");
                });

            migrationBuilder.CreateTable(
                name: "SubscriptionPlanFeatures",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    SubscriptionPlanId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_SubscriptionPlanFeatures", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubscriptionPlanFeatures_SubscriptionPlans_SubscriptionPlan~",
                        column: x => x.SubscriptionPlanId,
                        principalSchema: "main",
                        principalTable: "SubscriptionPlans",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "BillingInvoices",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    XenditInvoiceId = table.Column<string>(type: "text", nullable: false),
                    InvoiceNumber = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
                    PlanSlug = table.Column<string>(type: "text", nullable: false),
                    IsAnnual = table.Column<bool>(type: "boolean", nullable: false),
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
                    table.PrimaryKey("PK_BillingInvoices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_BillingInvoices_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "Facilities",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    FacilityType = table.Column<string>(type: "text", nullable: false),
                    Status = table.Column<string>(type: "text", nullable: false),
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
                    table.PrimaryKey("PK_Facilities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Facilities_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PaymentReceipts",
                schema: "main",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false, defaultValueSql: "gen_random_uuid()"),
                    TenantId = table.Column<Guid>(type: "uuid", nullable: false),
                    InvoiceId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceiptNumber = table.Column<string>(type: "text", nullable: false),
                    AmountPaid = table.Column<decimal>(type: "numeric", nullable: false),
                    Currency = table.Column<string>(type: "text", nullable: false),
                    PaidAt = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    ExpiryDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    PaymentMethod = table.Column<string>(type: "text", nullable: false),
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
                    table.PrimaryKey("PK_PaymentReceipts", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PaymentReceipts_BillingInvoices_InvoiceId",
                        column: x => x.InvoiceId,
                        principalSchema: "main",
                        principalTable: "BillingInvoices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_PaymentReceipts_Tenants_TenantId",
                        column: x => x.TenantId,
                        principalSchema: "main",
                        principalTable: "Tenants",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "AdminRoles",
                columns: new[] { "Id", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "Description", "IsDeleted", "Name", "Permissions", "UpdatedAt", "UpdatedBy" },
                values: new object[,]
                {
                    { new Guid("44444444-4444-4444-4444-444444444444"), new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "Full platform administrative control, including tenant and permissions management.", false, "Super Admin", new List<string> { "view:analytics", "view:tenants", "manage:tenants", "toggle:subscription", "manage:blogs", "manage:roles", "manage:admins" }, null, null },
                    { new Guid("55555555-5555-5555-5555-555555555555"), new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "Provides support, views tenants and leads, writes blogs.", false, "Support Staff", new List<string> { "view:analytics", "view:tenants", "manage:blogs" }, null, null },
                    { new Guid("66666666-6666-6666-6666-666666666666"), new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "Maintains marketing resources, writes blog articles.", false, "Content Writer", new List<string> { "manage:blogs" }, null, null }
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "BlogArticles",
                columns: new[] { "Id", "Author", "BannerUrl", "Category", "Content", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "IsDeleted", "PublishedAt", "Slug", "Status", "Summary", "Title", "UpdatedAt", "UpdatedBy", "Views" },
                values: new object[,]
                {
                    { new Guid("b1111111-1111-1111-1111-111111111111"), "Dr. Raymond Santos", "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80", "Guides", "# Streamlining Clinic Operations with Clinic EZ\r\n\r\nModern medical practices require speed, accuracy, and compliance. In the Philippines, managing a clinic involves balancing patient check-ins, medical histories, prescription writing, and complex billing systems like **PhilHealth** and **HMO claims**.\r\n\r\nHere is how **Clinic EZ** acts as a unified operating system for your healthcare practice:\r\n\r\n## 1. Multi-Branch Operations\r\nWhether you operate a single pediatric clinic in Manila or a network of diagnostic facilities across Luzon, Clinic EZ lets you manage all your branches from a single unified workspace.\r\n\r\n- **Centralized Registry**: Keep patient files in sync across all clinic sites.\r\n- **Granular Access**: Grant receptionists, nurses, and doctors custom permissions specific to their workspace.\r\n\r\n## 2. Advanced EHR & Prescriptions\r\nForget about looking through paper charts. Clinic EZ's Electronic Health Record (EHR) module allows doctors to view consultation histories, track vitals, and issue digital prescriptions securely.\r\n\r\n> \"The transition to digital records saved our clinic over 15 hours of paperwork every single week.\"  \r\n> *— Dr. Santos, Cardinal Medical Group*\r\n\r\n## 3. Simplified Billing & HMO Integration\r\nClinic EZ maps directly to local payment methods, Starter/Pro tiers, and compiles PhilHealth-ready claims so you can avoid processing bottlenecks and collect fees without delay.\r\n\r\n### Key Benefits\r\n* **Reduced errors** in prescription filling.\r\n* **Instant notifications** for diagnostic lab test availability.\r\n* **Seamless scheduling** that avoids overbookings.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "streamlining-clinic-operations", "Published", "Discover how Clinic EZ simplifies patient onboarding, scheduling, and billing for modern healthcare clinics in the Philippines.", "Streamlining Clinic Operations with Clinic EZ", null, null, 342 },
                    { new Guid("b2222222-2222-2222-2222-222222222222"), "Wave Ambray", "https://images.unsplash.com/photo-1579154204601-01588f351167?auto=format&fit=crop&w=1200&q=80", "Health Tech", "# The Future of Integrated Laboratory Information Systems\r\n\r\nMedical diagnostics form the backbone of clinical decision-making. Yet, many diagnostic facilities and laboratory centers still operate in isolation from main hospital clinics, requiring manual printouts and scan uploads.\r\n\r\nIntegrating your **Laboratory Information System (LIS)** with the primary care portal bridges this gap.\r\n\r\n## Real-Time Diagnostic Sync\r\nWhen a doctor orders a blood chemistry panel or an X-ray, the request is instantly transmitted to the laboratory department. \r\n\r\n1. **Order Reception**: Laboratory staff process the request on their dedicated dashboard.\r\n2. **Result Entry**: Test results, references, and PDF files are uploaded directly.\r\n3. **Instant Alerts**: The ordering physician receives a push notification when results are ready.\r\n\r\n## Security and Compliance\r\nMaintaining data privacy is critical. All diagnostic records in Clinic EZ are encrypted in transit and at rest, aligning fully with the **Data Privacy Act of 2012** (RA 10173).\r\n\r\n## Scalability\r\nFrom community laboratories to centralized medical networks, integrated LIS speeds up diagnostics and boosts patient trust.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "future-integrated-laboratories", "Published", "How linking laboratory workflows directly to patient electronic health records reduces errors and speeds up diagnosis cycles.", "The Future of Integrated Laboratory Information Systems", null, null, 198 },
                    { new Guid("b3333333-3333-3333-3333-333333333333"), "Carla Mendoza, RPh", "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=1200&q=80", "Product Updates", "# Optimizing Pharmacy Dispensing & Inventory Control\r\n\r\nManaging pharmacy inventory demands precision. Dispensing the wrong dosage or running out of critical maintenance medications can disrupt patient treatments and hurt your bottom line.\r\n\r\nClinic EZ's pharmacy module brings control back to pharmacists:\r\n\r\n## Integrated Prescription Dispensing\r\nWhen a physician issues a digital prescription in a Clinic EZ clinic, it shows up on the pharmacy terminal. This removes illegible handwriting errors and accelerates dispensing cycles.\r\n\r\n### Dynamic Inventory Control\r\n* **Auto-Deductions**: Inventory counts auto-decrement as items are sold.\r\n* **Low Stock Alerts**: Configure thresholds to get notified when items need restocking.\r\n* **Batch Tracking**: Track expiry dates easily to minimize waste.\r\n\r\n## Multi-Store Sync\r\nManage stock transfers between different branches smoothly. See which branch has a specific medication in real-time, reducing customer wait times and maximizing sales.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "optimizing-pharmacy-dispensing", "Published", "A comprehensive guide on managing medicine inventory levels, prescription dispenses, and organizational compliance across branches.", "Optimizing Pharmacy Dispensing & Inventory Control", null, null, 254 },
                    { new Guid("b4444444-4444-4444-4444-444444444444"), "Dr. Raymond Santos", "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80", "Health Tech", "# Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR\r\n\r\nFor healthcare providers in the Philippines, compliance with government health programs is no longer optional. Under the **Universal Health Care (UHC) Act**, the PhilHealth Konsulta and **Yakap** packages aim to provide primary care access to every Filipino. \r\n\r\nTo participate, clinics must use an accredited **Electronic Medical Record (EMR)** system to report consultations.\r\n\r\nHere is how **Clinic EZ** simplifies PhilHealth Yakap compliance:\r\n\r\n## 1. Accredited EMR Compliance\r\nClinic EZ is accredited to integrate directly with PhilHealth's reporting endpoints. Patient records, consult notes, and diagnoses are securely packaged and formatted according to PhilHealth requirements.\r\n\r\n## 2. Integrated PhilHealth Proxy\r\nSubmitting claims manually is slow. Clinic EZ features a built-in PhilHealth Proxy layer that automatically uploads and verifies claims directly from your EMR workspace.\r\n\r\n- **Instant eligibility verification** for patients.\r\n- **Auto-populated consultation forms** (Annex A2) to reduce human error.\r\n- **Fast submission** of SOAP notes and ICD-10 codes.\r\n\r\n## 3. Simplified Primary Care Checklists\r\nThe Yakap program requires specific clinical workflows. Clinic EZ's custom templates guide doctors through the mandatory checklists:\r\n\r\n* **Comprehensive profile check** (vitals, family history).\r\n* **ICD-10 clinical diagnosis mappings** built directly into the record.\r\n* **Accredited e-prescriptions** linked directly to partner pharmacies.\r\n\r\nTransitioning to a Yakap-accredited EMR like Clinic EZ ensures compliance, speeds up reimbursement times, and lets you focus on patient care.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "philhealth-yakap-ready-emr", "Published", "How Clinic EZ helps healthcare providers comply with PhilHealth Konsulta and Yakap requirements, simplify claims, and automate patient records.", "Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR", null, null, 412 },
                    { new Guid("b5555555-5555-5555-5555-555555555555"), "Dr. Raymond Santos", "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80", "Guides", "# Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers\r\n\r\nExpanding primary healthcare services is a priority under the Universal Health Care (UHC) law. The **PhilHealth Konsulta** program provides access to primary care consultations, laboratory diagnostic services, and selected outpatient medicines.\r\n\r\nFor clinics aiming to become accredited Konsulta providers, here is a factual checklist:\r\n\r\n## Step 1: Self-Assessment & Registration\r\nFacilities must submit their application to the local PhilHealth Regional Office (PRO). Key requirements include:\r\n- A valid **DOH License to Operate** (LTO) for primary care facilities or medical clinics.\r\n- Professional credentials of affiliated medical staff (PRC licenses, board certifications).\r\n\r\n## Step 2: Physical & Manpower Compliance\r\nAccredited facilities must house basic diagnostics equipment and support staff:\r\n1. **Manpower**: At least one primary care physician and supporting nursing or administrative personnel.\r\n2. **Infrastructure**: Dedicated consultation rooms, clean patient waiting areas, and secure medical storage.\r\n3. **Services**: Capacity to perform or outsource basic lab diagnostics (CBC, urinalysis, fasting blood sugar, sputum microscopy).\r\n\r\n## Step 3: Accredited EMR Integration\r\nManual reporting is prohibited under the program. Accredited clinics must use a certified **Electronic Medical Record (EMR)** provider like **Clinic EZ** to synchronize consultation details and register patient profiles.\r\n\r\nAccreditation not only elevates the standard of care but also provides facilities with predictable capitation payments, enabling sustainable operations.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "philhealth-konsulta-accreditation-roadmap", "Published", "A step-by-step roadmap detailing registration, equipment compliance, and EMR integration checklists for primary care facilities.", "Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers", null, null, 312 },
                    { new Guid("b6666666-6666-6666-6666-666666666666"), "Wave Ambray", "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80", "Health Tech", "# How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics\r\n\r\nIn traditional primary care clinics, requesting laboratory tests or imaging scans involves writing a paper requisition slip, handing it to the patient, and waiting for the printed result to be returned. This manual workflow introduces diagnostic delays and increases administrative overhead.\r\n\r\nDirect digital integrations bridge this gap:\r\n\r\n## Direct Digital Requisitions\r\nWith an integrated EMR, physicians submit diagnostic requests directly to affiliated laboratory systems.\r\n- **Accurate mapping**: Requisition codes match specific diagnostic instruments, removing transcription errors.\r\n- **Specimen Tracking**: Specimen collection is barcoded and tracked in real-time.\r\n\r\n## PACS & DICOM Image Sync\r\nFor radiology (X-ray, MRI, ultrasound), integrating the EMR with a **Picture Archiving and Communication System (PACS)** allows doctors to view medical images directly from the patient's record.\r\n- Avoids manual CD copying or printing film.\r\n- Radiologists input reports directly into the shared portal.\r\n- Primary care physicians review reports and images side-by-side during consultations.\r\n\r\nIntegrating digital lab requests and PACS workflows speeds up patient diagnostics and improves care coordination.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "lab-orders-pacs-primary-care", "Published", "Analyzing how direct digital lab transmissions from primary care physicians to diagnostic centers reduce error rates and cut diagnostic turnaround times.", "How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics", null, null, 215 }
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "SubscriptionPlans",
                columns: new[] { "Id", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "Description", "IsDeleted", "IsHighlighted", "Name", "PriceAnnually", "PriceMonthly", "RequiresCheckout", "Slug", "UpdatedAt", "UpdatedBy", "XenditPlanId" },
                values: new object[,]
                {
                    { new Guid("11111111-1111-1111-1111-111111111111"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, "Perfect for small individual clinics.", false, false, "Starter", 2340m, 2940m, true, "starter", null, null, null },
                    { new Guid("22222222-2222-2222-2222-222222222222"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, "Ideal for growing medical practices.", false, true, "Professional", 5940m, 7740m, true, "pro", null, null, null },
                    { new Guid("33333333-3333-3333-3333-333333333333"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, "For large hospitals and clinic networks.", false, false, "Enterprise", 0m, 0m, false, "enterprise", null, null, null }
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "AdminUsers",
                columns: new[] { "Id", "ClerkUserId", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "Email", "FullName", "IsActive", "IsDeleted", "RoleId", "UpdatedAt", "UpdatedBy" },
                values: new object[,]
                {
                    { new Guid("77777777-7777-7777-7777-777777777777"), "", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "admin@clinicez.net", "System Super Admin", true, false, new Guid("44444444-4444-4444-4444-444444444444"), null, null },
                    { new Guid("88888888-8888-8888-8888-888888888888"), "", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "staff@clinicez.net", "Support Operator", true, false, new Guid("55555555-5555-5555-5555-555555555555"), null, null },
                    { new Guid("99999999-9999-9999-9999-999999999999"), "", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, "wave.ambray@nextstep-software.com", "Wave Ambray", true, false, new Guid("44444444-4444-4444-4444-444444444444"), null, null }
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                columns: new[] { "Id", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "DisplayOrder", "IsDeleted", "Name", "SubscriptionPlanId", "UpdatedAt", "UpdatedBy" },
                values: new object[,]
                {
                    { new Guid("11111111-0000-0000-0000-000000000001"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 1, false, "1 Clinic Location", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("11111111-0000-0000-0000-000000000002"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 2, false, "Up to 3 Staff Members", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("11111111-0000-0000-0000-000000000003"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 3, false, "Up to 500 Patients", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("11111111-0000-0000-0000-000000000004"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 4, false, "Basic Support", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000001"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 1, false, "Up to 5 Clinic Locations", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000002"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 2, false, "Up to 15 Staff Members", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000003"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 3, false, "Up to 5,000 Patients", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000004"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 4, false, "Priority Email Support", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000001"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 1, false, "Unlimited Clinic Locations", new Guid("33333333-3333-3333-3333-333333333333"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000002"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 2, false, "Unlimited Staff Members", new Guid("33333333-3333-3333-3333-333333333333"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000003"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 3, false, "Unlimited Patients", new Guid("33333333-3333-3333-3333-333333333333"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000004"), new DateTime(2026, 7, 10, 0, 0, 0, 0, DateTimeKind.Utc), "", null, null, 4, false, "24/7 Dedicated Support", new Guid("33333333-3333-3333-3333-333333333333"), null, null }
                });

            migrationBuilder.CreateIndex(
                name: "IX_AdminUsers_RoleId",
                schema: "main",
                table: "AdminUsers",
                column: "RoleId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingInvoices_TenantId",
                schema: "main",
                table: "BillingInvoices",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_BillingInvoices_XenditInvoiceId",
                schema: "main",
                table: "BillingInvoices",
                column: "XenditInvoiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BlogArticles_Slug",
                schema: "main",
                table: "BlogArticles",
                column: "Slug",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ExampleEntities_Name",
                schema: "main",
                table: "ExampleEntities",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Facilities_TenantId",
                schema: "main",
                table: "Facilities",
                column: "TenantId");

            migrationBuilder.CreateIndex(
                name: "IX_InboxState_Delivered",
                schema: "main",
                table: "InboxState",
                column: "Delivered");

            migrationBuilder.CreateIndex(
                name: "IX_OutboxMessage_EnqueueTime",
                schema: "main",
                table: "OutboxMessage",
                column: "EnqueueTime");

            migrationBuilder.CreateIndex(
                name: "IX_OutboxMessage_ExpirationTime",
                schema: "main",
                table: "OutboxMessage",
                column: "ExpirationTime");

            migrationBuilder.CreateIndex(
                name: "IX_OutboxMessage_InboxMessageId_InboxConsumerId_SequenceNumber",
                schema: "main",
                table: "OutboxMessage",
                columns: new[] { "InboxMessageId", "InboxConsumerId", "SequenceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboxMessage_OutboxId_SequenceNumber",
                schema: "main",
                table: "OutboxMessage",
                columns: new[] { "OutboxId", "SequenceNumber" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OutboxState_Created",
                schema: "main",
                table: "OutboxState",
                column: "Created");

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_InvoiceId",
                schema: "main",
                table: "PaymentReceipts",
                column: "InvoiceId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PaymentReceipts_TenantId",
                schema: "main",
                table: "PaymentReceipts",
                column: "TenantId");

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

            migrationBuilder.CreateIndex(
                name: "IX_Tenants_TenantSlug",
                schema: "main",
                table: "Tenants",
                column: "TenantSlug",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AdminUsers",
                schema: "main");

            migrationBuilder.DropTable(
                name: "BlogArticles",
                schema: "main");

            migrationBuilder.DropTable(
                name: "ExampleEntities",
                schema: "main");

            migrationBuilder.DropTable(
                name: "Facilities",
                schema: "main");

            migrationBuilder.DropTable(
                name: "OutboxMessage",
                schema: "main");

            migrationBuilder.DropTable(
                name: "PaymentReceipts",
                schema: "main");

            migrationBuilder.DropTable(
                name: "SubscriptionPlanFeatures",
                schema: "main");

            migrationBuilder.DropTable(
                name: "AdminRoles",
                schema: "main");

            migrationBuilder.DropTable(
                name: "InboxState",
                schema: "main");

            migrationBuilder.DropTable(
                name: "OutboxState",
                schema: "main");

            migrationBuilder.DropTable(
                name: "BillingInvoices",
                schema: "main");

            migrationBuilder.DropTable(
                name: "SubscriptionPlans",
                schema: "main");

            migrationBuilder.DropTable(
                name: "Tenants",
                schema: "main");
        }
    }
}
