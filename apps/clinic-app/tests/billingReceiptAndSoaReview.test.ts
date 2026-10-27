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

  describe('Suite 4: Consultations Screen Read-Only Clinical Charge Slip Review Flow', () => {
    const fs = require('fs');
    const path = require('path');
    const consultSource = fs.readFileSync(
      path.resolve(__dirname, '../navigation/screens/Consultations.screen.tsx'),
      'utf-8'
    );

    test('4.1 Consultations screen exports reviewChargeSlipModalVisible and handleInitiateSignAndReviewChargeSlip', () => {
      expect(consultSource).toContain('const [reviewChargeSlipModalVisible, setReviewChargeSlipModalVisible] = useState(false);');
      expect(consultSource).toContain('const handleInitiateSignAndReviewChargeSlip = () => {');
      expect(consultSource).toContain('const [chargeSlipItems, setChargeSlipItems] = useState');
    });

    test('4.2 Sign encounter button triggers handleInitiateSignAndReviewChargeSlip', () => {
      expect(consultSource).toContain('onPress={handleInitiateSignAndReviewChargeSlip}');
    });

    test('4.3 Charge Slip Preview Modal is strictly read-only and posts to Cashier (no SOA editing, no Print SOA)', () => {
      expect(consultSource).toContain('title="Clinical Charge Slip Preview"');
      expect(consultSource).toContain('CLINICAL CHARGES');
      expect(consultSource).toContain('Total Clinical Charges');
      expect(consultSource).toContain('title="Sign Encounter & Post Charge Slip"');
      expect(consultSource).toContain('onPress={handleConfirmAndSignEncounter}');
      // Doctor must preview read-only charge slip, NOT Statement of Account (SOA)
      expect(consultSource).not.toContain('title="Review Statement of Account (SOA)"');
      expect(consultSource).not.toContain('title="Print SOA (PDF)"');
      // Redundant top banner removed; consolidated note present
      expect(consultSource).not.toContain('Clinical Charge Slip (Read-Only)');
      expect(consultSource).toContain('Review clinical charges and procedures rendered during this encounter. This read-only charge slip will be posted to the Cashier');
    });

    test('4.4 Doctor encounter signing does NOT create an invoice (strictly posts charge slip to Cashier)', () => {
      // In handleSignConsultation, clinicService.createInvoice is NOT called
      expect(consultSource).not.toMatch(/handleSignConsultation[\s\S]*?clinicService\.createInvoice/);
      expect(consultSource).toContain('Encounter signed by ${doctor.name} (${finalPrc}) at ${nowStr}. Clinical charge slip posted to Cashier.');
    });

    test('4.5 Post-Encounter Dialog confirms charge slip is posted to Cashier without creating an invoice', () => {
      expect(consultSource).toContain('Clinical Encounter Signed & Synchronized');
      expect(consultSource).toContain('Doctor signed clinical chart and posted charge slip to Cashier.');
      expect(consultSource).toContain('Clinical Charge Slip: ₱{chargeSlipGross.toFixed(2)} (Posted to Cashier)');
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

    test('5.3 Billing screen offers Print OR (Thermal Paper), Print OR (PDF), and View SOA (PDF) actions with Close button', () => {
      expect(billingSource).toContain('title="Print OR (Thermal Paper)"');
      expect(billingSource).toContain('title="Print OR (PDF)"');
      expect(billingSource).toContain('title="View SOA (PDF)"');
      expect(billingSource).toContain('title="Close"');
      expect(billingSource).not.toContain('Done (Call Next Patient)');
      expect(billingSource).not.toContain('title="Professional PDF"');
    });

    test('5.4 consolidateLineItems consolidates items with identical price, doctor, and item code', () => {
      const { consolidateLineItems } = require('../utils/billingUtils');
      const rawItems = [
        { id: '1', code: 'CONSULT', name: 'General Consultation', category: 'Consultation', price: 500, qty: 1, doctorId: 'doc-1', doctorName: 'Dr. Wave Ambray' },
        { id: '2', code: 'CONSULT', name: 'General Consultation', category: 'Consultation', price: 500, qty: 1, doctorId: 'doc-1', doctorName: 'Dr. Wave Ambray' },
        { id: '3', code: 'CONSULT', name: 'General Consultation', category: 'Consultation', price: 500, qty: 1, doctorId: 'doc-2', doctorName: 'Dr. Allan Santos' },
        { id: '4', code: 'CBC', name: 'Complete Blood Count', category: 'Laboratory', price: 250, qty: 2, doctorId: 'doc-1', doctorName: 'Dr. Wave Ambray' },
        { id: '5', code: 'CBC', name: 'Complete Blood Count', category: 'Laboratory', price: 250, qty: 1, doctorId: 'doc-1', doctorName: 'Dr. Wave Ambray' },
      ];
      const consolidated = consolidateLineItems(rawItems);
      expect(consolidated).toHaveLength(3);
      const ambrayConsult = consolidated.find((i: any) => i.doctorId === 'doc-1' && i.code === 'CONSULT');
      expect(ambrayConsult?.qty).toBe(2);
      const santosConsult = consolidated.find((i: any) => i.doctorId === 'doc-2' && i.code === 'CONSULT');
      expect(santosConsult?.qty).toBe(1);
      const cbcItem = consolidated.find((i: any) => i.code === 'CBC');
      expect(cbcItem?.qty).toBe(3);
    });

    test('5.5 Collect button and action row styling is sleek and non-wrapping', () => {
      expect(billingSource).toContain('style={styles.settlePrimaryButton}');
      expect(billingSource).toContain('style={styles.settleDeferButton}');
      expect(billingSource).toContain('title="Print OR (PDF)"');
      expect(billingSource).toContain('openDocument(clinicService.getInvoicePdfUrl');
    });

    test('5.6 Document separation: Print OR (PDF) targets receipt endpoint and View SOA (PDF) targets invoice SOA endpoint', () => {
      expect(billingSource).toContain('clinicService.getReceiptPdfUrl');
      expect(billingSource).toContain('clinicService.getInvoicePdfUrl');
    });
  });

  describe('Suite 6: Multi-Doctor Line-Item Attribution & Document Separation Contracts (Tier 1 & Tier 4)', () => {
    test('6.1 Statement of Account (SOA) formats with INV- prefix and itemized services table', () => {
      const multiDoctorInvoice: InvoicePdfData = {
        invoiceNumber: 'INV-20261021-042',
        invoiceDate: 'Oct 21, 2026',
        status: 'Draft',
        patientName: 'Gloria Macapagal',
        patientId: 'p-multi-9912',
        queueNumber: 'A-042',
        grossAmount: 2300,
        discountType: 'None',
        discountAmount: 0,
        netAmount: 2300,
        balanceDue: 2300,
        notes: 'Multi-doctor outpatient visit awaiting settlement.',
        items: [
          {
            code: 'CONS-GEN',
            description: 'General Medicine Consultation • Dr. Wave Ambray',
            category: 'Consultation',
            unitPrice: 500,
            quantity: 1,
            totalPrice: 500,
          },
          {
            code: 'DENT-PROC',
            description: 'Tooth Extraction & Restoration • Dr. Allan Santos',
            category: 'Procedure',
            unitPrice: 1800,
            quantity: 1,
            totalPrice: 1800,
          },
        ],
      };

      const html = buildInvoicePdfHtml(multiDoctorInvoice, sampleLetterhead);
      expect(html).toContain('INV #INV-20261021-042');
      expect(html).toContain('STATEMENT OF ACCOUNT (SOA)');
      expect(html).toContain('General Medicine Consultation • Dr. Wave Ambray');
      expect(html).toContain('Tooth Extraction &amp; Restoration • Dr. Allan Santos');
      expect(html).toContain('₱2,300.00');
    });

    test('6.2 Official Receipt (OR) formats with OR- prefix and isolates payment settlement details', () => {
      const multiDoctorReceipt: ReceiptData = {
        orNumber: 'OR-20261021-042',
        invoiceNumber: 'INV-20261021-042',
        patientName: 'Gloria Macapagal',
        cashierName: 'Maria Santos, Cashier',
        paidAt: 'Oct 21, 2026, 11:30 AM',
        paymentMethod: 'GCash',
        referenceNumber: 'GCASH-REF-99281',
        grossAmount: 2300,
        discountType: 'None',
        discountAmount: 0,
        netAmount: 2300,
        change: 0,
        items: [
          {
            code: 'CONS-GEN',
            description: 'General Medicine Consultation • Dr. Wave Ambray',
            category: 'Consultation',
            unitPrice: 500,
            quantity: 1,
            totalPrice: 500,
          },
          {
            code: 'DENT-PROC',
            description: 'Tooth Extraction & Restoration • Dr. Allan Santos',
            category: 'Procedure',
            unitPrice: 1800,
            quantity: 1,
            totalPrice: 1800,
          },
        ],
      };

      const html = buildProfessionalReceiptHtml(multiDoctorReceipt, sampleLetterhead);
      expect(html).toContain('OR #OR-20261021-042');
      expect(html).toContain('OFFICIAL RECEIPT');
      expect(html).toContain('Maria Santos, Cashier');
      expect(html).toContain('GCash');
      expect(html).toContain('GCASH-REF-99281');
      expect(html).toContain('BIR TAX &amp; VAT BREAKDOWN');
    });

    test('6.3 Thermal POS format (58/80mm) includes document separation, clinician labels, and VAT-exempt healthcare notice', () => {
      const thermalReceipt: ReceiptData = {
        orNumber: 'OR-20261021-099',
        invoiceNumber: 'INV-20261021-099',
        patientName: 'Ramon Magsaysay',
        cashierName: 'Juanita Perez, Cashier',
        paidAt: 'Oct 21, 2026, 2:00 PM',
        paymentMethod: 'Cash',
        grossAmount: 850,
        discountType: 'PWD',
        discountIdNumber: 'PWD-12345',
        discountAmount: 170,
        netAmount: 680,
        cashTendered: 1000,
        change: 320,
        items: [
          {
            code: 'CONS-GEN',
            description: 'Consultation • Dr. Wave Ambray',
            category: 'Consultation',
            unitPrice: 500,
            quantity: 1,
            totalPrice: 500,
          },
          {
            code: 'PROC-NEB',
            description: 'Nebulization • Dr. Allan Santos',
            category: 'Procedure',
            unitPrice: 350,
            quantity: 1,
            totalPrice: 350,
          },
        ],
      };

      const html = buildThermalReceiptHtml(thermalReceipt, sampleLetterhead);
      expect(html).toContain('#OR-20261021-099');
      expect(html).toContain('OFFICIAL RECEIPT');
      expect(html).toContain('Consultation • Dr. Wave Ambray');
      expect(html).toContain('Nebulization • Dr. Allan Santos');
      expect(html).toContain('Discount (PWD - ID: PWD-12345)');
      expect(html).toContain('-₱170.00');
      expect(html).toContain('NET AMOUNT PAID:');
      expect(html).toContain('₱680.00');
      expect(html).toContain('Cash Tendered:');
      expect(html).toContain('₱1,000.00');
      expect(html).toContain('Change Returned:');
      expect(html).toContain('₱320.00');
      expect(html).toContain('THIS SERVES AS AN OFFICIAL RECEIPT');
    });
  });
});

