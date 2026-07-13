using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MainPortalBE.Infrastructure.Migrations
{
    /// <inheritdoc />
    public partial class UpdatePendingModelChanges : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b1111111-1111-1111-1111-111111111111"),
                column: "Content",
                value: "# Streamlining Clinic Operations with Clinic EZ\r\n\r\nModern medical practices require speed, accuracy, and compliance. In the Philippines, managing a clinic involves balancing patient check-ins, medical histories, prescription writing, and complex billing systems like **PhilHealth** and **HMO claims**.\r\n\r\nHere is how **Clinic EZ** acts as a unified operating system for your healthcare practice:\r\n\r\n## 1. Multi-Branch Operations\r\nWhether you operate a single pediatric clinic in Manila or a network of diagnostic facilities across Luzon, Clinic EZ lets you manage all your branches from a single unified workspace.\r\n\r\n- **Centralized Registry**: Keep patient files in sync across all clinic sites.\r\n- **Granular Access**: Grant receptionists, nurses, and doctors custom permissions specific to their workspace.\r\n\r\n## 2. Advanced EHR & Prescriptions\r\nForget about looking through paper charts. Clinic EZ's Electronic Health Record (EHR) module allows doctors to view consultation histories, track vitals, and issue digital prescriptions securely.\r\n\r\n> \"The transition to digital records saved our clinic over 15 hours of paperwork every single week.\"  \r\n> *— Dr. Santos, Cardinal Medical Group*\r\n\r\n## 3. Simplified Billing & HMO Integration\r\nClinic EZ maps directly to local payment methods, Starter/Pro tiers, and compiles PhilHealth-ready claims so you can avoid processing bottlenecks and collect fees without delay.\r\n\r\n### Key Benefits\r\n* **Reduced errors** in prescription filling.\r\n* **Instant notifications** for diagnostic lab test availability.\r\n* **Seamless scheduling** that avoids overbookings.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b2222222-2222-2222-2222-222222222222"),
                column: "Content",
                value: "# The Future of Integrated Laboratory Information Systems\r\n\r\nMedical diagnostics form the backbone of clinical decision-making. Yet, many diagnostic facilities and laboratory centers still operate in isolation from main hospital clinics, requiring manual printouts and scan uploads.\r\n\r\nIntegrating your **Laboratory Information System (LIS)** with the primary care portal bridges this gap.\r\n\r\n## Real-Time Diagnostic Sync\r\nWhen a doctor orders a blood chemistry panel or an X-ray, the request is instantly transmitted to the laboratory department. \r\n\r\n1. **Order Reception**: Laboratory staff process the request on their dedicated dashboard.\r\n2. **Result Entry**: Test results, references, and PDF files are uploaded directly.\r\n3. **Instant Alerts**: The ordering physician receives a push notification when results are ready.\r\n\r\n## Security and Compliance\r\nMaintaining data privacy is critical. All diagnostic records in Clinic EZ are encrypted in transit and at rest, aligning fully with the **Data Privacy Act of 2012** (RA 10173).\r\n\r\n## Scalability\r\nFrom community laboratories to centralized medical networks, integrated LIS speeds up diagnostics and boosts patient trust.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b3333333-3333-3333-3333-333333333333"),
                column: "Content",
                value: "# Optimizing Pharmacy Dispensing & Inventory Control\r\n\r\nManaging pharmacy inventory demands precision. Dispensing the wrong dosage or running out of critical maintenance medications can disrupt patient treatments and hurt your bottom line.\r\n\r\nClinic EZ's pharmacy module brings control back to pharmacists:\r\n\r\n## Integrated Prescription Dispensing\r\nWhen a physician issues a digital prescription in a Clinic EZ clinic, it shows up on the pharmacy terminal. This removes illegible handwriting errors and accelerates dispensing cycles.\r\n\r\n### Dynamic Inventory Control\r\n* **Auto-Deductions**: Inventory counts auto-decrement as items are sold.\r\n* **Low Stock Alerts**: Configure thresholds to get notified when items need restocking.\r\n* **Batch Tracking**: Track expiry dates easily to minimize waste.\r\n\r\n## Multi-Store Sync\r\nManage stock transfers between different branches smoothly. See which branch has a specific medication in real-time, reducing customer wait times and maximizing sales.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b4444444-4444-4444-4444-444444444444"),
                column: "Content",
                value: "# Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR\r\n\r\nFor healthcare providers in the Philippines, compliance with government health programs is no longer optional. Under the **Universal Health Care (UHC) Act**, the PhilHealth Konsulta and **Yakap** packages aim to provide primary care access to every Filipino. \r\n\r\nTo participate, clinics must use an accredited **Electronic Medical Record (EMR)** system to report consultations.\r\n\r\nHere is how **Clinic EZ** simplifies PhilHealth Yakap compliance:\r\n\r\n## 1. Accredited EMR Compliance\r\nClinic EZ is accredited to integrate directly with PhilHealth's reporting endpoints. Patient records, consult notes, and diagnoses are securely packaged and formatted according to PhilHealth requirements.\r\n\r\n## 2. Integrated PhilHealth Proxy\r\nSubmitting claims manually is slow. Clinic EZ features a built-in PhilHealth Proxy layer that automatically uploads and verifies claims directly from your EMR workspace.\r\n\r\n- **Instant eligibility verification** for patients.\r\n- **Auto-populated consultation forms** (Annex A2) to reduce human error.\r\n- **Fast submission** of SOAP notes and ICD-10 codes.\r\n\r\n## 3. Simplified Primary Care Checklists\r\nThe Yakap program requires specific clinical workflows. Clinic EZ's custom templates guide doctors through the mandatory checklists:\r\n\r\n* **Comprehensive profile check** (vitals, family history).\r\n* **ICD-10 clinical diagnosis mappings** built directly into the record.\r\n* **Accredited e-prescriptions** linked directly to partner pharmacies.\r\n\r\nTransitioning to a Yakap-accredited EMR like Clinic EZ ensures compliance, speeds up reimbursement times, and lets you focus on patient care.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b5555555-5555-5555-5555-555555555555"),
                column: "Content",
                value: "# Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers\r\n\r\nExpanding primary healthcare services is a priority under the Universal Health Care (UHC) law. The **PhilHealth Konsulta** program provides access to primary care consultations, laboratory diagnostic services, and selected outpatient medicines.\r\n\r\nFor clinics aiming to become accredited Konsulta providers, here is a factual checklist:\r\n\r\n## Step 1: Self-Assessment & Registration\r\nFacilities must submit their application to the local PhilHealth Regional Office (PRO). Key requirements include:\r\n- A valid **DOH License to Operate** (LTO) for primary care facilities or medical clinics.\r\n- Professional credentials of affiliated medical staff (PRC licenses, board certifications).\r\n\r\n## Step 2: Physical & Manpower Compliance\r\nAccredited facilities must house basic diagnostics equipment and support staff:\r\n1. **Manpower**: At least one primary care physician and supporting nursing or administrative personnel.\r\n2. **Infrastructure**: Dedicated consultation rooms, clean patient waiting areas, and secure medical storage.\r\n3. **Services**: Capacity to perform or outsource basic lab diagnostics (CBC, urinalysis, fasting blood sugar, sputum microscopy).\r\n\r\n## Step 3: Accredited EMR Integration\r\nManual reporting is prohibited under the program. Accredited clinics must use a certified **Electronic Medical Record (EMR)** provider like **Clinic EZ** to synchronize consultation details and register patient profiles.\r\n\r\nAccreditation not only elevates the standard of care but also provides facilities with predictable capitation payments, enabling sustainable operations.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b6666666-6666-6666-6666-666666666666"),
                column: "Content",
                value: "# How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics\r\n\r\nIn traditional primary care clinics, requesting laboratory tests or imaging scans involves writing a paper requisition slip, handing it to the patient, and waiting for the printed result to be returned. This manual workflow introduces diagnostic delays and increases administrative overhead.\r\n\r\nDirect digital integrations bridge this gap:\r\n\r\n## Direct Digital Requisitions\r\nWith an integrated EMR, physicians submit diagnostic requests directly to affiliated laboratory systems.\r\n- **Accurate mapping**: Requisition codes match specific diagnostic instruments, removing transcription errors.\r\n- **Specimen Tracking**: Specimen collection is barcoded and tracked in real-time.\r\n\r\n## PACS & DICOM Image Sync\r\nFor radiology (X-ray, MRI, ultrasound), integrating the EMR with a **Picture Archiving and Communication System (PACS)** allows doctors to view medical images directly from the patient's record.\r\n- Avoids manual CD copying or printing film.\r\n- Radiologists input reports directly into the shared portal.\r\n- Primary care physicians review reports and images side-by-side during consultations.\r\n\r\nIntegrating digital lab requests and PACS workflows speeds up patient diagnostics and improves care coordination.");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
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

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b1111111-1111-1111-1111-111111111111"),
                column: "Content",
                value: "# Streamlining Clinic Operations with Clinic EZ\n\nModern medical practices require speed, accuracy, and compliance. In the Philippines, managing a clinic involves balancing patient check-ins, medical histories, prescription writing, and complex billing systems like **PhilHealth** and **HMO claims**.\n\nHere is how **Clinic EZ** acts as a unified operating system for your healthcare practice:\n\n## 1. Multi-Branch Operations\nWhether you operate a single pediatric clinic in Manila or a network of diagnostic facilities across Luzon, Clinic EZ lets you manage all your branches from a single unified workspace.\n\n- **Centralized Registry**: Keep patient files in sync across all clinic sites.\n- **Granular Access**: Grant receptionists, nurses, and doctors custom permissions specific to their workspace.\n\n## 2. Advanced EHR & Prescriptions\nForget about looking through paper charts. Clinic EZ's Electronic Health Record (EHR) module allows doctors to view consultation histories, track vitals, and issue digital prescriptions securely.\n\n> \"The transition to digital records saved our clinic over 15 hours of paperwork every single week.\"  \n> *— Dr. Santos, Cardinal Medical Group*\n\n## 3. Simplified Billing & HMO Integration\nClinic EZ maps directly to local payment methods, Starter/Pro tiers, and compiles PhilHealth-ready claims so you can avoid processing bottlenecks and collect fees without delay.\n\n### Key Benefits\n* **Reduced errors** in prescription filling.\n* **Instant notifications** for diagnostic lab test availability.\n* **Seamless scheduling** that avoids overbookings.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b2222222-2222-2222-2222-222222222222"),
                column: "Content",
                value: "# The Future of Integrated Laboratory Information Systems\n\nMedical diagnostics form the backbone of clinical decision-making. Yet, many diagnostic facilities and laboratory centers still operate in isolation from main hospital clinics, requiring manual printouts and scan uploads.\n\nIntegrating your **Laboratory Information System (LIS)** with the primary care portal bridges this gap.\n\n## Real-Time Diagnostic Sync\nWhen a doctor orders a blood chemistry panel or an X-ray, the request is instantly transmitted to the laboratory department. \n\n1. **Order Reception**: Laboratory staff process the request on their dedicated dashboard.\n2. **Result Entry**: Test results, references, and PDF files are uploaded directly.\n3. **Instant Alerts**: The ordering physician receives a push notification when results are ready.\n\n## Security and Compliance\nMaintaining data privacy is critical. All diagnostic records in Clinic EZ are encrypted in transit and at rest, aligning fully with the **Data Privacy Act of 2012** (RA 10173).\n\n## Scalability\nFrom community laboratories to centralized medical networks, integrated LIS speeds up diagnostics and boosts patient trust.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b3333333-3333-3333-3333-333333333333"),
                column: "Content",
                value: "# Optimizing Pharmacy Dispensing & Inventory Control\n\nManaging pharmacy inventory demands precision. Dispensing the wrong dosage or running out of critical maintenance medications can disrupt patient treatments and hurt your bottom line.\n\nClinic EZ's pharmacy module brings control back to pharmacists:\n\n## Integrated Prescription Dispensing\nWhen a physician issues a digital prescription in a Clinic EZ clinic, it shows up on the pharmacy terminal. This removes illegible handwriting errors and accelerates dispensing cycles.\n\n### Dynamic Inventory Control\n* **Auto-Deductions**: Inventory counts auto-decrement as items are sold.\n* **Low Stock Alerts**: Configure thresholds to get notified when items need restocking.\n* **Batch Tracking**: Track expiry dates easily to minimize waste.\n\n## Multi-Store Sync\nManage stock transfers between different branches smoothly. See which branch has a specific medication in real-time, reducing customer wait times and maximizing sales.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b4444444-4444-4444-4444-444444444444"),
                column: "Content",
                value: "# Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR\n\nFor healthcare providers in the Philippines, compliance with government health programs is no longer optional. Under the **Universal Health Care (UHC) Act**, the PhilHealth Konsulta and **Yakap** packages aim to provide primary care access to every Filipino. \n\nTo participate, clinics must use an accredited **Electronic Medical Record (EMR)** system to report consultations.\n\nHere is how **Clinic EZ** simplifies PhilHealth Yakap compliance:\n\n## 1. Accredited EMR Compliance\nClinic EZ is accredited to integrate directly with PhilHealth's reporting endpoints. Patient records, consult notes, and diagnoses are securely packaged and formatted according to PhilHealth requirements.\n\n## 2. Integrated PhilHealth Proxy\nSubmitting claims manually is slow. Clinic EZ features a built-in PhilHealth Proxy layer that automatically uploads and verifies claims directly from your EMR workspace.\n\n- **Instant eligibility verification** for patients.\n- **Auto-populated consultation forms** (Annex A2) to reduce human error.\n- **Fast submission** of SOAP notes and ICD-10 codes.\n\n## 3. Simplified Primary Care Checklists\nThe Yakap program requires specific clinical workflows. Clinic EZ's custom templates guide doctors through the mandatory checklists:\n\n* **Comprehensive profile check** (vitals, family history).\n* **ICD-10 clinical diagnosis mappings** built directly into the record.\n* **Accredited e-prescriptions** linked directly to partner pharmacies.\n\nTransitioning to a Yakap-accredited EMR like Clinic EZ ensures compliance, speeds up reimbursement times, and lets you focus on patient care.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b5555555-5555-5555-5555-555555555555"),
                column: "Content",
                value: "# Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers\n\nExpanding primary healthcare services is a priority under the Universal Health Care (UHC) law. The **PhilHealth Konsulta** program provides access to primary care consultations, laboratory diagnostic services, and selected outpatient medicines.\n\nFor clinics aiming to become accredited Konsulta providers, here is a factual checklist:\n\n## Step 1: Self-Assessment & Registration\nFacilities must submit their application to the local PhilHealth Regional Office (PRO). Key requirements include:\n- A valid **DOH License to Operate** (LTO) for primary care facilities or medical clinics.\n- Professional credentials of affiliated medical staff (PRC licenses, board certifications).\n\n## Step 2: Physical & Manpower Compliance\nAccredited facilities must house basic diagnostics equipment and support staff:\n1. **Manpower**: At least one primary care physician and supporting nursing or administrative personnel.\n2. **Infrastructure**: Dedicated consultation rooms, clean patient waiting areas, and secure medical storage.\n3. **Services**: Capacity to perform or outsource basic lab diagnostics (CBC, urinalysis, fasting blood sugar, sputum microscopy).\n\n## Step 3: Accredited EMR Integration\nManual reporting is prohibited under the program. Accredited clinics must use a certified **Electronic Medical Record (EMR)** provider like **Clinic EZ** to synchronize consultation details and register patient profiles.\n\nAccreditation not only elevates the standard of care but also provides facilities with predictable capitation payments, enabling sustainable operations.");

            migrationBuilder.UpdateData(
                schema: "main",
                table: "BlogArticles",
                keyColumn: "Id",
                keyValue: new Guid("b6666666-6666-6666-6666-666666666666"),
                column: "Content",
                value: "# How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics\n\nIn traditional primary care clinics, requesting laboratory tests or imaging scans involves writing a paper requisition slip, handing it to the patient, and waiting for the printed result to be returned. This manual workflow introduces diagnostic delays and increases administrative overhead.\n\nDirect digital integrations bridge this gap:\n\n## Direct Digital Requisitions\nWith an integrated EMR, physicians submit diagnostic requests directly to affiliated laboratory systems.\n- **Accurate mapping**: Requisition codes match specific diagnostic instruments, removing transcription errors.\n- **Specimen Tracking**: Specimen collection is barcoded and tracked in real-time.\n\n## PACS & DICOM Image Sync\nFor radiology (X-ray, MRI, ultrasound), integrating the EMR with a **Picture Archiving and Communication System (PACS)** allows doctors to view medical images directly from the patient's record.\n- Avoids manual CD copying or printing film.\n- Radiologists input reports directly into the shared portal.\n- Primary care physicians review reports and images side-by-side during consultations.\n\nIntegrating digital lab requests and PACS workflows speeds up patient diagnostics and improves care coordination.");
        }
    }
}
