using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class SeedMarketingBlogs : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.InsertData(
                schema: "main",
                table: "BlogArticles",
                columns: new[] { "Id", "Author", "BannerUrl", "Category", "Content", "CreatedAt", "CreatedBy", "DeletedAt", "DeletedBy", "IsDeleted", "PublishedAt", "Slug", "Status", "Summary", "Title", "UpdatedAt", "UpdatedBy", "Views" },
                values: new object[,]
                {
                    { new Guid("b1111111-1111-1111-1111-111111111111"), "Dr. Raymond Santos", "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80", "Guides", "# Streamlining Clinic Operations with Clinic EZ\n\nModern medical practices require speed, accuracy, and compliance. In the Philippines, managing a clinic involves balancing patient check-ins, medical histories, prescription writing, and complex billing systems like **PhilHealth** and **HMO claims**.\n\nHere is how **Clinic EZ** acts as a unified operating system for your healthcare practice:\n\n## 1. Multi-Branch Operations\nWhether you operate a single pediatric clinic in Manila or a network of diagnostic facilities across Luzon, Clinic EZ lets you manage all your branches from a single unified workspace.\n\n- **Centralized Registry**: Keep patient files in sync across all clinic sites.\n- **Granular Access**: Grant receptionists, nurses, and doctors custom permissions specific to their workspace.\n\n## 2. Advanced EHR & Prescriptions\nForget about looking through paper charts. Clinic EZ's Electronic Health Record (EHR) module allows doctors to view consultation histories, track vitals, and issue digital prescriptions securely.\n\n> \"The transition to digital records saved our clinic over 15 hours of paperwork every single week.\"  \n> *— Dr. Santos, Cardinal Medical Group*\n\n## 3. Simplified Billing & HMO Integration\nClinic EZ maps directly to local payment methods, Starter/Pro tiers, and compiles PhilHealth-ready claims so you can avoid processing bottlenecks and collect fees without delay.\n\n### Key Benefits\n* **Reduced errors** in prescription filling.\n* **Instant notifications** for diagnostic lab test availability.\n* **Seamless scheduling** that avoids overbookings.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "streamlining-clinic-operations", "Published", "Discover how Clinic EZ simplifies patient onboarding, scheduling, and billing for modern healthcare clinics in the Philippines.", "Streamlining Clinic Operations with Clinic EZ", null, null, 342 },
                    { new Guid("b2222222-2222-2222-2222-222222222222"), "Wave Ambray", "https://images.unsplash.com/photo-1579154204601-01588f351167?auto=format&fit=crop&w=1200&q=80", "Health Tech", "# The Future of Integrated Laboratory Information Systems\n\nMedical diagnostics form the backbone of clinical decision-making. Yet, many diagnostic facilities and laboratory centers still operate in isolation from main hospital clinics, requiring manual printouts and scan uploads.\n\nIntegrating your **Laboratory Information System (LIS)** with the primary care portal bridges this gap.\n\n## Real-Time Diagnostic Sync\nWhen a doctor orders a blood chemistry panel or an X-ray, the request is instantly transmitted to the laboratory department. \n\n1. **Order Reception**: Laboratory staff process the request on their dedicated dashboard.\n2. **Result Entry**: Test results, references, and PDF files are uploaded directly.\n3. **Instant Alerts**: The ordering physician receives a push notification when results are ready.\n\n## Security and Compliance\nMaintaining data privacy is critical. All diagnostic records in Clinic EZ are encrypted in transit and at rest, aligning fully with the **Data Privacy Act of 2012** (RA 10173).\n\n## Scalability\nFrom community laboratories to centralized medical networks, integrated LIS speeds up diagnostics and boosts patient trust.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "future-integrated-laboratories", "Published", "How linking laboratory workflows directly to patient electronic health records reduces errors and speeds up diagnosis cycles.", "The Future of Integrated Laboratory Information Systems", null, null, 198 },
                    { new Guid("b3333333-3333-3333-3333-333333333333"), "Carla Mendoza, RPh", "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=1200&q=80", "Product Updates", "# Optimizing Pharmacy Dispensing & Inventory Control\n\nManaging pharmacy inventory demands precision. Dispensing the wrong dosage or running out of critical maintenance medications can disrupt patient treatments and hurt your bottom line.\n\nClinic EZ's pharmacy module brings control back to pharmacists:\n\n## Integrated Prescription Dispensing\nWhen a physician issues a digital prescription in a Clinic EZ clinic, it shows up on the pharmacy terminal. This removes illegible handwriting errors and accelerates dispensing cycles.\n\n### Dynamic Inventory Control\n* **Auto-Deductions**: Inventory counts auto-decrement as items are sold.\n* **Low Stock Alerts**: Configure thresholds to get notified when items need restocking.\n* **Batch Tracking**: Track expiry dates easily to minimize waste.\n\n## Multi-Store Sync\nManage stock transfers between different branches smoothly. See which branch has a specific medication in real-time, reducing customer wait times and maximizing sales.", new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "System", null, null, false, new DateTime(2026, 7, 12, 0, 0, 0, 0, DateTimeKind.Utc), "optimizing-pharmacy-dispensing", "Published", "A comprehensive guide on managing medicine inventory levels, prescription dispenses, and organizational compliance across branches.", "Optimizing Pharmacy Dispensing & Inventory Control", null, null, 254 }
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b1111111-1111-1111-1111-111111111111"));

            migrationBuilder.DeleteData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b2222222-2222-2222-2222-222222222222"));

            migrationBuilder.DeleteData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b3333333-3333-3333-3333-333333333333"));

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
