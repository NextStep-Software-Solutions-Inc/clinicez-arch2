using System;
using System.IO;
using ClosedXML.Excel;
using ClinicEz.Clinic.Application.Common.Interfaces;
using ClinicEz.Clinic.Application.Features.Reports.DTOs;
using ClinicEz.Clinic.Domain.Entities;

namespace ClinicEz.Clinic.Infrastructure.Services;

public sealed class ClinicCensusExcelService : IClinicCensusExcelService
{
    private static readonly XLColor NavyBlue = XLColor.FromHtml("#1E3A8A");
    private static readonly XLColor AltRowBg = XLColor.FromHtml("#F8FAFC");
    private static readonly XLColor BorderColor = XLColor.FromHtml("#CBD5E1");
    private static readonly XLColor LightBorder = XLColor.FromHtml("#E2E8F0");

    public byte[] GenerateClinicCensusExcel(ClinicCensusReportDto report, FacilitySettings settings)
    {
        using var workbook = new XLWorkbook();

        // -------------------------------------------------------------
        // SHEET 1: CENSUS REGISTER (25 COLUMNS)
        // -------------------------------------------------------------
        var ws1 = workbook.Worksheets.Add("Census Register");
        ws1.ShowGridLines = true;

        var clinicTitle = !string.IsNullOrWhiteSpace(settings.ClinicName) 
            ? settings.ClinicName 
            : (!string.IsNullOrWhiteSpace(report.ClinicName) ? report.ClinicName : "Clinic EZ Healthcare");

        // Row 1: Facility Title
        ws1.Cell(1, 1).SetValue(clinicTitle);
        ws1.Cell(1, 1).Style.Font.Bold = true;
        ws1.Cell(1, 1).Style.Font.FontSize = 14;
        ws1.Cell(1, 1).Style.Font.FontColor = NavyBlue;

        // Row 2: Facility Address & Accreditation
        var accreditation = !string.IsNullOrWhiteSpace(settings.AccreditationNumber) ? settings.AccreditationNumber : "N/A";
        var tin = !string.IsNullOrWhiteSpace(settings.TaxIdentificationNumber) ? settings.TaxIdentificationNumber : "N/A";
        var address = !string.IsNullOrWhiteSpace(settings.LetterheadAddress) ? settings.LetterheadAddress : "Healthcare Facility";
        var contact = !string.IsNullOrWhiteSpace(settings.LetterheadContact) ? settings.LetterheadContact : "N/A";
        ws1.Cell(2, 1).SetValue($"Address: {address} • PHIC Accreditation: {accreditation} • TIN: {tin} • Contact: {contact}");
        ws1.Cell(2, 1).Style.Font.FontSize = 9;
        ws1.Cell(2, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");

        // Row 3: Report Title
        ws1.Cell(3, 1).SetValue("OUTPATIENT CLINIC PATIENT CENSUS REGISTER");
        ws1.Cell(3, 1).Style.Font.Bold = true;
        ws1.Cell(3, 1).Style.Font.FontSize = 11;
        ws1.Cell(3, 1).Style.Font.FontColor = NavyBlue;

        // Row 4: Period & Metadata
        ws1.Cell(4, 1).SetValue($"Report Period: {report.StartDate:yyyy-MM-dd} to {report.EndDate:yyyy-MM-dd} • Generated: {report.GeneratedAt:yyyy-MM-dd HH:mm UTC}");
        ws1.Cell(4, 1).Style.Font.FontSize = 8.5;
        ws1.Cell(4, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");

        // Row 6: 25 Header Columns
        string[] headers =
        {
            "Seq #",
            "Check-In Time",
            "Triage Time",
            "Call Time",
            "Completed Time",
            "Turnaround (Mins)",
            "Ticket No.",
            "Patient Code",
            "Patient Name",
            "Age / Sex / Civil Status",
            "Classification",
            "Custom Fields",
            "Visit Type",
            "Chief Complaint",
            "Nurse Assessment / Impression",
            "Attending Nurse",
            "Vitals Snapshot",
            "Attending Doctor",
            "Doctor Diagnosis & ICD-10",
            "Clinical Assessment",
            "Systems Reviewed & Physical Findings",
            "In-Clinic Procedures Performed",
            "Acuity / Priority",
            "Disposition / Outcome",
            "Billing Status / OR # / Amount Paid"
        };

        ws1.Row(6).Height = 28;
        for (int c = 0; c < headers.Length; c++)
        {
            var cell = ws1.Cell(6, c + 1);
            cell.SetValue(headers[c]);
            cell.Style.Fill.BackgroundColor = NavyBlue;
            cell.Style.Font.FontColor = XLColor.White;
            cell.Style.Font.Bold = true;
            cell.Style.Font.FontSize = 10;
            cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
            cell.Style.Alignment.WrapText = true;
        }

        // Data Rows
        int currentRow = 7;
        foreach (var item in report.Items)
        {
            var bg = (currentRow % 2 == 0) ? AltRowBg : XLColor.White;
            ws1.Row(currentRow).Height = 20;

            // 1. Seq #
            ws1.Cell(currentRow, 1).SetValue(item.SequenceNumber);
            ws1.Cell(currentRow, 1).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 2. Check-In Time
            ws1.Cell(currentRow, 2).SetValue(item.CheckInTime.ToString("yyyy-MM-dd HH:mm"));
            ws1.Cell(currentRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 3. Triage Time
            ws1.Cell(currentRow, 3).SetValue(item.TriageTime.HasValue ? item.TriageTime.Value.ToString("yyyy-MM-dd HH:mm") : "—");
            ws1.Cell(currentRow, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 4. Call Time
            ws1.Cell(currentRow, 4).SetValue(item.CalledTime.HasValue ? item.CalledTime.Value.ToString("yyyy-MM-dd HH:mm") : "—");
            ws1.Cell(currentRow, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 5. Completed Time
            ws1.Cell(currentRow, 5).SetValue(item.CompletedTime.HasValue ? item.CompletedTime.Value.ToString("yyyy-MM-dd HH:mm") : "—");
            ws1.Cell(currentRow, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 6. Turnaround (Mins)
            if (item.TurnaroundMinutes.HasValue)
                ws1.Cell(currentRow, 6).SetValue(item.TurnaroundMinutes.Value);
            else
                ws1.Cell(currentRow, 6).SetValue("—");
            ws1.Cell(currentRow, 6).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 7. Ticket No.
            ws1.Cell(currentRow, 7).SetValue(item.QueueNumber);
            ws1.Cell(currentRow, 7).Style.Font.Bold = true;
            ws1.Cell(currentRow, 7).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 8. Patient Code
            ws1.Cell(currentRow, 8).SetValue(item.PatientCode);
            ws1.Cell(currentRow, 8).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 9. Patient Name
            ws1.Cell(currentRow, 9).SetValue(item.PatientName);
            ws1.Cell(currentRow, 9).Style.Font.Bold = true;

            // 10. Age / Sex / Civil Status
            ws1.Cell(currentRow, 10).SetValue($"{item.Age}y / {item.Sex} / {item.CivilStatus}");
            ws1.Cell(currentRow, 10).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 11. Classification
            ws1.Cell(currentRow, 11).SetValue(item.Classification);
            ws1.Cell(currentRow, 11).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 12. Custom Fields
            ws1.Cell(currentRow, 12).SetValue(item.CustomFieldsSummary);

            // 13. Visit Type (shows composite Services Availed when multiple services were rendered in the visit)
            var visitTypeDisplay = item.ServicesAvailed is { Count: > 1 } && !string.IsNullOrWhiteSpace(item.ServicesAvailedSummary)
                ? item.ServicesAvailedSummary
                : item.VisitType;
            ws1.Cell(currentRow, 13).SetValue(visitTypeDisplay);
            ws1.Cell(currentRow, 13).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 14. Chief Complaint
            ws1.Cell(currentRow, 14).SetValue(item.ChiefComplaint ?? "—");

            // 15. Nurse Assessment / Impression
            ws1.Cell(currentRow, 15).SetValue(item.NurseAssessment ?? "—");

            // 16. Attending Nurse
            ws1.Cell(currentRow, 16).SetValue(item.AttendingNurse ?? "—");

            // 17. Vitals Snapshot
            ws1.Cell(currentRow, 17).SetValue(item.VitalsSnapshot ?? "—");

            // 18. Attending Doctor
            ws1.Cell(currentRow, 18).SetValue(item.AttendingDoctor ?? "—");

            // 19. Doctor Diagnosis & ICD-10
            ws1.Cell(currentRow, 19).SetValue(item.DoctorDiagnosis ?? "—");

            // 20. Clinical Assessment
            ws1.Cell(currentRow, 20).SetValue(item.ClinicalAssessment ?? "—");

            // 21. Systems Reviewed & Physical Findings
            ws1.Cell(currentRow, 21).SetValue(item.SystemsReviewed ?? "—");

            // 22. In-Clinic Procedures Performed (+ Clinic Medicine / Supply Dispensing)
            var procDisplay = item.ProceduresPerformed ?? "—";
            if (!string.IsNullOrWhiteSpace(item.DispensedMedicinesSummary))
            {
                procDisplay = string.IsNullOrWhiteSpace(item.ProceduresPerformed) || item.ProceduresPerformed == "None"
                    ? $"Dispensed: {item.DispensedMedicinesSummary}"
                    : $"{item.ProceduresPerformed} | Dispensed: {item.DispensedMedicinesSummary}";
            }
            ws1.Cell(currentRow, 22).SetValue(procDisplay);

            // 23. Acuity / Priority
            ws1.Cell(currentRow, 23).SetValue(item.Acuity);
            ws1.Cell(currentRow, 23).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;

            // 24. Disposition / Outcome
            ws1.Cell(currentRow, 24).SetValue(item.Disposition);

            // 25. Billing Status / OR # / Amount Paid
            var billingText = item.BillingStatus;
            if (!string.IsNullOrWhiteSpace(item.OfficialReceiptNumber))
                billingText += $" ({item.OfficialReceiptNumber})";
            billingText += $" - ₱{item.AmountPaid:N2}";
            ws1.Cell(currentRow, 25).SetValue(billingText);

            var rowRange = ws1.Range(currentRow, 1, currentRow, 25);
            rowRange.Style.Fill.BackgroundColor = bg;
            rowRange.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
            rowRange.Style.Border.InsideBorderColor = LightBorder;
            rowRange.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            rowRange.Style.Border.OutsideBorderColor = BorderColor;

            currentRow++;
        }

        // Freeze header row 6
        ws1.SheetView.FreezeRows(6);

        // Auto-filter
        int lastDataRow = Math.Max(6, currentRow - 1);
        if (lastDataRow > 6)
        {
            ws1.Range(6, 1, lastDataRow, 25).SetAutoFilter();
        }

        try
        {
            ws1.Columns(1, 25).AdjustToContents(10, 45);
        }
        catch
        {
            // Fallback for headless environments without system font engines
        }

        // -------------------------------------------------------------
        // SHEET 2: EXECUTIVE SUMMARY & STATISTICS
        // -------------------------------------------------------------
        var ws2 = workbook.Worksheets.Add("Executive Summary & Statistics");
        ws2.ShowGridLines = true;

        // Title Block
        ws2.Cell(1, 1).SetValue(clinicTitle);
        ws2.Cell(1, 1).Style.Font.Bold = true;
        ws2.Cell(1, 1).Style.Font.FontSize = 14;
        ws2.Cell(1, 1).Style.Font.FontColor = NavyBlue;

        ws2.Cell(2, 1).SetValue("OUTPATIENT CLINIC CENSUS - EXECUTIVE SUMMARY & STATISTICS");
        ws2.Cell(2, 1).Style.Font.Bold = true;
        ws2.Cell(2, 1).Style.Font.FontSize = 11;
        ws2.Cell(2, 1).Style.Font.FontColor = NavyBlue;

        ws2.Cell(3, 1).SetValue($"Report Period: {report.StartDate:yyyy-MM-dd} to {report.EndDate:yyyy-MM-dd} • Generated: {report.GeneratedAt:yyyy-MM-dd HH:mm UTC}");
        ws2.Cell(3, 1).Style.Font.FontSize = 8.5;
        ws2.Cell(3, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");

        int sRow = 5;

        // Section 1: Operational Summary
        ws2.Cell(sRow, 1).SetValue("1. OPERATIONAL CENSUS TELEMETRY & ENCOUNTER SUMMARY");
        ws2.Cell(sRow, 1).Style.Font.Bold = true;
        ws2.Cell(sRow, 1).Style.Font.FontSize = 10.5;
        ws2.Cell(sRow, 1).Style.Font.FontColor = NavyBlue;
        sRow++;

        ws2.Cell(sRow, 1).SetValue("Metric Name");
        ws2.Cell(sRow, 2).SetValue("Count / Value");
        ws2.Cell(sRow, 3).SetValue("Share / Details");
        var sec1Hdr = ws2.Range(sRow, 1, sRow, 3);
        sec1Hdr.Style.Fill.BackgroundColor = NavyBlue;
        sec1Hdr.Style.Font.FontColor = XLColor.White;
        sec1Hdr.Style.Font.Bold = true;
        sRow++;

        void AddSummaryRow(string name, object val, string details)
        {
            var bg = (sRow % 2 == 0) ? AltRowBg : XLColor.White;
            ws2.Cell(sRow, 1).SetValue(name);
            ws2.Cell(sRow, 2).SetValue(val.ToString());
            ws2.Cell(sRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
            ws2.Cell(sRow, 2).Style.Font.Bold = true;
            ws2.Cell(sRow, 3).SetValue(details);
            var r = ws2.Range(sRow, 1, sRow, 3);
            r.Style.Fill.BackgroundColor = bg;
            r.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
            r.Style.Border.InsideBorderColor = LightBorder;
            r.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            r.Style.Border.OutsideBorderColor = BorderColor;
            sRow++;
        }

        int totalVisits = report.Summary.TotalCensus;
        AddSummaryRow("Total Outpatient Census", report.Summary.TotalCensus, "100.0% of encounters");
        AddSummaryRow("New Patients (First-Ever Visit)", report.Summary.NewPatients, totalVisits > 0 ? $"{Math.Round(((double)report.Summary.NewPatients / totalVisits) * 100, 1)}% of census" : "0.0%");
        AddSummaryRow("Returning Patients", report.Summary.ReturningPatients, totalVisits > 0 ? $"{Math.Round(((double)report.Summary.ReturningPatients / totalVisits) * 100, 1)}% of census" : "0.0%");
        AddSummaryRow("Distinct Individual Patients", report.Summary.DistinctPatientsCount, "Unique chart IDs");
        AddSummaryRow("Consultations", report.Summary.Consultations, totalVisits > 0 ? $"{Math.Round(((double)report.Summary.Consultations / totalVisits) * 100, 1)}%" : "0.0%");
        AddSummaryRow("Standalone In-Clinic Procedures", report.Summary.StandaloneProcedures, totalVisits > 0 ? $"{Math.Round(((double)report.Summary.StandaloneProcedures / totalVisits) * 100, 1)}%" : "0.0%");
        AddSummaryRow("Laboratory Specimen & Diagnostics", report.Summary.DiagnosticsOrLab, totalVisits > 0 ? $"{Math.Round(((double)report.Summary.DiagnosticsOrLab / totalVisits) * 100, 1)}%" : "0.0%");
        AddSummaryRow("Non-Doctor Outpatient Visits", report.Summary.NonDoctorVisits, "Vitals Check / Procedure / Administrative");
        AddSummaryRow("Completed & Discharged Visits", report.Summary.CompletedVisits, totalVisits > 0 ? $"{Math.Round(((double)report.Summary.CompletedVisits / totalVisits) * 100, 1)}%" : "0.0%");
        AddSummaryRow("Average Turnaround Time (Mins)", $"{report.Summary.AverageTurnaroundMinutes:0.0} mins", "Check-in to discharge");
        AddSummaryRow("Diverted / Emergency Transfers", report.Summary.DivertedVisits, "Hospital / Emergency transfer");
        AddSummaryRow("Cancelled or No-Show", report.Summary.CancelledOrNoShow, "Unfulfilled queue tickets");

        sRow += 2;

        // Section 2: Demographics Breakdown
        ws2.Cell(sRow, 1).SetValue("2. PATIENT DEMOGRAPHICS & SPECIAL CATEGORIES");
        ws2.Cell(sRow, 1).Style.Font.Bold = true;
        ws2.Cell(sRow, 1).Style.Font.FontSize = 10.5;
        ws2.Cell(sRow, 1).Style.Font.FontColor = NavyBlue;
        sRow++;

        ws2.Cell(sRow, 1).SetValue("Demographic Cohort");
        ws2.Cell(sRow, 2).SetValue("Patient Count");
        ws2.Cell(sRow, 3).SetValue("Percentage (%)");
        var sec2Hdr = ws2.Range(sRow, 1, sRow, 3);
        sec2Hdr.Style.Fill.BackgroundColor = NavyBlue;
        sec2Hdr.Style.Font.FontColor = XLColor.White;
        sec2Hdr.Style.Font.Bold = true;
        sRow++;

        void AddDemoRow(string name, int count, double pct)
        {
            var bg = (sRow % 2 == 0) ? AltRowBg : XLColor.White;
            ws2.Cell(sRow, 1).SetValue(name);
            ws2.Cell(sRow, 2).SetValue(count);
            ws2.Cell(sRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
            ws2.Cell(sRow, 2).Style.Font.Bold = true;
            ws2.Cell(sRow, 3).SetValue($"{pct:0.0}%");
            ws2.Cell(sRow, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
            var r = ws2.Range(sRow, 1, sRow, 3);
            r.Style.Fill.BackgroundColor = bg;
            r.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
            r.Style.Border.InsideBorderColor = LightBorder;
            r.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
            r.Style.Border.OutsideBorderColor = BorderColor;
            sRow++;
        }

        AddDemoRow("Pediatric (<18 years)", report.Demographics.PediatricCount, report.Demographics.PediatricPercentage);
        AddDemoRow("Adult (18 to 59 years)", report.Demographics.AdultCount, report.Demographics.AdultPercentage);
        AddDemoRow("Senior Citizen (60+ years)", report.Demographics.SeniorCount, report.Demographics.SeniorPercentage);
        AddDemoRow("Biological Male", report.Demographics.MaleCount, report.Demographics.MalePercentage);
        AddDemoRow("Biological Female", report.Demographics.FemaleCount, report.Demographics.FemalePercentage);
        AddDemoRow("Other / Unspecified Gender", report.Demographics.OtherGenderCount, report.Demographics.OtherGenderPercentage);
        AddDemoRow("Senior Citizens (RA 9994 / OSCA)", report.Demographics.SeniorCitizenCount, totalVisits > 0 ? Math.Round(((double)report.Demographics.SeniorCitizenCount / totalVisits) * 100, 1) : 0.0);
        AddDemoRow("Persons with Disability (RA 10754 / PWD)", report.Demographics.PwdCount, totalVisits > 0 ? Math.Round(((double)report.Demographics.PwdCount / totalVisits) * 100, 1) : 0.0);
        AddDemoRow("PhilHealth Beneficiaries (Konsulta / Yakap)", report.Demographics.PhilHealthCount, totalVisits > 0 ? Math.Round(((double)report.Demographics.PhilHealthCount / totalVisits) * 100, 1) : 0.0);

        sRow += 2;

        // Section 3: Clinical Acuity Distribution
        ws2.Cell(sRow, 1).SetValue("3. CLINICAL ACUITY & TRIAGE DISTRIBUTION");
        ws2.Cell(sRow, 1).Style.Font.Bold = true;
        ws2.Cell(sRow, 1).Style.Font.FontSize = 10.5;
        ws2.Cell(sRow, 1).Style.Font.FontColor = NavyBlue;
        sRow++;

        ws2.Cell(sRow, 1).SetValue("Triage Acuity Level");
        ws2.Cell(sRow, 2).SetValue("Count");
        ws2.Cell(sRow, 3).SetValue("Share (%)");
        var sec3Hdr = ws2.Range(sRow, 1, sRow, 3);
        sec3Hdr.Style.Fill.BackgroundColor = NavyBlue;
        sec3Hdr.Style.Font.FontColor = XLColor.White;
        sec3Hdr.Style.Font.Bold = true;
        sRow++;

        AddDemoRow("Routine / Non-Urgent", report.Acuity.RoutineCount, report.Acuity.RoutinePercentage);
        AddDemoRow("Urgent / Priority Triage", report.Acuity.UrgentCount, report.Acuity.UrgentPercentage);
        AddDemoRow("Emergency / Resuscitation", report.Acuity.EmergencyCount, report.Acuity.EmergencyPercentage);

        sRow += 2;

        // Section 4: Provider Workload Breakdown
        ws2.Cell(sRow, 1).SetValue("4. CLINICIAN & NURSING STAFF WORKLOAD SUMMARY");
        ws2.Cell(sRow, 1).Style.Font.Bold = true;
        ws2.Cell(sRow, 1).Style.Font.FontSize = 10.5;
        ws2.Cell(sRow, 1).Style.Font.FontColor = NavyBlue;
        sRow++;

        ws2.Cell(sRow, 1).SetValue("Staff Member");
        ws2.Cell(sRow, 2).SetValue("Role");
        ws2.Cell(sRow, 3).SetValue("Total Encounters");
        ws2.Cell(sRow, 4).SetValue("Completed Encounters");
        ws2.Cell(sRow, 5).SetValue("Completion Rate (%)");
        var sec4Hdr = ws2.Range(sRow, 1, sRow, 5);
        sec4Hdr.Style.Fill.BackgroundColor = NavyBlue;
        sec4Hdr.Style.Font.FontColor = XLColor.White;
        sec4Hdr.Style.Font.Bold = true;
        sRow++;

        if (report.Providers.Count > 0)
        {
            foreach (var prov in report.Providers)
            {
                var bg = (sRow % 2 == 0) ? AltRowBg : XLColor.White;
                ws2.Cell(sRow, 1).SetValue(prov.StaffName);
                ws2.Cell(sRow, 2).SetValue(prov.Role);
                ws2.Cell(sRow, 2).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Center;
                ws2.Cell(sRow, 3).SetValue(prov.TotalEncounters);
                ws2.Cell(sRow, 3).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                ws2.Cell(sRow, 3).Style.Font.Bold = true;
                ws2.Cell(sRow, 4).SetValue(prov.CompletedEncounters);
                ws2.Cell(sRow, 4).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;
                double rate = prov.TotalEncounters > 0 ? Math.Round(((double)prov.CompletedEncounters / prov.TotalEncounters) * 100, 1) : 0.0;
                ws2.Cell(sRow, 5).SetValue($"{rate:0.0}%");
                ws2.Cell(sRow, 5).Style.Alignment.Horizontal = XLAlignmentHorizontalValues.Right;

                var r = ws2.Range(sRow, 1, sRow, 5);
                r.Style.Fill.BackgroundColor = bg;
                r.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
                r.Style.Border.InsideBorderColor = LightBorder;
                r.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                r.Style.Border.OutsideBorderColor = BorderColor;
                sRow++;
            }
        }
        else
        {
            ws2.Cell(sRow, 1).SetValue("No provider encounters recorded in this reporting period.");
            ws2.Range(sRow, 1, sRow, 5).Merge();
            ws2.Cell(sRow, 1).Style.Font.Italic = true;
            sRow++;
        }

        sRow += 2;

        // Section 5: Multi-Service Availment & Dispensing Summary
        ws2.Cell(sRow, 1).SetValue("5. MULTI-SERVICE AVAILMENT & AUXILIARY CLINIC SERVICES SUMMARY");
        ws2.Cell(sRow, 1).Style.Font.Bold = true;
        ws2.Cell(sRow, 1).Style.Font.FontSize = 10.5;
        ws2.Cell(sRow, 1).Style.Font.FontColor = NavyBlue;
        sRow++;

        ws2.Cell(sRow, 1).SetValue("Clinical Service Availed");
        ws2.Cell(sRow, 2).SetValue("Visits / Count");
        ws2.Cell(sRow, 3).SetValue("Share / Volume Details");
        var sec5Hdr = ws2.Range(sRow, 1, sRow, 3);
        sec5Hdr.Style.Fill.BackgroundColor = NavyBlue;
        sec5Hdr.Style.Font.FontColor = XLColor.White;
        sec5Hdr.Style.Font.Bold = true;
        sRow++;

        var resolvedServices = ClinicCensusBreakdownResolver.ResolveServiceBreakdown(report);
        foreach (var svc in resolvedServices)
        {
            var svcDetails = svc.ServiceName switch
            {
                "Consultation" => $"{svc.Percentage:0.0}% of census (vitals bundled)",
                "Vitals Check" => $"{svc.Percentage:0.0}% of census (nurse vitals check)",
                "Medicine Dispensing" => $"{svc.Percentage:0.0}% of visits • {report.Summary.TotalDispensedLineItems} line items ({report.Summary.TotalDispensedUnits} units)",
                "Prescription" => $"{svc.Percentage:0.0}% of visits • {svc.TotalVolume} signed Rx items",
                "Medical Certificate" => $"{svc.Percentage:0.0}% of visits • {svc.TotalVolume} signed certificates",
                "Referral" => $"{svc.Percentage:0.0}% of visits • {svc.TotalVolume} signed referrals",
                "Laboratory Requisition" => $"{svc.Percentage:0.0}% of visits • {svc.TotalVolume} signed requisitions",
                "In-Clinic Procedure" => $"{svc.Percentage:0.0}% of visits • {svc.TotalVolume} procedures",
                _ => $"{svc.Percentage:0.0}% of visits ({svc.TotalVolume} total)"
            };
            var displayVal = svc.ServiceName is "Prescription" or "Medical Certificate" or "Referral" or "Laboratory Requisition"
                ? svc.TotalVolume
                : svc.VisitCount;
            AddSummaryRow(svc.ServiceName, displayVal, svcDetails);
        }
        AddSummaryRow("Total Dispensed Line Items", report.Summary.TotalDispensedLineItems, $"{report.Summary.TotalDispensedUnits} total pieces/units dispensed");

        sRow += 2;

        // Section 6: Review of Systems (ROS) Breakdown
        ws2.Cell(sRow, 1).SetValue("6. REVIEW OF SYSTEMS (ROS) BREAKDOWN");
        ws2.Cell(sRow, 1).Style.Font.Bold = true;
        ws2.Cell(sRow, 1).Style.Font.FontSize = 10.5;
        ws2.Cell(sRow, 1).Style.Font.FontColor = NavyBlue;
        sRow++;

        ws2.Cell(sRow, 1).SetValue("ROS Category");
        ws2.Cell(sRow, 2).SetValue("Visit Count");
        ws2.Cell(sRow, 3).SetValue("Share / Dispensing Entries");
        var sec6Hdr = ws2.Range(sRow, 1, sRow, 3);
        sec6Hdr.Style.Fill.BackgroundColor = NavyBlue;
        sec6Hdr.Style.Font.FontColor = XLColor.White;
        sec6Hdr.Style.Font.Bold = true;
        sRow++;

        var resolvedRos = ClinicCensusBreakdownResolver.ResolveRosBreakdown(report);
        if (resolvedRos.Count > 0)
        {
            foreach (var ros in resolvedRos)
            {
                AddSummaryRow(
                    ros.RosCategory,
                    ros.VisitCount,
                    $"{ros.Percentage:0.0}% of census • {ros.DispensingCount} dispensing entries");
            }
        }
        else
        {
            ws2.Cell(sRow, 1).SetValue("No Review of Systems (ROS) categories recorded in this reporting period.");
            ws2.Range(sRow, 1, sRow, 3).Merge();
            ws2.Cell(sRow, 1).Style.Font.Italic = true;
            sRow++;
        }

        try
        {
            ws2.Columns(1, 5).AdjustToContents(15, 45);
        }
        catch
        {
            // Fallback for headless environments
        }

        // -------------------------------------------------------------
        // SHEET 3: UNIFIED DISPENSING LEDGER (when dispensing occurred)
        // -------------------------------------------------------------
        if (report.DispensingLedger is { Count: > 0 })
        {
            var ws3 = workbook.Worksheets.Add("Dispensing Ledger");
            ws3.ShowGridLines = true;

            ws3.Cell(1, 1).SetValue(clinicTitle);
            ws3.Cell(1, 1).Style.Font.Bold = true;
            ws3.Cell(1, 1).Style.Font.FontSize = 14;
            ws3.Cell(1, 1).Style.Font.FontColor = NavyBlue;

            ws3.Cell(2, 1).SetValue("UNIFIED CLINIC MEDICINE & SUPPLY DISPENSING LEDGER");
            ws3.Cell(2, 1).Style.Font.Bold = true;
            ws3.Cell(2, 1).Style.Font.FontSize = 11;
            ws3.Cell(2, 1).Style.Font.FontColor = NavyBlue;

            ws3.Cell(3, 1).SetValue($"Report Period: {report.StartDate:yyyy-MM-dd} to {report.EndDate:yyyy-MM-dd} • Total Entries: {report.DispensingLedger.Count}");
            ws3.Cell(3, 1).Style.Font.FontSize = 8.5;
            ws3.Cell(3, 1).Style.Font.FontColor = XLColor.FromHtml("#64748B");

            string[] ledgerHeaders =
            {
                "Dispensed Time",
                "Ticket No.",
                "Patient Name",
                "Visit & Services Availed",
                "Clinical Source",
                "Item Name",
                "Category",
                "Dosage / Spec",
                "Quantity",
                "Unit",
                "ROS Category",
                "Directions / Home Instructions",
                "Dispensed By",
                "Doctor Review"
            };

            ws3.Row(5).Height = 26;
            for (int c = 0; c < ledgerHeaders.Length; c++)
            {
                var cell = ws3.Cell(5, c + 1);
                cell.SetValue(ledgerHeaders[c]);
                cell.Style.Fill.BackgroundColor = NavyBlue;
                cell.Style.Font.FontColor = XLColor.White;
                cell.Style.Font.Bold = true;
                cell.Style.Font.FontSize = 9.5;
                cell.Style.Alignment.Vertical = XLAlignmentVerticalValues.Center;
                cell.Style.Alignment.WrapText = true;
            }

            int lRow = 6;
            foreach (var entry in report.DispensingLedger)
            {
                var bg = (lRow % 2 == 0) ? AltRowBg : XLColor.White;
                ws3.Cell(lRow, 1).SetValue(entry.DispensedAt.ToString("yyyy-MM-dd HH:mm"));
                ws3.Cell(lRow, 2).SetValue(entry.QueueNumber);
                ws3.Cell(lRow, 3).SetValue(entry.PatientName);
                ws3.Cell(lRow, 4).SetValue(entry.VisitType);
                ws3.Cell(lRow, 5).SetValue(entry.Source);
                ws3.Cell(lRow, 6).SetValue(entry.ItemName);
                ws3.Cell(lRow, 7).SetValue(entry.ItemCategory);
                ws3.Cell(lRow, 8).SetValue(entry.DosageOrSpec ?? "—");
                ws3.Cell(lRow, 9).SetValue(entry.QuantityDispensed);
                ws3.Cell(lRow, 10).SetValue(entry.FormOrUnit);
                ws3.Cell(lRow, 11).SetValue(entry.RosCategory);
                ws3.Cell(lRow, 12).SetValue(entry.DirectionsOrInstructions ?? "—");
                ws3.Cell(lRow, 13).SetValue($"{entry.DispensedByStaffName} ({entry.DispensedByRole})");
                var reviewText = !entry.RequiresDoctorReview
                    ? "Doctor Dispensed"
                    : (entry.IsReviewedByDoctor
                        ? $"Reviewed by {entry.ReviewedByDoctorName ?? "MD"}{(entry.InterventionFlagged ? " [Intervention]" : "")}"
                        : "Pending MD Review");
                ws3.Cell(lRow, 14).SetValue(reviewText);

                var lr = ws3.Range(lRow, 1, lRow, ledgerHeaders.Length);
                lr.Style.Fill.BackgroundColor = bg;
                lr.Style.Border.InsideBorder = XLBorderStyleValues.Thin;
                lr.Style.Border.InsideBorderColor = LightBorder;
                lr.Style.Border.OutsideBorder = XLBorderStyleValues.Thin;
                lr.Style.Border.OutsideBorderColor = BorderColor;
                lRow++;
            }

            ws3.SheetView.FreezeRows(5);
            if (lRow > 6)
            {
                ws3.Range(5, 1, lRow - 1, ledgerHeaders.Length).SetAutoFilter();
            }

            try
            {
                ws3.Columns(1, ledgerHeaders.Length).AdjustToContents(12, 42);
            }
            catch
            {
                // Fallback for headless environments
            }
        }

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }
}
