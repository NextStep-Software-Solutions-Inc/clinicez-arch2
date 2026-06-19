using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using PatientApp.Domain.Entities;

namespace PatientApp.Infrastructure.Persistence;

public class CatalogSeeder : IDataSeeder
{
    public int Order => 2;

    private static readonly string[] Regions =
    {
        "Metro Manila", "Central Luzon", "Calabarzon", "Northern Mindanao",
        "Western Visayas", "Central Visayas", "Bicol Region", "Ilocos Region",
        "Davao Region", "Cordillera"
    };

    private static readonly string[] OrganizationThemes =
    {
        "Family Wellness Network", "Care Circle Alliance", "Community Health Collective",
        "Patient Advocacy Guild", "Telehealth Partner Hub", "Alumni Care Society",
        "Workforce Wellness Network", "Senior Care Network", "Mothers Care Cooperative",
        "Chronic Care Alliance", "Student Wellness League", "Regional Care Consortium"
    };

    private static readonly string[] ClinicSpecialties =
    {
        "Family Medicine", "Internal Medicine", "Pediatrics", "Cardiology",
        "OB-GYN", "Dermatology", "Dentistry", "Diagnostics",
        "Rehabilitation", "Behavioral Health", "Endocrinology", "Pulmonology"
    };

    private static readonly string[][] RequiredFieldSets =
    {
        new[] { "fullName", "mobile", "email" },
        new[] { "fullName", "dateOfBirth", "mobile" },
        new[] { "fullName", "sex", "mobile", "email" },
        new[] { "fullName", "dateOfBirth", "sex", "philhealthId" },
        new[] { "fullName", "mobile", "address" },
        new[] { "fullName", "dateOfBirth", "mobile", "emergencyContact" }
    };

    private static string Slugify(string value)
    {
        value = value.ToLowerInvariant();
        value = Regex.Replace(value, @"[^a-z0-9]+", "-");
        return value.Trim('-');
    }

    public void Seed(ApplicationDbContext context)
    {
        var now = DateTime.UtcNow;

        // Only seed catalog if organizations and clinics are empty
        if (context.Organizations.Any() || context.Clinics.Any())
        {
            return;
        }

        var organizations = new List<Organization>();
        var clinics = new List<Clinic>();
        var links = new List<ClinicOrganizationLink>();

        // Seed 100 Organizations
        for (int i = 0; i < 100; i++)
        {
            var region = Regions[i % Regions.Length];
            var theme = OrganizationThemes[i % OrganizationThemes.Length];
            var domain = theme.Split(' ')[0];
            var isPublic = i % 5 != 0;
            var slug = Slugify($"{domain}-{region}-{i + 1}");
            var inviteCode = isPublic ? null : $"INV-{(i + 1):D4}";
            
            var requiredFields = RequiredFieldSets[i % RequiredFieldSets.Length];
            var roles = new[]
            {
                new { id = "member", name = "Member", description = "General community access." },
                new { id = "volunteer", name = "Volunteer", description = "Support volunteer participation." }
            };
            if (i % 6 == 0)
            {
                roles = new[]
                {
                    new { id = "member", name = "Member", description = "General community access." },
                    new { id = "coordinator", name = "Coordinator", description = "Helps coordinate member programs." },
                    new { id = "officer", name = "Officer", description = "Administrative access for officers." }
                };
            }
            else if (i % 3 == 0)
            {
                roles = new[]
                {
                    new { id = "member", name = "Member", description = "General community access." },
                    new { id = "lead", name = "Lead", description = "Guides member activity and support." }
                };
            }

            var featuredScore = 100 - i;
            var activeMemberCount = 50 + (featuredScore * 41);

            organizations.Add(new Organization
            {
                Id = Guid.NewGuid(),
                Slug = slug,
                Name = $"{region} {theme}",
                Description = $"A {(isPublic ? "public" : "private")} patient community for {region.ToLowerInvariant()} members who want coordinated care and partner clinic access.",
                LogoUrl = $"https://picsum.photos/seed/org-logo-{i}/80/80",
                CoverImageUrl = $"https://picsum.photos/seed/org-cover-{i}/400/180",
                AddressHint = region,
                IsPublic = isPublic,
                InviteCode = inviteCode,
                PrivacyPolicyUrl = $"https://clinicez.app/privacy/{slug}",
                TermsAndConditionsUrl = $"https://clinicez.app/terms/{slug}",
                RolesJson = JsonSerializer.Serialize(roles),
                RequiredShareFieldsJson = JsonSerializer.Serialize(requiredFields),
                FeaturedScore = featuredScore,
                ActiveMemberCount = activeMemberCount,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        // Seed 100 Clinics
        for (int i = 0; i < 100; i++)
        {
            var region = Regions[i % Regions.Length];
            var specialty = ClinicSpecialties[i % ClinicSpecialties.Length];
            var isPublic = i % 6 != 0;
            var supportsAppointments = i % 8 != 0;
            var slug = Slugify($"{specialty}-{region}-{i + 1}");
            var inviteCode = isPublic ? null : $"CLN-{(i + 1):D4}";
            var requiredFields = RequiredFieldSets[(i + 2) % RequiredFieldSets.Length];

            clinics.Add(new Clinic
            {
                Id = Guid.NewGuid(),
                Name = $"{region} {specialty} Clinic",
                Address = $"{region}, Philippines",
                Description = $"A {(isPublic ? "public" : "private")} {specialty.ToLowerInvariant()} clinic built for online consultations and follow-up care.",
                LogoUrl = $"https://picsum.photos/seed/clinic-logo-{i}/80/80",
                CoverImageUrl = $"https://picsum.photos/seed/clinic-cover-{i}/400/180",
                IsPublic = isPublic,
                SupportsAppointments = supportsAppointments,
                BaseUrl = $"https://{slug}.clinicez.local",
                PrivacyPolicyUrl = $"https://clinicez.app/privacy/{slug}",
                TermsAndConditionsUrl = $"https://clinicez.app/terms/{slug}",
                SpecialtiesJson = JsonSerializer.Serialize(new[] { specialty, supportsAppointments ? "Telehealth" : "Virtual Follow-Up" }),
                RequiredShareFieldsJson = JsonSerializer.Serialize(requiredFields),
                FeaturedScore = 100 - i,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        // Create Links
        for (int i = 0; i < organizations.Count; i++)
        {
            var org = organizations[i];
            var firstClinic = clinics[i % clinics.Count];
            var secondClinic = clinics[(i + 11) % clinics.Count];
            var thirdClinic = clinics[(i + 27) % clinics.Count];

            links.Add(new ClinicOrganizationLink
            {
                Id = Guid.NewGuid(),
                ClinicId = firstClinic.Id,
                OrganizationId = org.Id,
                RelationType = "partnered",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });

            links.Add(new ClinicOrganizationLink
            {
                Id = Guid.NewGuid(),
                ClinicId = secondClinic.Id,
                OrganizationId = org.Id,
                RelationType = i % 3 == 0 ? "sponsored" : "partnered",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });

            links.Add(new ClinicOrganizationLink
            {
                Id = Guid.NewGuid(),
                ClinicId = thirdClinic.Id,
                OrganizationId = org.Id,
                RelationType = "referral",
                IsActive = true,
                CreatedAt = now,
                UpdatedAt = now
            });
        }

        context.Organizations.AddRange(organizations);
        context.Clinics.AddRange(clinics);
        context.ClinicOrganizationLinks.AddRange(links);
        context.SaveChanges();
        Console.WriteLine($"[DbSeeder] Successfully seeded {organizations.Count} organizations, {clinics.Count} clinics, and {links.Count} links.");
    }
}
