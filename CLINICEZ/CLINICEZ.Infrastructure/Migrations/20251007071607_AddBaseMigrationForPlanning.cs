using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CLINICEZ.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class AddBaseMigrationForPlanning : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "CreatedAt",
                schema: "catalog",
                table: "Products",
                type: "timestamp with time zone",
                nullable: false,
                defaultValue: new DateTime(1, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified));

            migrationBuilder.AddColumn<string>(
                name: "CreatedBy",
                schema: "catalog",
                table: "Products",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<DateTime>(
                name: "DeletedAt",
                schema: "catalog",
                table: "Products",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DeletedBy",
                schema: "catalog",
                table: "Products",
                type: "text",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsDeleted",
                schema: "catalog",
                table: "Products",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "UpdatedAt",
                schema: "catalog",
                table: "Products",
                type: "timestamp with time zone",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "UpdatedBy",
                schema: "catalog",
                table: "Products",
                type: "text",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "FunctionPercentageAllocations",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Function = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Percentage = table.Column<decimal>(type: "numeric", nullable: false),
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
                    table.PrimaryKey("PK_FunctionPercentageAllocations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "FundSources",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    ParentSourceId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_FundSources", x => x.Id);
                    table.ForeignKey(
                        name: "FK_FundSources_FundSources_ParentSourceId",
                        column: x => x.ParentSourceId,
                        principalSchema: "catalog",
                        principalTable: "FundSources",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Locations",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    ParentLocationId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_Locations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Locations_Locations_ParentId",
                        column: x => x.ParentId,
                        principalSchema: "catalog",
                        principalTable: "Locations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Locations_Locations_ParentLocationId",
                        column: x => x.ParentLocationId,
                        principalSchema: "catalog",
                        principalTable: "Locations",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "MFOPAPs",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    ParentMFOPAPId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_MFOPAPs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MFOPAPs_MFOPAPs_ParentId",
                        column: x => x.ParentId,
                        principalSchema: "catalog",
                        principalTable: "MFOPAPs",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_MFOPAPs_MFOPAPs_ParentMFOPAPId",
                        column: x => x.ParentMFOPAPId,
                        principalSchema: "catalog",
                        principalTable: "MFOPAPs",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Objects",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    ParentObjectId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_Objects", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Objects_Objects_ParentObjectId",
                        column: x => x.ParentObjectId,
                        principalSchema: "catalog",
                        principalTable: "Objects",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "Offices",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OfficeHead = table.Column<string>(type: "text", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Address = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    ContactNumber = table.Column<string>(type: "text", nullable: false),
                    ResponsibilityCenterCode = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_Offices", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Organizations",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Code = table.Column<string>(type: "text", nullable: false),
                    Type = table.Column<string>(type: "text", nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    ParentOrganizationId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_Organizations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Organizations_Organizations_ParentId",
                        column: x => x.ParentId,
                        principalSchema: "catalog",
                        principalTable: "Organizations",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_Organizations_Organizations_ParentOrganizationId",
                        column: x => x.ParentOrganizationId,
                        principalSchema: "catalog",
                        principalTable: "Organizations",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "PerformanceMeasures",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_PerformanceMeasures", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "KPIs",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentKPIId = table.Column<Guid>(type: "uuid", nullable: true),
                    FunctionPercentageAllocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    IsOfficeMandate = table.Column<bool>(type: "boolean", nullable: true),
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
                    table.PrimaryKey("PK_KPIs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KPIs_FunctionPercentageAllocations_FunctionPercentageAlloca~",
                        column: x => x.FunctionPercentageAllocationId,
                        principalSchema: "catalog",
                        principalTable: "FunctionPercentageAllocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KPIs_KPIs_ParentKPIId",
                        column: x => x.ParentKPIId,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id");
                });

            migrationBuilder.CreateTable(
                name: "ReceivedFunds",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FundSourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
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
                    table.PrimaryKey("PK_ReceivedFunds", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ReceivedFunds_FundSources_FundSourceId",
                        column: x => x.FundSourceId,
                        principalSchema: "catalog",
                        principalTable: "FundSources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "DeliveryUnit",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OfficeId = table.Column<Guid>(type: "uuid", nullable: false),
                    ParentDUId = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_DeliveryUnit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DeliveryUnit_Offices_OfficeId",
                        column: x => x.OfficeId,
                        principalSchema: "catalog",
                        principalTable: "Offices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Transactions",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    FundSourceId = table.Column<Guid>(type: "uuid", nullable: false),
                    OrganizationId = table.Column<Guid>(type: "uuid", nullable: false),
                    LocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    MFOPAPId = table.Column<Guid>(type: "uuid", nullable: false),
                    ObjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    TransactionDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    AllotedAmount = table.Column<decimal>(type: "numeric", nullable: false),
                    ObligatedAmount = table.Column<decimal>(type: "numeric", nullable: true),
                    DisbursementAmount = table.Column<decimal>(type: "numeric", nullable: true),
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
                    table.PrimaryKey("PK_Transactions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Transactions_FundSources_FundSourceId",
                        column: x => x.FundSourceId,
                        principalSchema: "catalog",
                        principalTable: "FundSources",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Transactions_Locations_LocationId",
                        column: x => x.LocationId,
                        principalSchema: "catalog",
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Transactions_MFOPAPs_MFOPAPId",
                        column: x => x.MFOPAPId,
                        principalSchema: "catalog",
                        principalTable: "MFOPAPs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Transactions_Objects_ObjectId",
                        column: x => x.ObjectId,
                        principalSchema: "catalog",
                        principalTable: "Objects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_Transactions_Organizations_OrganizationId",
                        column: x => x.OrganizationId,
                        principalSchema: "catalog",
                        principalTable: "Organizations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "KPIModeOfVerifications",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KPIId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Url = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_KPIModeOfVerifications", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KPIModeOfVerifications_KPIs_KPIId",
                        column: x => x.KPIId,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "KPIRatings",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KPIId = table.Column<Guid>(type: "uuid", nullable: false),
                    PerformanceMeasureId = table.Column<Guid>(type: "uuid", nullable: false),
                    NumericalRating = table.Column<int>(type: "integer", nullable: false),
                    Remarks = table.Column<string>(type: "text", nullable: false),
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
                    table.PrimaryKey("PK_KPIRatings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KPIRatings_KPIs_KPIId",
                        column: x => x.KPIId,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KPIRatings_PerformanceMeasures_PerformanceMeasureId",
                        column: x => x.PerformanceMeasureId,
                        principalSchema: "catalog",
                        principalTable: "PerformanceMeasures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "KPITargets",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KPIId = table.Column<Guid>(type: "uuid", nullable: false),
                    TargetValue = table.Column<decimal>(type: "numeric", nullable: false),
                    Period = table.Column<string>(type: "text", nullable: false),
                    QuarterName = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_KPITargets", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KPITargets_KPIs_KPIId",
                        column: x => x.KPIId,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "MFOKPI",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    MFOPAPId = table.Column<Guid>(type: "uuid", nullable: false),
                    KPIId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_MFOKPI", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MFOKPI_KPIs_KPIId",
                        column: x => x.KPIId,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MFOKPI_MFOPAPs_MFOPAPId",
                        column: x => x.MFOPAPId,
                        principalSchema: "catalog",
                        principalTable: "MFOPAPs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DUAllocations",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceivedFundId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Purpose = table.Column<string>(type: "text", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
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
                    table.PrimaryKey("PK_DUAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DUAllocations_DeliveryUnit_DeliveryUnitId",
                        column: x => x.DeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "DeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DUAllocations_ReceivedFunds_ReceivedFundId",
                        column: x => x.ReceivedFundId,
                        principalSchema: "catalog",
                        principalTable: "ReceivedFunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "KPIAssignment",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KPIId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: false),
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
                    table.PrimaryKey("PK_KPIAssignment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_KPIAssignment_DeliveryUnit_DeliveryUnitId",
                        column: x => x.DeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "DeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_KPIAssignment_KPIs_KPIId",
                        column: x => x.KPIId,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SubDeliveryUnit",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    SubDeliveryUnitHead = table.Column<string>(type: "text", nullable: false),
                    Address = table.Column<string>(type: "text", nullable: false),
                    Email = table.Column<string>(type: "text", nullable: false),
                    ContactNumber = table.Column<string>(type: "text", nullable: false),
                    ResponsibilityCenterCode = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_SubDeliveryUnit", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubDeliveryUnit_DeliveryUnit_DeliveryUnitId",
                        column: x => x.DeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "DeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "DUFundAllocations",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DUAllocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    ReceivedFundId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
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
                    table.PrimaryKey("PK_DUFundAllocations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_DUFundAllocations_DUAllocations_DUAllocationId",
                        column: x => x.DUAllocationId,
                        principalSchema: "catalog",
                        principalTable: "DUAllocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_DUFundAllocations_ReceivedFunds_ReceivedFundId",
                        column: x => x.ReceivedFundId,
                        principalSchema: "catalog",
                        principalTable: "ReceivedFunds",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "OPCRs",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DUAllocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    FiscalYear = table.Column<int>(type: "integer", nullable: false),
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
                    table.PrimaryKey("PK_OPCRs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OPCRs_DUAllocations_DUAllocationId",
                        column: x => x.DUAllocationId,
                        principalSchema: "catalog",
                        principalTable: "DUAllocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_OPCRs_DeliveryUnit_DeliveryUnitId",
                        column: x => x.DeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "DeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WFPs",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DUAllocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    ProgramTitle = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    FiscalYear = table.Column<int>(type: "integer", nullable: true),
                    ProposedBudget = table.Column<decimal>(type: "numeric", nullable: false),
                    GeneralObjective = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_WFPs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WFPs_DUAllocations_DUAllocationId",
                        column: x => x.DUAllocationId,
                        principalSchema: "catalog",
                        principalTable: "DUAllocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WFPs_DeliveryUnit_DeliveryUnitId",
                        column: x => x.DeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "DeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SubDUAllocation",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DUAllocationId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubDeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    Amount = table.Column<decimal>(type: "numeric", nullable: false),
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
                    table.PrimaryKey("PK_SubDUAllocation", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SubDUAllocation_DUAllocations_DUAllocationId",
                        column: x => x.DUAllocationId,
                        principalSchema: "catalog",
                        principalTable: "DUAllocations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_SubDUAllocation_SubDeliveryUnit_SubDeliveryUnitId",
                        column: x => x.SubDeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "SubDeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OPCREvaluations",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OPCRId = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluatorId = table.Column<Guid>(type: "uuid", nullable: false),
                    EvaluationDate = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    Comments = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_OPCREvaluations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OPCREvaluations_OPCRs_OPCRId",
                        column: x => x.OPCRId,
                        principalSchema: "catalog",
                        principalTable: "OPCRs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OPCRKPI",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    KPIId = table.Column<Guid>(type: "uuid", nullable: false),
                    OPCRId = table.Column<Guid>(type: "uuid", nullable: false),
                    KPIId1 = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_OPCRKPI", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OPCRKPI_KPIs_KPIId",
                        column: x => x.KPIId,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OPCRKPI_KPIs_KPIId1",
                        column: x => x.KPIId1,
                        principalSchema: "catalog",
                        principalTable: "KPIs",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_OPCRKPI_OPCRs_OPCRId",
                        column: x => x.OPCRId,
                        principalSchema: "catalog",
                        principalTable: "OPCRs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WFPObjectives",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
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
                    table.PrimaryKey("PK_WFPObjectives", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WFPObjectives_WFPs_WFPId",
                        column: x => x.WFPId,
                        principalSchema: "catalog",
                        principalTable: "WFPs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OPCRActivities",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OPCRKPIId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: true),
                    Budget = table.Column<decimal>(type: "numeric", nullable: false),
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
                    table.PrimaryKey("PK_OPCRActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OPCRActivities_OPCRKPI_OPCRKPIId",
                        column: x => x.OPCRKPIId,
                        principalSchema: "catalog",
                        principalTable: "OPCRKPI",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OPCRRatings",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    OPCREvaluationId = table.Column<Guid>(type: "uuid", nullable: false),
                    PerformanceMeasureId = table.Column<Guid>(type: "uuid", nullable: false),
                    OPCRKPIId = table.Column<Guid>(type: "uuid", nullable: false),
                    NumericalRating = table.Column<int>(type: "integer", nullable: false),
                    Remarks = table.Column<string>(type: "text", nullable: true),
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
                    table.PrimaryKey("PK_OPCRRatings", x => x.Id);
                    table.ForeignKey(
                        name: "FK_OPCRRatings_OPCREvaluations_OPCREvaluationId",
                        column: x => x.OPCREvaluationId,
                        principalSchema: "catalog",
                        principalTable: "OPCREvaluations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OPCRRatings_OPCRKPI_OPCRKPIId",
                        column: x => x.OPCRKPIId,
                        principalSchema: "catalog",
                        principalTable: "OPCRKPI",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OPCRRatings_PerformanceMeasures_PerformanceMeasureId",
                        column: x => x.PerformanceMeasureId,
                        principalSchema: "catalog",
                        principalTable: "PerformanceMeasures",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WFPOutcomes",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPObjectiveId = table.Column<Guid>(type: "uuid", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
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
                    table.PrimaryKey("PK_WFPOutcomes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WFPOutcomes_WFPObjectives_WFPObjectiveId",
                        column: x => x.WFPObjectiveId,
                        principalSchema: "catalog",
                        principalTable: "WFPObjectives",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "OPCRPAPDepartment",
                schema: "catalog",
                columns: table => new
                {
                    DeliveryUnitsId = table.Column<Guid>(type: "uuid", nullable: false),
                    OPCRActivitiesId = table.Column<Guid>(type: "uuid", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OPCRPAPDepartment", x => new { x.DeliveryUnitsId, x.OPCRActivitiesId });
                    table.ForeignKey(
                        name: "FK_OPCRPAPDepartment_DeliveryUnit_DeliveryUnitsId",
                        column: x => x.DeliveryUnitsId,
                        principalSchema: "catalog",
                        principalTable: "DeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_OPCRPAPDepartment_OPCRActivities_OPCRActivitiesId",
                        column: x => x.OPCRActivitiesId,
                        principalSchema: "catalog",
                        principalTable: "OPCRActivities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WFPActivities",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPId = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPOutcomeId = table.Column<Guid>(type: "uuid", nullable: false),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OutputIndicator = table.Column<string>(type: "text", nullable: false),
                    Deliverable = table.Column<string>(type: "text", nullable: false),
                    Timeframe = table.Column<string>(type: "text", nullable: false),
                    PersonsInvolved = table.Column<List<string>>(type: "text[]", nullable: true),
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
                    table.PrimaryKey("PK_WFPActivities", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WFPActivities_WFPOutcomes_WFPOutcomeId",
                        column: x => x.WFPOutcomeId,
                        principalSchema: "catalog",
                        principalTable: "WFPOutcomes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_WFPActivities_WFPs_WFPId",
                        column: x => x.WFPId,
                        principalSchema: "catalog",
                        principalTable: "WFPs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WFPPAP",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPId = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPOutcomeId = table.Column<Guid>(type: "uuid", nullable: true),
                    Name = table.Column<string>(type: "text", nullable: false),
                    OutputIndicator = table.Column<string>(type: "text", nullable: false),
                    Deliverable = table.Column<string>(type: "text", nullable: false),
                    Timeframe = table.Column<string>(type: "text", nullable: false),
                    PersonsInvolved = table.Column<List<string>>(type: "text[]", nullable: false),
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
                    table.PrimaryKey("PK_WFPPAP", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WFPPAP_WFPOutcomes_WFPOutcomeId",
                        column: x => x.WFPOutcomeId,
                        principalSchema: "catalog",
                        principalTable: "WFPOutcomes",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WFPPAP_WFPs_WFPId",
                        column: x => x.WFPId,
                        principalSchema: "catalog",
                        principalTable: "WFPs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ActivityBudgetRequirements",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPActivityId = table.Column<Guid>(type: "uuid", nullable: false),
                    ObjectId = table.Column<Guid>(type: "uuid", nullable: false),
                    ItemDescription = table.Column<string>(type: "text", nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    CostEstimates = table.Column<decimal>(type: "numeric", nullable: false),
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
                    table.PrimaryKey("PK_ActivityBudgetRequirements", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ActivityBudgetRequirements_Objects_ObjectId",
                        column: x => x.ObjectId,
                        principalSchema: "catalog",
                        principalTable: "Objects",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_ActivityBudgetRequirements_WFPActivities_WFPActivityId",
                        column: x => x.WFPActivityId,
                        principalSchema: "catalog",
                        principalTable: "WFPActivities",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "WFPPAPDepartment",
                schema: "catalog",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    WFPPAPId = table.Column<Guid>(type: "uuid", nullable: false),
                    SubDeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: false),
                    DeliveryUnitId = table.Column<Guid>(type: "uuid", nullable: true),
                    SubDeliveryUnitId1 = table.Column<Guid>(type: "uuid", nullable: true),
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
                    table.PrimaryKey("PK_WFPPAPDepartment", x => x.Id);
                    table.ForeignKey(
                        name: "FK_WFPPAPDepartment_DeliveryUnit_DeliveryUnitId",
                        column: x => x.DeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "DeliveryUnit",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WFPPAPDepartment_SubDeliveryUnit_SubDeliveryUnitId",
                        column: x => x.SubDeliveryUnitId,
                        principalSchema: "catalog",
                        principalTable: "SubDeliveryUnit",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_WFPPAPDepartment_SubDeliveryUnit_SubDeliveryUnitId1",
                        column: x => x.SubDeliveryUnitId1,
                        principalSchema: "catalog",
                        principalTable: "SubDeliveryUnit",
                        principalColumn: "Id");
                    table.ForeignKey(
                        name: "FK_WFPPAPDepartment_WFPPAP_WFPPAPId",
                        column: x => x.WFPPAPId,
                        principalSchema: "catalog",
                        principalTable: "WFPPAP",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ActivityBudgetRequirements_ObjectId",
                schema: "catalog",
                table: "ActivityBudgetRequirements",
                column: "ObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_ActivityBudgetRequirements_WFPActivityId_ObjectId_ItemDescr~",
                schema: "catalog",
                table: "ActivityBudgetRequirements",
                columns: new[] { "WFPActivityId", "ObjectId", "ItemDescription" });

            migrationBuilder.CreateIndex(
                name: "IX_DeliveryUnit_OfficeId_ParentDUId",
                schema: "catalog",
                table: "DeliveryUnit",
                columns: new[] { "OfficeId", "ParentDUId" });

            migrationBuilder.CreateIndex(
                name: "IX_DUAllocations_DeliveryUnitId",
                schema: "catalog",
                table: "DUAllocations",
                column: "DeliveryUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_DUAllocations_ReceivedFundId_DeliveryUnitId_Purpose",
                schema: "catalog",
                table: "DUAllocations",
                columns: new[] { "ReceivedFundId", "DeliveryUnitId", "Purpose" });

            migrationBuilder.CreateIndex(
                name: "IX_DUFundAllocations_DUAllocationId_ReceivedFundId",
                schema: "catalog",
                table: "DUFundAllocations",
                columns: new[] { "DUAllocationId", "ReceivedFundId" });

            migrationBuilder.CreateIndex(
                name: "IX_DUFundAllocations_ReceivedFundId",
                schema: "catalog",
                table: "DUFundAllocations",
                column: "ReceivedFundId");

            migrationBuilder.CreateIndex(
                name: "IX_FunctionPercentageAllocations_Function_Name",
                schema: "catalog",
                table: "FunctionPercentageAllocations",
                columns: new[] { "Function", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_FundSources_ParentId_Code",
                schema: "catalog",
                table: "FundSources",
                columns: new[] { "ParentId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_FundSources_ParentSourceId",
                schema: "catalog",
                table: "FundSources",
                column: "ParentSourceId");

            migrationBuilder.CreateIndex(
                name: "IX_KPIAssignment_DeliveryUnitId",
                schema: "catalog",
                table: "KPIAssignment",
                column: "DeliveryUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_KPIAssignment_KPIId_DeliveryUnitId",
                schema: "catalog",
                table: "KPIAssignment",
                columns: new[] { "KPIId", "DeliveryUnitId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KPIModeOfVerifications_KPIId_Name",
                schema: "catalog",
                table: "KPIModeOfVerifications",
                columns: new[] { "KPIId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KPIRatings_KPIId_PerformanceMeasureId",
                schema: "catalog",
                table: "KPIRatings",
                columns: new[] { "KPIId", "PerformanceMeasureId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KPIRatings_PerformanceMeasureId",
                schema: "catalog",
                table: "KPIRatings",
                column: "PerformanceMeasureId");

            migrationBuilder.CreateIndex(
                name: "IX_KPIs_FunctionPercentageAllocationId_Name",
                schema: "catalog",
                table: "KPIs",
                columns: new[] { "FunctionPercentageAllocationId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_KPIs_Name",
                schema: "catalog",
                table: "KPIs",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_KPIs_ParentKPIId",
                schema: "catalog",
                table: "KPIs",
                column: "ParentKPIId");

            migrationBuilder.CreateIndex(
                name: "IX_KPITargets_KPIId_Period_QuarterName",
                schema: "catalog",
                table: "KPITargets",
                columns: new[] { "KPIId", "Period", "QuarterName" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Locations_Name_Code",
                schema: "catalog",
                table: "Locations",
                columns: new[] { "Name", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Locations_ParentId",
                schema: "catalog",
                table: "Locations",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_Locations_ParentLocationId",
                schema: "catalog",
                table: "Locations",
                column: "ParentLocationId");

            migrationBuilder.CreateIndex(
                name: "IX_MFOKPI_KPIId",
                schema: "catalog",
                table: "MFOKPI",
                column: "KPIId");

            migrationBuilder.CreateIndex(
                name: "IX_MFOKPI_MFOPAPId_KPIId",
                schema: "catalog",
                table: "MFOKPI",
                columns: new[] { "MFOPAPId", "KPIId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MFOPAPs_Name_Code",
                schema: "catalog",
                table: "MFOPAPs",
                columns: new[] { "Name", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MFOPAPs_ParentId",
                schema: "catalog",
                table: "MFOPAPs",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_MFOPAPs_ParentMFOPAPId",
                schema: "catalog",
                table: "MFOPAPs",
                column: "ParentMFOPAPId");

            migrationBuilder.CreateIndex(
                name: "IX_Objects_ParentId_Code",
                schema: "catalog",
                table: "Objects",
                columns: new[] { "ParentId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Objects_ParentObjectId",
                schema: "catalog",
                table: "Objects",
                column: "ParentObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_OPCRActivities_OPCRKPIId_Name",
                schema: "catalog",
                table: "OPCRActivities",
                columns: new[] { "OPCRKPIId", "Name" });

            migrationBuilder.CreateIndex(
                name: "IX_OPCREvaluations_OPCRId_EvaluatorId_EvaluationDate",
                schema: "catalog",
                table: "OPCREvaluations",
                columns: new[] { "OPCRId", "EvaluatorId", "EvaluationDate" });

            migrationBuilder.CreateIndex(
                name: "IX_OPCRKPI_KPIId",
                schema: "catalog",
                table: "OPCRKPI",
                column: "KPIId");

            migrationBuilder.CreateIndex(
                name: "IX_OPCRKPI_KPIId1",
                schema: "catalog",
                table: "OPCRKPI",
                column: "KPIId1");

            migrationBuilder.CreateIndex(
                name: "IX_OPCRKPI_OPCRId_KPIId",
                schema: "catalog",
                table: "OPCRKPI",
                columns: new[] { "OPCRId", "KPIId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OPCRPAPDepartment_OPCRActivitiesId",
                schema: "catalog",
                table: "OPCRPAPDepartment",
                column: "OPCRActivitiesId");

            migrationBuilder.CreateIndex(
                name: "IX_OPCRRatings_OPCREvaluationId_PerformanceMeasureId_OPCRKPIId",
                schema: "catalog",
                table: "OPCRRatings",
                columns: new[] { "OPCREvaluationId", "PerformanceMeasureId", "OPCRKPIId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_OPCRRatings_OPCRKPIId",
                schema: "catalog",
                table: "OPCRRatings",
                column: "OPCRKPIId");

            migrationBuilder.CreateIndex(
                name: "IX_OPCRRatings_PerformanceMeasureId",
                schema: "catalog",
                table: "OPCRRatings",
                column: "PerformanceMeasureId");

            migrationBuilder.CreateIndex(
                name: "IX_OPCRs_DeliveryUnitId",
                schema: "catalog",
                table: "OPCRs",
                column: "DeliveryUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_OPCRs_DUAllocationId_DeliveryUnitId_FiscalYear",
                schema: "catalog",
                table: "OPCRs",
                columns: new[] { "DUAllocationId", "DeliveryUnitId", "FiscalYear" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_Name_Code",
                schema: "catalog",
                table: "Organizations",
                columns: new[] { "Name", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_ParentId",
                schema: "catalog",
                table: "Organizations",
                column: "ParentId");

            migrationBuilder.CreateIndex(
                name: "IX_Organizations_ParentOrganizationId",
                schema: "catalog",
                table: "Organizations",
                column: "ParentOrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_PerformanceMeasures_Name",
                schema: "catalog",
                table: "PerformanceMeasures",
                column: "Name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_ReceivedFunds_FundSourceId_Amount",
                schema: "catalog",
                table: "ReceivedFunds",
                columns: new[] { "FundSourceId", "Amount" });

            migrationBuilder.CreateIndex(
                name: "IX_SubDeliveryUnit_DeliveryUnitId_Name",
                schema: "catalog",
                table: "SubDeliveryUnit",
                columns: new[] { "DeliveryUnitId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubDUAllocation_DUAllocationId_SubDeliveryUnitId",
                schema: "catalog",
                table: "SubDUAllocation",
                columns: new[] { "DUAllocationId", "SubDeliveryUnitId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SubDUAllocation_SubDeliveryUnitId",
                schema: "catalog",
                table: "SubDUAllocation",
                column: "SubDeliveryUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_FundSourceId_OrganizationId_LocationId_MFOPAPI~",
                schema: "catalog",
                table: "Transactions",
                columns: new[] { "FundSourceId", "OrganizationId", "LocationId", "MFOPAPId", "ObjectId", "TransactionDate" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_LocationId",
                schema: "catalog",
                table: "Transactions",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_MFOPAPId",
                schema: "catalog",
                table: "Transactions",
                column: "MFOPAPId");

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_ObjectId",
                schema: "catalog",
                table: "Transactions",
                column: "ObjectId");

            migrationBuilder.CreateIndex(
                name: "IX_Transactions_OrganizationId",
                schema: "catalog",
                table: "Transactions",
                column: "OrganizationId");

            migrationBuilder.CreateIndex(
                name: "IX_WFPActivities_WFPId",
                schema: "catalog",
                table: "WFPActivities",
                column: "WFPId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WFPActivities_WFPOutcomeId",
                schema: "catalog",
                table: "WFPActivities",
                column: "WFPOutcomeId");

            migrationBuilder.CreateIndex(
                name: "IX_WFPObjectives_WFPId",
                schema: "catalog",
                table: "WFPObjectives",
                column: "WFPId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WFPObjectives_WFPId_Description",
                schema: "catalog",
                table: "WFPObjectives",
                columns: new[] { "WFPId", "Description" });

            migrationBuilder.CreateIndex(
                name: "IX_WFPOutcomes_WFPObjectiveId_Description",
                schema: "catalog",
                table: "WFPOutcomes",
                columns: new[] { "WFPObjectiveId", "Description" });

            migrationBuilder.CreateIndex(
                name: "IX_WFPPAP_WFPId",
                schema: "catalog",
                table: "WFPPAP",
                column: "WFPId");

            migrationBuilder.CreateIndex(
                name: "IX_WFPPAP_WFPOutcomeId",
                schema: "catalog",
                table: "WFPPAP",
                column: "WFPOutcomeId");

            migrationBuilder.CreateIndex(
                name: "IX_WFPPAPDepartment_DeliveryUnitId",
                schema: "catalog",
                table: "WFPPAPDepartment",
                column: "DeliveryUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_WFPPAPDepartment_SubDeliveryUnitId",
                schema: "catalog",
                table: "WFPPAPDepartment",
                column: "SubDeliveryUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_WFPPAPDepartment_SubDeliveryUnitId1",
                schema: "catalog",
                table: "WFPPAPDepartment",
                column: "SubDeliveryUnitId1");

            migrationBuilder.CreateIndex(
                name: "IX_WFPPAPDepartment_WFPPAPId_SubDeliveryUnitId",
                schema: "catalog",
                table: "WFPPAPDepartment",
                columns: new[] { "WFPPAPId", "SubDeliveryUnitId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_WFPs_DeliveryUnitId",
                schema: "catalog",
                table: "WFPs",
                column: "DeliveryUnitId");

            migrationBuilder.CreateIndex(
                name: "IX_WFPs_DUAllocationId_DeliveryUnitId_FiscalYear",
                schema: "catalog",
                table: "WFPs",
                columns: new[] { "DUAllocationId", "DeliveryUnitId", "FiscalYear" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ActivityBudgetRequirements",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "DUFundAllocations",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "KPIAssignment",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "KPIModeOfVerifications",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "KPIRatings",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "KPITargets",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "MFOKPI",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "OPCRPAPDepartment",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "OPCRRatings",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "SubDUAllocation",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "Transactions",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "WFPPAPDepartment",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "WFPActivities",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "OPCRActivities",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "OPCREvaluations",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "PerformanceMeasures",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "Locations",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "MFOPAPs",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "Objects",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "Organizations",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "SubDeliveryUnit",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "WFPPAP",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "OPCRKPI",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "WFPOutcomes",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "KPIs",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "OPCRs",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "WFPObjectives",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "FunctionPercentageAllocations",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "WFPs",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "DUAllocations",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "DeliveryUnit",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "ReceivedFunds",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "Offices",
                schema: "catalog");

            migrationBuilder.DropTable(
                name: "FundSources",
                schema: "catalog");

            migrationBuilder.DropColumn(
                name: "CreatedAt",
                schema: "catalog",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "CreatedBy",
                schema: "catalog",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "DeletedAt",
                schema: "catalog",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "DeletedBy",
                schema: "catalog",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "IsDeleted",
                schema: "catalog",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "UpdatedAt",
                schema: "catalog",
                table: "Products");

            migrationBuilder.DropColumn(
                name: "UpdatedBy",
                schema: "catalog",
                table: "Products");
        }
    }
}
