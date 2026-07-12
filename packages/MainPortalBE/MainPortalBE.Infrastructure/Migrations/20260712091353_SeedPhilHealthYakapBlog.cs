using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedPhilHealthYakapBlog : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                schema: "main",
                table: "BlogArticles",
                columns: new[] { "Id", "Author", "BannerUrl", "Category", "Content", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "IsDeleted", "PublishedAt", "Slug", "Status", "Summary", "Title", "UpdatedAt", "UpdatedBy", "Views" },
                values: new object[] { new Guid("b4444444-4444-4444-4444-444444444444"), "Dr. Raymond Santos", "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80", "Health Tech", "# Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR\n\nFor healthcare providers in the Philippines, compliance with government health programs is no longer optional. Under the **Universal Health Care (UHC) Act**, the PhilHealth Konsulta and **Yakap** packages aim to provide primary care access to every Filipino. \n\nTo participate, clinics must use an accredited **Electronic Medical Record (EMR)** system to report consultations.\n\nHere is how **Clinic EZ** simplifies PhilHealth Yakap compliance:\n\n## 1. Accredited EMR Compliance\nClinic EZ is accredited to integrate directly with PhilHealth's reporting endpoints. Patient records, consult notes, and diagnoses are securely packaged and formatted according to PhilHealth requirements.\n\n## 2. Integrated PhilHealth Proxy\nSubmitting claims manually is slow. Clinic EZ features a built-in PhilHealth Proxy layer that automatically uploads and verifies claims directly from your EMR workspace.\n\n- **Instant eligibility verification** for patients.\n- **Auto-populated consultation forms** (Annex A2) to reduce human error.\n- **Fast submission** of SOAP notes and ICD-10 codes.\n\n## 3. Simplified Primary Care Checklists\nThe Yakap program requires specific clinical workflows. Clinic EZ's custom templates guide doctors through the mandatory checklists:\n\n* **Comprehensive profile check** (vitals, family history).\n* **ICD-10 clinical diagnosis mappings** built directly into the record.\n* **Accredited e-prescriptions** linked directly to partner pharmacies.\n\nTransitioning to a Yakap-accredited EMR like Clinic EZ ensures compliance, speeds up reimbursement times, and lets you focus on patient care.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "philhealth-yakap-ready-emr", "Published", "How Clinic EZ helps healthcare providers comply with PhilHealth Konsulta and Yakap requirements, simplify claims, and automate patient records.", "Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR", null, null, 412 });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b4444444-4444-4444-4444-444444444444"));

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("44444444-4444-4444-4444-444444444444"),
                column: "Permissions",
                value: new List<string> { "view:analytics", "view:tenants", "manage:tenants", "toggle:subscription", "manage:blogs", "manage:roles", "manage:admins" });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("55555555-5555-5555-5555-555555555555"),
                column: "Permissions",
                value: new List<string> { "view:analytics", "view:tenants", "manage:blogs" });

            migrationBuilder.UpdateData(
                schema: "main",
                table: "AdminRoles",
                keyColumn: "Id",
                keyValue: new Guid("66666666-6666-6666-6666-666666666666"),
                column: "Permissions",
                value: new List<string> { "manage:blogs" });
        }
    }
}
