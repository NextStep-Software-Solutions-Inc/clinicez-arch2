using System;
using MainPortalBE.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace MainPortalBE.Infrastructure.Persistence.Seeders;

public static class BlogSeeder
{
    public static void Seed(ModelBuilder modelBuilder)
    {
        var seedDate = new DateTime(2026, 7, 12, 0, 0, 0, DateTimeKind.Utc);

        modelBuilder.Entity<BlogArticle>().HasData(
            new BlogArticle
            {
                Id = Guid.Parse("b1111111-1111-1111-1111-111111111111"),
                Title = "Streamlining Clinic Operations with Clinic EZ",
                Slug = "streamlining-clinic-operations",
                Summary = "Discover how Clinic EZ simplifies patient onboarding, scheduling, and billing for modern healthcare clinics in the Philippines.",
                Author = "Dr. Raymond Santos",
                Category = "Guides",
                Status = "Published",
                PublishedAt = seedDate,
                CreatedAt = seedDate,
                CreatedBy = "System",
                BannerUrl = "https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&w=1200&q=80",
                Views = 342,
                Content = @"# Streamlining Clinic Operations with Clinic EZ

Modern medical practices require speed, accuracy, and compliance. In the Philippines, managing a clinic involves balancing patient check-ins, medical histories, prescription writing, and complex billing systems like **PhilHealth** and **HMO claims**.

Here is how **Clinic EZ** acts as a unified operating system for your healthcare practice:

## 1. Multi-Branch Operations
Whether you operate a single pediatric clinic in Manila or a network of diagnostic facilities across Luzon, Clinic EZ lets you manage all your branches from a single unified workspace.

- **Centralized Registry**: Keep patient files in sync across all clinic sites.
- **Granular Access**: Grant receptionists, nurses, and doctors custom permissions specific to their workspace.

## 2. Advanced EHR & Prescriptions
Forget about looking through paper charts. Clinic EZ's Electronic Health Record (EHR) module allows doctors to view consultation histories, track vitals, and issue digital prescriptions securely.

> ""The transition to digital records saved our clinic over 15 hours of paperwork every single week.""  
> *— Dr. Santos, Cardinal Medical Group*

## 3. Simplified Billing & HMO Integration
Clinic EZ maps directly to local payment methods, Starter/Pro tiers, and compiles PhilHealth-ready claims so you can avoid processing bottlenecks and collect fees without delay.

### Key Benefits
* **Reduced errors** in prescription filling.
* **Instant notifications** for diagnostic lab test availability.
* **Seamless scheduling** that avoids overbookings."
            },
            new BlogArticle
            {
                Id = Guid.Parse("b2222222-2222-2222-2222-222222222222"),
                Title = "The Future of Integrated Laboratory Information Systems",
                Slug = "future-integrated-laboratories",
                Summary = "How linking laboratory workflows directly to patient electronic health records reduces errors and speeds up diagnosis cycles.",
                Author = "Wave Ambray",
                Category = "Health Tech",
                Status = "Published",
                PublishedAt = seedDate,
                CreatedAt = seedDate,
                CreatedBy = "System",
                BannerUrl = "https://images.unsplash.com/photo-1579154204601-01588f351167?auto=format&fit=crop&w=1200&q=80",
                Views = 198,
                Content = @"# The Future of Integrated Laboratory Information Systems

Medical diagnostics form the backbone of clinical decision-making. Yet, many diagnostic facilities and laboratory centers still operate in isolation from main hospital clinics, requiring manual printouts and scan uploads.

Integrating your **Laboratory Information System (LIS)** with the primary care portal bridges this gap.

## Real-Time Diagnostic Sync
When a doctor orders a blood chemistry panel or an X-ray, the request is instantly transmitted to the laboratory department. 

1. **Order Reception**: Laboratory staff process the request on their dedicated dashboard.
2. **Result Entry**: Test results, references, and PDF files are uploaded directly.
3. **Instant Alerts**: The ordering physician receives a push notification when results are ready.

## Security and Compliance
Maintaining data privacy is critical. All diagnostic records in Clinic EZ are encrypted in transit and at rest, aligning fully with the **Data Privacy Act of 2012** (RA 10173).

## Scalability
From community laboratories to centralized medical networks, integrated LIS speeds up diagnostics and boosts patient trust."
            },
            new BlogArticle
            {
                Id = Guid.Parse("b3333333-3333-3333-3333-333333333333"),
                Title = "Optimizing Pharmacy Dispensing & Inventory Control",
                Slug = "optimizing-pharmacy-dispensing",
                Summary = "A comprehensive guide on managing medicine inventory levels, prescription dispenses, and organizational compliance across branches.",
                Author = "Carla Mendoza, RPh",
                Category = "Product Updates",
                Status = "Published",
                PublishedAt = seedDate,
                CreatedAt = seedDate,
                CreatedBy = "System",
                BannerUrl = "https://images.unsplash.com/photo-1586015555751-63bb77f4322a?auto=format&fit=crop&w=1200&q=80",
                Views = 254,
                Content = @"# Optimizing Pharmacy Dispensing & Inventory Control

Managing pharmacy inventory demands precision. Dispensing the wrong dosage or running out of critical maintenance medications can disrupt patient treatments and hurt your bottom line.

Clinic EZ's pharmacy module brings control back to pharmacists:

## Integrated Prescription Dispensing
When a physician issues a digital prescription in a Clinic EZ clinic, it shows up on the pharmacy terminal. This removes illegible handwriting errors and accelerates dispensing cycles.

### Dynamic Inventory Control
* **Auto-Deductions**: Inventory counts auto-decrement as items are sold.
* **Low Stock Alerts**: Configure thresholds to get notified when items need restocking.
* **Batch Tracking**: Track expiry dates easily to minimize waste.

## Multi-Store Sync
Manage stock transfers between different branches smoothly. See which branch has a specific medication in real-time, reducing customer wait times and maximizing sales."
            },
            new BlogArticle
            {
                Id = Guid.Parse("b4444444-4444-4444-4444-444444444444"),
                Title = "Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR",
                Slug = "philhealth-yakap-ready-emr",
                Summary = "How Clinic EZ helps healthcare providers comply with PhilHealth Konsulta and Yakap requirements, simplify claims, and automate patient records.",
                Author = "Dr. Raymond Santos",
                Category = "Health Tech",
                Status = "Published",
                PublishedAt = seedDate,
                CreatedAt = seedDate,
                CreatedBy = "System",
                BannerUrl = "https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&w=1200&q=80",
                Views = 412,
                Content = @"# Clinic EZ: Your Accredited PhilHealth Konsulta & Yakap Ready EMR

For healthcare providers in the Philippines, compliance with government health programs is no longer optional. Under the **Universal Health Care (UHC) Act**, the PhilHealth Konsulta and **Yakap** packages aim to provide primary care access to every Filipino. 

To participate, clinics must use an accredited **Electronic Medical Record (EMR)** system to report consultations.

Here is how **Clinic EZ** simplifies PhilHealth Yakap compliance:

## 1. Accredited EMR Compliance
Clinic EZ is accredited to integrate directly with PhilHealth's reporting endpoints. Patient records, consult notes, and diagnoses are securely packaged and formatted according to PhilHealth requirements.

## 2. Integrated PhilHealth Proxy
Submitting claims manually is slow. Clinic EZ features a built-in PhilHealth Proxy layer that automatically uploads and verifies claims directly from your EMR workspace.

- **Instant eligibility verification** for patients.
- **Auto-populated consultation forms** (Annex A2) to reduce human error.
- **Fast submission** of SOAP notes and ICD-10 codes.

## 3. Simplified Primary Care Checklists
The Yakap program requires specific clinical workflows. Clinic EZ's custom templates guide doctors through the mandatory checklists:

* **Comprehensive profile check** (vitals, family history).
* **ICD-10 clinical diagnosis mappings** built directly into the record.
* **Accredited e-prescriptions** linked directly to partner pharmacies.

Transitioning to a Yakap-accredited EMR like Clinic EZ ensures compliance, speeds up reimbursement times, and lets you focus on patient care."
            },
            new BlogArticle
            {
                Id = Guid.Parse("b5555555-5555-5555-5555-555555555555"),
                Title = "Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers",
                Slug = "philhealth-konsulta-accreditation-roadmap",
                Summary = "A step-by-step roadmap detailing registration, equipment compliance, and EMR integration checklists for primary care facilities.",
                Author = "Dr. Raymond Santos",
                Category = "Guides",
                Status = "Published",
                PublishedAt = seedDate,
                CreatedAt = seedDate,
                CreatedBy = "System",
                BannerUrl = "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&q=80",
                Views = 312,
                Content = @"# Accreditation Roadmap: How Clinics Can Become PhilHealth Konsulta Providers

Expanding primary healthcare services is a priority under the Universal Health Care (UHC) law. The **PhilHealth Konsulta** program provides access to primary care consultations, laboratory diagnostic services, and selected outpatient medicines.

For clinics aiming to become accredited Konsulta providers, here is a factual checklist:

## Step 1: Self-Assessment & Registration
Facilities must submit their application to the local PhilHealth Regional Office (PRO). Key requirements include:
- A valid **DOH License to Operate** (LTO) for primary care facilities or medical clinics.
- Professional credentials of affiliated medical staff (PRC licenses, board certifications).

## Step 2: Physical & Manpower Compliance
Accredited facilities must house basic diagnostics equipment and support staff:
1. **Manpower**: At least one primary care physician and supporting nursing or administrative personnel.
2. **Infrastructure**: Dedicated consultation rooms, clean patient waiting areas, and secure medical storage.
3. **Services**: Capacity to perform or outsource basic lab diagnostics (CBC, urinalysis, fasting blood sugar, sputum microscopy).

## Step 3: Accredited EMR Integration
Manual reporting is prohibited under the program. Accredited clinics must use a certified **Electronic Medical Record (EMR)** provider like **Clinic EZ** to synchronize consultation details and register patient profiles.

Accreditation not only elevates the standard of care but also provides facilities with predictable capitation payments, enabling sustainable operations."
            },
            new BlogArticle
            {
                Id = Guid.Parse("b6666666-6666-6666-6666-666666666666"),
                Title = "How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics",
                Slug = "lab-orders-pacs-primary-care",
                Summary = "Analyzing how direct digital lab transmissions from primary care physicians to diagnostic centers reduce error rates and cut diagnostic turnaround times.",
                Author = "Wave Ambray",
                Category = "Health Tech",
                Status = "Published",
                PublishedAt = seedDate,
                CreatedAt = seedDate,
                CreatedBy = "System",
                BannerUrl = "https://images.unsplash.com/photo-1516549655169-df83a0774514?auto=format&fit=crop&w=1200&q=80",
                Views = 215,
                Content = @"# How Digital Lab Orders & PACS Integrations Speed Up Primary Care Diagnostics

In traditional primary care clinics, requesting laboratory tests or imaging scans involves writing a paper requisition slip, handing it to the patient, and waiting for the printed result to be returned. This manual workflow introduces diagnostic delays and increases administrative overhead.

Direct digital integrations bridge this gap:

## Direct Digital Requisitions
With an integrated EMR, physicians submit diagnostic requests directly to affiliated laboratory systems.
- **Accurate mapping**: Requisition codes match specific diagnostic instruments, removing transcription errors.
- **Specimen Tracking**: Specimen collection is barcoded and tracked in real-time.

## PACS & DICOM Image Sync
For radiology (X-ray, MRI, ultrasound), integrating the EMR with a **Picture Archiving and Communication System (PACS)** allows doctors to view medical images directly from the patient's record.
- Avoids manual CD copying or printing film.
- Radiologists input reports directly into the shared portal.
- Primary care physicians review reports and images side-by-side during consultations.

Integrating digital lab requests and PACS workflows speeds up patient diagnostics and improves care coordination."
            }
        );
    }
}
