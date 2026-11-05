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

            // 13. Visit Type
            ws1.Cell(currentRow, 13).SetValue(item.VisitType);
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

            // 22. In-Clinic Procedures Performed
            ws1.Cell(currentRow, 22).SetValue(item.ProceduresPerformed ?? "—");

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
        AddSummaryRow("Non-Doctor Outpatient Visits", report.Summary.NonDoctorVisits, "Triage / Administrative / Vitals only");
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

        try
        {
            ws2.Columns(1, 5).AdjustToContents(15, 45);
        }
        catch
        {
            // Fallback for headless environments
        }

        using var ms = new MemoryStream();
        workbook.SaveAs(ms);
        return ms.ToArray();
    }
}
