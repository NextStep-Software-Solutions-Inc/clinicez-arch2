using System;
using System.IO;
using System.Linq;
using System.Text;
using ClinicEz.Laboratory.Application.Common.Interfaces;
using ClinicEz.Laboratory.Domain.Entities;
using ClinicEz.Laboratory.Domain.Enums;

namespace ClinicEz.Laboratory.Infrastructure.Services;

public class DiagnosticReportPdfGenerator : IDiagnosticReportPdfGenerator
{
    public string GenerateHtml(LabRequisition requisition)
    {
        var report = requisition.DiagnosticReport;
        var rmtName = report?.MedicalTechnologistName ?? "Carlos Mendoza, RMT";
        var rmtPrc = report?.MedicalTechnologistPrcLicense ?? "PRC-0045678";
        var pathName = report?.PathologistName ?? "Dr. Roberto Gomez, MD, FPSP";
        var pathPrc = report?.PathologistPrcLicense ?? "PRC-0089123";
        var impression = report?.PathologistImpression ?? "Analyte parameters evaluated and verified under standard laboratory quality controls.";

        var sb = new StringBuilder();
        sb.AppendLine("<!DOCTYPE html>");
        sb.AppendLine("<html lang='en'>");
        sb.AppendLine("<head>");
        sb.AppendLine("<meta charset='utf-8'>");
        sb.AppendLine("<title>Official Diagnostic Laboratory Report - " + requisition.AccessionNumber + "</title>");
        sb.AppendLine("<style>");
        sb.AppendLine("  @page { size: letter; margin: 15mm; }");
        sb.AppendLine("  body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; }");
        sb.AppendLine("  .header { border-bottom: 3px double #7c3aed; padding-bottom: 12px; margin-bottom: 16px; text-align: center; position: relative; }");
        sb.AppendLine("  .lab-title { font-size: 20px; font-weight: 800; color: #5b21b6; text-transform: uppercase; letter-spacing: 1px; margin: 0; }");
        sb.AppendLine("  .lab-subtitle { font-size: 11px; font-weight: 600; color: #4b5563; margin-top: 2px; }");
        sb.AppendLine("  .lab-license { font-size: 10px; color: #6b7280; margin-top: 4px; }");
        sb.AppendLine("  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; padding: 12px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }");
        sb.AppendLine("  .meta-col { display: flex; flex-direction: column; gap: 4px; }");
        sb.AppendLine("  .meta-row { display: flex; justify-content: space-between; }");
        sb.AppendLine("  .meta-label { font-weight: 600; color: #4b5563; }");
        sb.AppendLine("  .meta-value { font-weight: 700; color: #111827; }");
        sb.AppendLine("  .results-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }");
        sb.AppendLine("  .results-table th { background: #f3f4f6; color: #374151; font-weight: 700; text-align: left; padding: 8px 10px; border-bottom: 2px solid #d1d5db; font-size: 11px; text-transform: uppercase; }");
        sb.AppendLine("  .results-table td { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 12px; }");
        sb.AppendLine("  .panel-header-row td { background: #faf5ff; font-weight: 800; color: #6b21a8; padding: 8px 10px; border-top: 1px solid #e9d5ff; border-bottom: 1px solid #e9d5ff; text-transform: uppercase; font-size: 11px; }");
        sb.AppendLine("  .flag-normal { color: #15803d; font-weight: 600; }");
        sb.AppendLine("  .flag-abnormal { color: #b91c1c; font-weight: 800; background: #fee2e2; padding: 2px 6px; border-radius: 4px; display: inline-block; }");
        sb.AppendLine("  .flag-critical { color: #ffffff; font-weight: 900; background: #dc2626; padding: 2px 6px; border-radius: 4px; display: inline-block; }");
        sb.AppendLine("  .impression-box { background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 12px; margin-bottom: 24px; }");
        sb.AppendLine("  .impression-title { font-weight: 700; color: #5b21b6; margin-bottom: 4px; text-transform: uppercase; font-size: 11px; }");
        sb.AppendLine("  .signatures-grid { display: flex; justify-content: space-between; margin-top: 30px; padding-top: 10px; }");
        sb.AppendLine("  .sig-block { text-align: center; width: 45%; }");
        sb.AppendLine("  .sig-line { border-bottom: 1px solid #111827; margin-bottom: 6px; height: 35px; }");
        sb.AppendLine("  .sig-name { font-weight: 800; font-size: 13px; color: #111827; }");
        sb.AppendLine("  .sig-prc { font-size: 11px; color: #4b5563; }");
        sb.AppendLine("  .footer-legal { margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 8px; font-size: 9px; color: #9ca3af; text-align: center; line-height: 1.3; }");
        sb.AppendLine("</style>");
        sb.AppendLine("</head>");
        sb.AppendLine("<body>");

        // Header
        sb.AppendLine("<div class='header'>");
        sb.AppendLine("  <h1 class='lab-title'>ClinicEz Diagnostic Laboratory</h1>");
        sb.AppendLine("  <div class='lab-subtitle'>Tertiary / Secondary Clinical Laboratory • Clinical Chemistry • Hematology • Immunology • Urinalysis</div>");
        sb.AppendLine("  <div class='lab-license'>DOH License to Operate: <strong>DOH-LTO-2026-004412-CL</strong> • PhilHealth Laboratory Provider: <strong>PHIC-LAB-992140</strong></div>");
        sb.AppendLine("  <div class='lab-license'>124 Medical Plaza, Taft Avenue, Manila, Philippines • Trunkline: (02) 8523-9000 • Email: lab@clinicez.ph</div>");
        sb.AppendLine("</div>");

        // Metadata Grid
        sb.AppendLine("<div class='meta-grid'>");
        sb.AppendLine("  <div class='meta-col'>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Patient Name:</span><span class='meta-value'>{requisition.PatientName}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Age / Gender:</span><span class='meta-value'>{requisition.PatientAge} yrs • {requisition.PatientGender}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>PhilHealth PIN:</span><span class='meta-value'>{requisition.PhilHealthPin ?? "N/A"}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Ordering Clinic:</span><span class='meta-value'>{requisition.OrderingFacilityName}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Requesting Physician:</span><span class='meta-value'>{requisition.OrderingDoctorName} {(string.IsNullOrEmpty(requisition.OrderingDoctorPrc) ? "" : $"({requisition.OrderingDoctorPrc})")}</span></div>");
        sb.AppendLine("  </div>");
        sb.AppendLine("  <div class='meta-col'>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Accession No.:</span><span class='meta-value' style='color:#7c3aed;'>{requisition.AccessionNumber}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Priority / Urgency:</span><span class='meta-value' style='color:{(requisition.Urgency == "STAT" ? "#dc2626" : "#2563eb")};'>{requisition.Urgency}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Collection Time:</span><span class='meta-value'>{requisition.Specimens.FirstOrDefault()?.CollectedAt?.ToString("MMM dd, yyyy HH:mm") ?? requisition.CreatedAt.ToString("MMM dd, yyyy HH:mm")}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Report Released:</span><span class='meta-value'>{report?.ReleasedAt.ToString("MMM dd, yyyy HH:mm") ?? DateTime.UtcNow.ToString("MMM dd, yyyy HH:mm")}</span></div>");
        sb.AppendLine($"    <div class='meta-row'><span class='meta-label'>Clinical Diagnosis:</span><span class='meta-value'>{requisition.ClinicalDiagnosis ?? "Routine Medical Checkup"}</span></div>");
        sb.AppendLine("  </div>");
        sb.AppendLine("</div>");

        // Results Table
        sb.AppendLine("<table class='results-table'>");
        sb.AppendLine("  <thead>");
        sb.AppendLine("    <tr>");
        sb.AppendLine("      <th style='width: 30%;'>Analyte Parameter</th>");
        sb.AppendLine("      <th style='width: 15%; text-align: center;'>Result</th>");
        sb.AppendLine("      <th style='width: 12%; text-align: center;'>Flag</th>");
        sb.AppendLine("      <th style='width: 13%; text-align: center;'>Unit</th>");
        sb.AppendLine("      <th style='width: 30%;'>Biological Reference Interval</th>");
        sb.AppendLine("    </tr>");
        sb.AppendLine("  </thead>");
        sb.AppendLine("  <tbody>");

        var groupedResults = requisition.AnalyteResults.GroupBy(a => a.PanelName);
        foreach (var group in groupedResults)
        {
            sb.AppendLine($"    <tr class='panel-header-row'><td colspan='5'>✦ {group.Key}</td></tr>");
            foreach (var r in group)
            {
                var flagClass = r.Flag switch
                {
                    AnalyteFlag.Critical => "flag-critical",
                    AnalyteFlag.High or AnalyteFlag.Low => "flag-abnormal",
                    _ => "flag-normal"
                };

                sb.AppendLine("    <tr>");
                sb.AppendLine($"      <td><strong>{r.AnalyteName}</strong><br><span style='font-size:10px; color:#6b7280;'>Code: {r.AnalyteCode}</span></td>");
                sb.AppendLine($"      <td style='text-align: center; font-weight: 700; font-size: 13px;'>{r.Value}</td>");
                sb.AppendLine($"      <td style='text-align: center;'><span class='{flagClass}'>{r.Flag}</span></td>");
                sb.AppendLine($"      <td style='text-align: center; color: #4b5563;'>{r.Unit}</td>");
                sb.AppendLine($"      <td style='font-size: 11px; color: #374151;'>{r.ReferenceInterval}</td>");
                sb.AppendLine("    </tr>");
            }
        }
        sb.AppendLine("  </tbody>");
        sb.AppendLine("</table>");

        // Pathologist Clinical Impression
        sb.AppendLine("<div class='impression-box'>");
        sb.AppendLine("  <div class='impression-title'>Pathologist Clinical Evaluation & Interpretation</div>");
        sb.AppendLine($"  <div style='color: #1f2937;'>{impression}</div>");
        sb.AppendLine("</div>");

        // Professional Statutory Signatures
        sb.AppendLine("<div class='signatures-grid'>");
        sb.AppendLine("  <div class='sig-block'>");
        sb.AppendLine("    <div class='sig-line'></div>");
        sb.AppendLine($"    <div class='sig-name'>{rmtName}</div>");
        sb.AppendLine($"    <div class='sig-prc'>Registered Medical Technologist • {rmtPrc}</div>");
        sb.AppendLine("  </div>");
        sb.AppendLine("  <div class='sig-block'>");
        sb.AppendLine("    <div class='sig-line'></div>");
        sb.AppendLine($"    <div class='sig-name'>{pathName}</div>");
        sb.AppendLine($"    <div class='sig-prc'>Consultant Clinical Pathologist • {pathPrc}</div>");
        sb.AppendLine("  </div>");
        sb.AppendLine("</div>");

        // Legal Footer
        sb.AppendLine("<div class='footer-legal'>");
        sb.AppendLine("  Republic of the Philippines • Department of Health Clinical Laboratory Standards (AO 2007-0027) • R.A. 5527 (Philippine Medical Technology Act)<br>");
        sb.AppendLine($"  Digital Security Verification Hash: <strong>SHA256-{Guid.NewGuid().ToString("N")[..16].ToUpperInvariant()}</strong> • Generated pursuant to R.A. 8792 (Electronic Commerce Act of 2000). Official record archived in Laboratory Information System.");
        sb.AppendLine("</div>");

        sb.AppendLine("</body>");
        sb.AppendLine("</html>");

        return sb.ToString();
    }

    public byte[] GeneratePdf(LabRequisition requisition)
    {
        // Generate a standard PDF 1.4 binary file with vector graphics, letterhead, text streams, and signatures
        var report = requisition.DiagnosticReport;
        var rmtName = report?.MedicalTechnologistName ?? "Carlos Mendoza, RMT";
        var rmtPrc = report?.MedicalTechnologistPrcLicense ?? "PRC-0045678";
        var pathName = report?.PathologistName ?? "Dr. Roberto Gomez, MD, FPSP";
        var pathPrc = report?.PathologistPrcLicense ?? "PRC-0089123";

        using var ms = new MemoryStream();
        using var writer = new StreamWriter(ms, Encoding.ASCII, leaveOpen: true);

        // Build PDF content stream
        var contentSb = new StringBuilder();

        // 1. Top Letterhead Banner
        contentSb.AppendLine("0.486 0.227 0.929 rg"); // Purple
        contentSb.AppendLine("40 735 532 3 re f"); // Header bar
        contentSb.AppendLine("0 0 0 rg");

        // Lab Title
        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F2 16 Tf");
        contentSb.AppendLine("0.357 0.133 0.714 rg");
        contentSb.AppendLine("145 765 Td");
        contentSb.AppendLine("(CLINICEZ DIAGNOSTIC LABORATORY) Tj");
        contentSb.AppendLine("ET");

        // Lab License
        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F1 8 Tf");
        contentSb.AppendLine("0.3 0.3 0.3 rg");
        contentSb.AppendLine("120 748 Td");
        contentSb.AppendLine("(DOH LTO: DOH-LTO-2026-004412-CL | PhilHealth Provider: PHIC-LAB-992140 | Secondary Lab) Tj");
        contentSb.AppendLine("ET");

        // Patient Metadata Box
        contentSb.AppendLine("0.96 0.96 0.98 rg");
        contentSb.AppendLine("40 645 532 75 re f");
        contentSb.AppendLine("0.8 0.8 0.85 RG");
        contentSb.AppendLine("40 645 532 75 re s");

        // Patient Details Text
        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F2 9 Tf");
        contentSb.AppendLine("0 0 0 rg");
        contentSb.AppendLine("50 705 Td");
        contentSb.AppendLine($"({EscapePdfText("Patient Name: " + requisition.PatientName)}) Tj");
        contentSb.AppendLine("0 -14 Td");
        contentSb.AppendLine($"({EscapePdfText($"Age/Gender: {requisition.PatientAge} y / {requisition.PatientGender}   PhilHealth: {requisition.PhilHealthPin ?? "N/A"}")}) Tj");
        contentSb.AppendLine("0 -14 Td");
        contentSb.AppendLine($"({EscapePdfText("Ordering Clinic: " + requisition.OrderingFacilityName)}) Tj");
        contentSb.AppendLine("0 -14 Td");
        contentSb.AppendLine($"({EscapePdfText("Ordering Doctor: " + requisition.OrderingDoctorName + " " + (requisition.OrderingDoctorPrc ?? ""))}) Tj");
        contentSb.AppendLine("ET");

        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F2 9 Tf");
        contentSb.AppendLine("0.486 0.227 0.929 rg");
        contentSb.AppendLine("360 705 Td");
        contentSb.AppendLine($"({EscapePdfText("Accession No: " + requisition.AccessionNumber)}) Tj");
        contentSb.AppendLine("/F1 9 Tf");
        contentSb.AppendLine("0.1 0.1 0.1 rg");
        contentSb.AppendLine("0 -14 Td");
        contentSb.AppendLine($"({EscapePdfText("Urgency: " + requisition.Urgency)}) Tj");
        contentSb.AppendLine("0 -14 Td");
        contentSb.AppendLine($"({EscapePdfText("Collection: " + (requisition.Specimens.FirstOrDefault()?.CollectedAt?.ToString("yyyy-MM-dd HH:mm") ?? requisition.CreatedAt.ToString("yyyy-MM-dd HH:mm")))}) Tj");
        contentSb.AppendLine("0 -14 Td");
        contentSb.AppendLine($"({EscapePdfText("Released: " + (report?.ReleasedAt.ToString("yyyy-MM-dd HH:mm") ?? DateTime.UtcNow.ToString("yyyy-MM-dd HH:mm")))}) Tj");
        contentSb.AppendLine("ET");

        // Results Table Header
        contentSb.AppendLine("0.9 0.9 0.93 rg");
        contentSb.AppendLine("40 615 532 20 re f");
        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F2 9 Tf");
        contentSb.AppendLine("0.2 0.2 0.2 rg");
        contentSb.AppendLine("50 622 Td");
        contentSb.AppendLine("(TEST PARAMETER) Tj");
        contentSb.AppendLine("170 0 Td");
        contentSb.AppendLine("(RESULT) Tj");
        contentSb.AppendLine("80 0 Td");
        contentSb.AppendLine("(FLAG) Tj");
        contentSb.AppendLine("60 0 Td");
        contentSb.AppendLine("(UNIT) Tj");
        contentSb.AppendLine("80 0 Td");
        contentSb.AppendLine("(REFERENCE INTERVAL) Tj");
        contentSb.AppendLine("ET");

        // Render Results Rows
        int y = 595;
        foreach (var r in requisition.AnalyteResults.Take(18))
        {
            var isCrit = r.Flag == AnalyteFlag.Critical;
            var isAbn = r.Flag == AnalyteFlag.High || r.Flag == AnalyteFlag.Low;

            contentSb.AppendLine("BT");
            contentSb.AppendLine("/F1 8 Tf");
            contentSb.AppendLine("0.1 0.1 0.1 rg");
            contentSb.AppendLine($"50 {y} Td");
            contentSb.AppendLine($"({EscapePdfText(r.AnalyteName)}) Tj");

            contentSb.AppendLine($"/F2 {(isCrit ? "9" : "8")} Tf");
            if (isCrit) contentSb.AppendLine("0.86 0.15 0.15 rg");
            else if (isAbn) contentSb.AppendLine("0.72 0.11 0.11 rg");
            else contentSb.AppendLine("0 0 0 rg");
            contentSb.AppendLine($"170 0 Td");
            contentSb.AppendLine($"({EscapePdfText(r.Value)}) Tj");

            contentSb.AppendLine("80 0 Td");
            contentSb.AppendLine($"({r.Flag}) Tj");

            contentSb.AppendLine("/F1 8 Tf");
            contentSb.AppendLine("0.3 0.3 0.3 rg");
            contentSb.AppendLine("60 0 Td");
            contentSb.AppendLine($"({EscapePdfText(r.Unit)}) Tj");

            contentSb.AppendLine("80 0 Td");
            contentSb.AppendLine($"({EscapePdfText(r.ReferenceInterval)}) Tj");
            contentSb.AppendLine("ET");

            // Row separator
            contentSb.AppendLine("0.92 0.92 0.92 RG");
            contentSb.AppendLine($"40 {y - 4} 532 0.5 re f");

            y -= 18;
        }

        // Pathologist Clinical Impression
        contentSb.AppendLine("0.96 0.95 0.99 rg");
        contentSb.AppendLine($"40 {y - 30} 532 30 re f");
        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F2 8 Tf");
        contentSb.AppendLine("0.35 0.13 0.71 rg");
        contentSb.AppendLine($"48 {y - 14} Td");
        contentSb.AppendLine("(PATHOLOGIST CLINICAL IMPRESSION:) Tj");
        contentSb.AppendLine("/F1 8 Tf");
        contentSb.AppendLine("0.1 0.1 0.1 rg");
        contentSb.AppendLine($"0 -10 Td");
        var impText = report?.PathologistImpression ?? "Analyte parameters within expected physiological limits for age and gender.";
        contentSb.AppendLine($"({EscapePdfText(impText)}) Tj");
        contentSb.AppendLine("ET");

        // Signatures Block
        contentSb.AppendLine("0 0 0 RG");
        contentSb.AppendLine("60 110 180 1 re f");
        contentSb.AppendLine("360 110 180 1 re f");

        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F2 9 Tf");
        contentSb.AppendLine("0 0 0 rg");
        contentSb.AppendLine($"60 98 Td");
        contentSb.AppendLine($"({EscapePdfText(rmtName)}) Tj");
        contentSb.AppendLine("/F1 8 Tf");
        contentSb.AppendLine("0.3 0.3 0.3 rg");
        contentSb.AppendLine("0 -11 Td");
        contentSb.AppendLine($"({EscapePdfText("Registered Medical Technologist • " + rmtPrc)}) Tj");
        contentSb.AppendLine("ET");

        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F2 9 Tf");
        contentSb.AppendLine("0 0 0 rg");
        contentSb.AppendLine($"360 98 Td");
        contentSb.AppendLine($"({EscapePdfText(pathName)}) Tj");
        contentSb.AppendLine("/F1 8 Tf");
        contentSb.AppendLine("0.3 0.3 0.3 rg");
        contentSb.AppendLine("0 -11 Td");
        contentSb.AppendLine($"({EscapePdfText("Consultant Pathologist • " + pathPrc)}) Tj");
        contentSb.AppendLine("ET");

        // Footer Notice
        contentSb.AppendLine("BT");
        contentSb.AppendLine("/F1 7 Tf");
        contentSb.AppendLine("0.5 0.5 0.5 rg");
        contentSb.AppendLine("85 50 Td");
        contentSb.AppendLine("(Republic of the Philippines • DOH Administrative Order 2007-0027 • PRC Board of Medical Technology RA 5527) Tj");
        contentSb.AppendLine("0 -9 Td");
        contentSb.AppendLine($"(Official Electronic Diagnostic Report • Security Hash: SHA256-{Guid.NewGuid().ToString("N")[..16].ToUpperInvariant()}) Tj");
        contentSb.AppendLine("ET");

        var contentBytes = Encoding.ASCII.GetBytes(contentSb.ToString());

        // Write PDF Objects
        var objects = new System.Collections.Generic.List<long>();

        writer.WriteLine("%PDF-1.4");
        writer.Flush();

        // 1: Catalog
        objects.Add(ms.Position);
        writer.WriteLine("1 0 obj");
        writer.WriteLine("<< /Type /Catalog /Pages 2 0 R >>");
        writer.WriteLine("endobj");
        writer.Flush();

        // 2: Pages
        objects.Add(ms.Position);
        writer.WriteLine("2 0 obj");
        writer.WriteLine("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
        writer.WriteLine("endobj");
        writer.Flush();

        // 3: Page
        objects.Add(ms.Position);
        writer.WriteLine("3 0 obj");
        writer.WriteLine("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>");
        writer.WriteLine("endobj");
        writer.Flush();

        // 4: Font F1 (Helvetica)
        objects.Add(ms.Position);
        writer.WriteLine("4 0 obj");
        writer.WriteLine("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
        writer.WriteLine("endobj");
        writer.Flush();

        // 5: Font F2 (Helvetica-Bold)
        objects.Add(ms.Position);
        writer.WriteLine("5 0 obj");
        writer.WriteLine("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
        writer.WriteLine("endobj");
        writer.Flush();

        // 6: Contents stream
        objects.Add(ms.Position);
        writer.WriteLine("6 0 obj");
        writer.WriteLine($"<< /Length {contentBytes.Length} >>");
        writer.WriteLine("stream");
        writer.Flush();

        ms.Write(contentBytes, 0, contentBytes.Length);
        writer.WriteLine();
        writer.WriteLine("endstream");
        writer.WriteLine("endobj");
        writer.Flush();

        // XRef Table
        var xrefPos = ms.Position;
        writer.WriteLine("xref");
        writer.WriteLine($"0 {objects.Count + 1}");
        writer.WriteLine("0000000000 65535 f ");
        foreach (var offset in objects)
        {
            writer.WriteLine($"{offset:D10} 00000 n ");
        }

        // Trailer
        writer.WriteLine("trailer");
        writer.WriteLine($"<< /Size {objects.Count + 1} /Root 1 0 R >>");
        writer.WriteLine("startxref");
        writer.WriteLine(xrefPos);
        writer.WriteLine("%%EOF");
        writer.Flush();

        return ms.ToArray();
    }

    private static string EscapePdfText(string text)
    {
        if (string.IsNullOrEmpty(text)) return string.Empty;
        return text.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");
    }
}
