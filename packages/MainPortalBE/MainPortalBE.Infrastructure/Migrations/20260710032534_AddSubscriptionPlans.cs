using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddSubscriptionPlans : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.InsertData(
                schema: "main",
                table: "SubscriptionPlans",
                columns: new[] { "Id", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "Description", "IsDeleted", "IsHighlighted", "Name", "PriceAnnually", "PriceMonthly", "RequiresCheckout", "Slug", "UpdatedAt", "UpdatedBy" },
                values: new object[,]
                {
                    { new Guid("11111111-1111-1111-1111-111111111111"), new DateTime(2026, 7, 10, 3, 25, 33, 182, DateTimeKind.Utc).AddTicks(2089), "", null, null, "Perfect for small individual clinics.", false, false, "Starter", 39m, 49m, true, "starter", null, null },
                    { new Guid("22222222-2222-2222-2222-222222222222"), new DateTime(2026, 7, 10, 3, 25, 33, 182, DateTimeKind.Utc).AddTicks(2414), "", null, null, "Ideal for growing medical practices.", false, true, "Professional", 99m, 129m, true, "pro", null, null },
                    { new Guid("33333333-3333-3333-3333-333333333333"), new DateTime(2026, 7, 10, 3, 25, 33, 182, DateTimeKind.Utc).AddTicks(2417), "", null, null, "For large hospitals and clinic networks.", false, false, "Enterprise", 0m, 0m, false, "enterprise", null, null }
                });

            migrationBuilder.InsertData(
                schema: "main",
                table: "SubscriptionPlanFeatures",
                columns: new[] { "Id", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "DisplayOrder", "IsDeleted", "Name", "SubscriptionPlanId", "UpdatedAt", "UpdatedBy" },
                values: new object[,]
                {
                    { new Guid("11111111-0000-0000-0000-000000000001"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(886), "", null, null, 1, false, "1 Clinic Location", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("11111111-0000-0000-0000-000000000002"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(894), "", null, null, 2, false, "Up to 3 Staff Members", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("11111111-0000-0000-0000-000000000003"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(896), "", null, null, 3, false, "Up to 500 Patients", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("11111111-0000-0000-0000-000000000004"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(898), "", null, null, 4, false, "Basic Support", new Guid("11111111-1111-1111-1111-111111111111"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000001"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(900), "", null, null, 1, false, "Up to 5 Clinic Locations", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000002"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(901), "", null, null, 2, false, "Up to 15 Staff Members", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000003"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(902), "", null, null, 3, false, "Up to 5,000 Patients", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("22222222-0000-0000-0000-000000000004"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(904), "", null, null, 4, false, "Priority Email Support", new Guid("22222222-2222-2222-2222-222222222222"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000001"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(905), "", null, null, 1, false, "Unlimited Clinic Locations", new Guid("33333333-3333-3333-3333-333333333333"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000002"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(906), "", null, null, 2, false, "Unlimited Staff Members", new Guid("33333333-3333-3333-3333-333333333333"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000003"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(907), "", null, null, 3, false, "Unlimited Patients", new Guid("33333333-3333-3333-3333-333333333333"), null, null },
                    { new Guid("33333333-0000-0000-0000-000000000004"), new DateTime(2026, 7, 10, 3, 25, 33, 183, DateTimeKind.Utc).AddTicks(909), "", null, null, 4, false, "24/7 Dedicated Support", new Guid("33333333-3333-3333-3333-333333333333"), null, null }
                });

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

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "SubscriptionPlanFeatures",
                schema: "main");

            migrationBuilder.DropTable(
                name: "SubscriptionPlans",
                schema: "main");
        }
    }
}
