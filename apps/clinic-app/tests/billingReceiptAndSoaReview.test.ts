import { describe, test, expect } from 'bun:test';
import {
  buildThermalReceiptHtml,
  buildProfessionalReceiptHtml,
  buildInvoicePdfHtml,
  type ReceiptData,
  type InvoicePdfData,
  type PrintLetterhead,
} from '../utils/receiptHtml';

describe('Billing Receipt & SOA Review Feature Tests', () => {
  const sampleLetterhead: PrintLetterhead = {
    header: 'ClinicEZ Metro Medical Center',
    subHeader: 'Primary & Ambulatory Healthcare Facility',
    address: '123 Health Ave, Brgy. San Antonio, Pasig City',
    contact: '(02) 8123-4567 • info@clinicez.ph',
    tin: '123-456-789-000',
    accreditationNumber: 'PH-KONSULTA-2026-0042',
    dohLto: 'DOH-LTO-04A-2026-99',
  };

  const sampleReceipt: ReceiptData = {
    orNumber: 'OR-20261020-001',
    invoiceNumber: 'INV-20261020-001',
    patientName: 'Benedict D. Abellana',
    patientId: 'p-12345678-abcd',
    patientAge: 42,
    patientGender: 'Male',
    cashierName: 'Maria Santos, Cashier',
    paidAt: 'Oct 20, 2026, 9:15 AM',
    paymentMethod: 'Cash',
    referenceNumber: 'CASH-9912',
    grossAmount: 1850,
    discountType: 'SeniorCitizen',
    discountIdNumber: 'OSCA-2026-8871',
    discountAmount: 370,
    netAmount: 1480,
    cashTendered: 2000,
    change: 520,
    items: [
      {
        code: 'CONSULT',
        description: 'General Medical Consultation',
        category: 'Consultation',
        unitPrice: 500,
        quantity: 1,
        totalPrice: 500,
      },
      {
        code: 'PROC-NEB',
        description: 'Nebulization Therapy',
        category: 'Procedure',
        unitPrice: 350,
        quantity: 1,
        totalPrice: 350,
      },
      {
        code: 'PROC-SUTURE',
        description: 'Minor Suture / Laceration Repair',
        category: 'Procedure',
        unitPrice: 800,
        quantity: 1,
        totalPrice: 800,
      },
      {
        code: 'PROC-VAX-FEE',
        description: 'Vaccine Administration Fee',
        category: 'Procedure',
        unitPrice: 200,
        quantity: 1,
        totalPrice: 200,
      },
    ],
  };

  const sampleInvoice: InvoicePdfData = {
    invoiceNumber: 'INV-20261020-001',
    invoiceDate: 'Oct 20, 2026',
    status: 'Approved',
    patientName: 'Benedict D. Abellana',
    patientId: 'p-12345678-abcd',
    attendingDoctorName: 'Allan Ramos, MD',
    doctorPrc: '0123456',
    queueNumber: 'A-012',
    grossAmount: 1850,
    discountType: 'SeniorCitizen',
    discountIdNumber: 'OSCA-2026-8871',
    discountPercentage: 20,
    discountAmount: 370,
    netAmount: 1480,
    amountPaid: 1480,
    balanceDue: 0,
    notes: 'In-clinic procedures & consultation approved and forwarded for settlement.',
    items: sampleReceipt.items!,
  };

  describe('Suite 1: Thermal Paper Receipt (POS 58mm/80mm Roll Format)', () => {
    test('1.1 Generates 80mm roll printer @page CSS and monospace font', () => {
      const html = buildThermalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('size: 80mm auto');
      expect(html).toContain("font-family: 'Courier New', Courier, monospace");
      expect(html).toContain('OFFICIAL RECEIPT');
    });

    test('1.2 Includes facility letterhead, BIR TIN, and accreditation numbers', () => {
      const html = buildThermalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('ClinicEZ Metro Medical Center');
      expect(html).toContain('TIN: 123-456-789-000');
      expect(html).toContain('PhilHealth Accr: PH-KONSULTA-2026-0042');
    });

    test('1.3 Itemizes all consultation and in-clinic procedures with amounts', () => {
      const html = buildThermalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('General Medical Consultation');
      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Minor Suture / Laceration Repair');
      expect(html).toContain('Vaccine Administration Fee');
      expect(html).toContain('₱500.00');
      expect(html).toContain('₱350.00');
      expect(html).toContain('₱800.00');
      expect(html).toContain('₱200.00');
    });

    test('1.4 Displays statutory discount (Senior Citizen 20%), net amount, cash tendered, and change', () => {
      const html = buildThermalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('Discount (SeniorCitizen - ID: OSCA-2026-8871)');
      expect(html).toContain('-₱370.00');
      expect(html).toContain('NET AMOUNT PAID:');
      expect(html).toContain('₱1,480.00');
      expect(html).toContain('Cash Tendered:');
      expect(html).toContain('₱2,000.00');
      expect(html).toContain('Change Returned:');
      expect(html).toContain('₱520.00');
    });

    test('1.5 Contains official BIR compliance footnote', () => {
      const html = buildThermalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('THIS SERVES AS AN OFFICIAL RECEIPT');
      expect(html).toContain('Issued under BIR Revenue Regulations');
    });
  });

  describe('Suite 2: Professional Official Receipt PDF (A4 / Letter Format)', () => {
    test('2.1 Generates A4 portrait @page CSS with professional layout', () => {
      const html = buildProfessionalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('size: A4 portrait');
      expect(html).toContain('OFFICIAL RECEIPT');
      expect(html).toContain('VALIDATED &amp; SETTLED');
    });

    test('2.2 Renders customer demographic card with patient name and OSCA ID', () => {
      const html = buildProfessionalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('Benedict D. Abellana');
      expect(html).toContain('OSCA-2026-8871 (SeniorCitizen)');
      expect(html).toContain('Maria Santos, Cashier');
    });

    test('2.3 Displays formal table with service items, categories, and prices', () => {
      const html = buildProfessionalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('<table class="data-table">');
      expect(html).toContain('General Medical Consultation');
      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Minor Suture / Laceration Repair');
      expect(html).toContain('Vaccine Administration Fee');
      expect(html).toContain('Procedure');
      expect(html).toContain('Consultation');
    });

    test('2.4 Renders BIR tax & VAT breakdown grid for healthcare compliance', () => {
      const html = buildProfessionalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('BIR TAX &amp; VAT BREAKDOWN');
      expect(html).toContain('VATable Sales:');
      expect(html).toContain('VAT-Exempt Sales (Medical):');
      expect(html).toContain('Total Gross Sales:');
      expect(html).toContain('₱1,850.00');
    });

    test('2.5 Includes patient and authorized cashier signature lines', () => {
      const html = buildProfessionalReceiptHtml(sampleReceipt, sampleLetterhead);
      expect(html).toContain('Patient / Authorized Representative Signature');
      expect(html).toContain('Authorized Cashier / Billing Officer');
      expect(html).toContain('RA 9994 (Senior Citizen Act)');
    });
  });

  describe('Suite 3: Approved Statement of Account / Billing Invoice PDF', () => {
    test('3.1 Generates A4 print-ready invoice with APPROVED status badge', () => {
      const html = buildInvoicePdfHtml(sampleInvoice, sampleLetterhead);
      expect(html).toContain('size: A4 portrait');
      expect(html).toContain('APPROVED INVOICE');
      expect(html).toContain('INV #INV-20261020-001');
      expect(html).toContain('APPROVED');
    });

    test('3.2 Displays patient queue ticket, attending doctor, and PRC license', () => {
      const html = buildInvoicePdfHtml(sampleInvoice, sampleLetterhead);
      expect(html).toContain('Benedict D. Abellana');
      expect(html).toContain('Queue / Ticket:');
      expect(html).toContain('A-012');
      expect(html).toContain('Dr. Allan Ramos, MD');
      expect(html).toContain('0123456');
    });

    test('3.3 Displays itemized table with all procedures and consultation fees', () => {
      const html = buildInvoicePdfHtml(sampleInvoice, sampleLetterhead);
      expect(html).toContain('General Medical Consultation');
      expect(html).toContain('Nebulization Therapy');
      expect(html).toContain('Minor Suture / Laceration Repair');
      expect(html).toContain('Vaccine Administration Fee');
      expect(html).toContain('₱1,850.00');
      expect(html).toContain('-₱370.00');
      expect(html).toContain('₱1,480.00');
    });

    test('3.4 Includes attending physician and billing officer verification stamps', () => {
      const html = buildInvoicePdfHtml(sampleInvoice, sampleLetterhead);
      expect(html).toContain('Dr. Allan Ramos, MD');
      expect(html).toContain('Attending Physician / Clinician Signature');
      expect(html).toContain('Authorized Billing Station Verification');
    });
  });

  describe('Suite 4: Consultations Screen Statement of Account (SOA) Review Flow', () => {
    const fs = require('fs');
    const path = require('path');
    const consultSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx'),
      'utf-8'
    );

    test('4.1 Consultations screen exports reviewSoaModalVisible and handleInitiateSignAndReviewSoa', () => {
      expect(consultSource).toContain('const [reviewSoaModalVisible, setReviewSoaModalVisible] = useState(false);');
      expect(consultSource).toContain('const handleInitiateSignAndReviewSoa = () => {');
      expect(consultSource).toContain('const [soaReviewItems, setSoaReviewItems] = useState');
      expect(consultSource).toContain('const [soaDiscountType, setSoaDiscountType] = useState');
    });

    test('4.2 Sign encounter button triggers handleInitiateSignAndReviewSoa', () => {
      expect(consultSource).toContain('onPress={handleInitiateSignAndReviewSoa}');
    });

    test('4.3 Review SOA Modal displays billable items, totals, and Print SOA (PDF)', () => {
      expect(consultSource).toContain('title="Review Statement of Account (SOA)"');
      expect(consultSource).toContain('BILLABLE SERVICES &amp; PROCEDURES'.replace('&amp;', '&'));
      expect(consultSource).toContain('Total Billable Clinical Services');
      expect(consultSource).toContain('title="Print SOA (PDF)"');
      expect(consultSource).toContain('onPress={handlePrintSoaPreview}');
      expect(consultSource).toContain('title="Confirm &amp; Sign Encounter"'.replace('&amp;', '&'));
      expect(consultSource).toContain('onPress={handleConfirmAndSignEncounter}');
    });

    test('4.4 handleSignAndSync uses reviewed SOA line items and chosen statutory discount', () => {
      expect(consultSource).toContain('const effectiveBillItems = soaReviewItems.length > 0 ? soaReviewItems : billItems;');
      expect(consultSource).toContain('discountType: soaDiscountType || \'None\'');
      expect(consultSource).toContain('discountIdNumber: soaDiscountId.trim() || undefined');
    });

    test('4.5 Post-Encounter Action Dialog contains Print SOA (PDF) button when invoice is created', () => {
      expect(consultSource).toContain('createdInvoiceNumber && (');
      expect(consultSource).toContain('title="Print SOA (PDF)"');
      expect(consultSource).toContain('onPress={handlePrintApprovedSoa}');
    });
  });

  describe('Suite 5: Cashier Billing Auto-Rehydration & Receipt Dual-Format Selection', () => {
    const fs = require('fs');
    const path = require('path');
    const billingSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Billing.screen.tsx'),
      'utf-8'
    );

    test('5.1 Billing screen contains handlePrintInvoicePdf for printing Statement of Account (SOA) PDF', () => {
      expect(billingSource).toContain('const handlePrintInvoicePdf = async () => {');
      expect(billingSource).toContain('title="Print SOA (PDF)"');
      expect(billingSource).toContain('onPress={handlePrintInvoicePdf}');
    });

    test('5.2 Billing screen rehydrates unbilled procedures and consultation fees from completed encounters', () => {
      expect(billingSource).toContain('clinicService.getProcedures(p.patientId)');
      expect(billingSource).toContain('clinicService.getConsultations(p.patientId)');
      expect(billingSource).toContain('procsData');
    });

    test('5.3 Billing screen offers dual receipt actions: Thermal Paper (POS) and Professional PDF', () => {
      expect(billingSource).toContain('title="Thermal Paper (POS)"');
      expect(billingSource).toContain('title="Professional PDF"');
      expect(billingSource).toContain('printThermalReceipt(lastReceipt, printLetterhead)');
      expect(billingSource).toContain('printProfessionalReceipt(lastReceipt, printLetterhead)');
    });
  });
});
