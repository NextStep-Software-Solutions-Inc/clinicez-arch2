export interface BillingLineItem {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  qty: number;
  doctorId?: string;
  doctorName?: string;
}

/** Consolidates items with identical item code/description, price, and attending clinician attribution. */
export function consolidateLineItems<T extends BillingLineItem>(items: T[]): T[] {
  const consolidated: T[] = [];
  for (const item of items) {
    const itemCode = (item.code || '').trim().toLowerCase();
    const itemName = (item.name || '').trim().toLowerCase();
    const itemDoctorId = (item.doctorId || '').trim();
    const itemDoctorName = (item.doctorName || '').trim().toLowerCase();

    const existing = consolidated.find((c) => {
      const cCode = (c.code || '').trim().toLowerCase();
      const cName = (c.name || '').trim().toLowerCase();
      const cDoctorId = (c.doctorId || '').trim();
      const cDoctorName = (c.doctorName || '').trim().toLowerCase();

      const codeMatches = itemCode && cCode ? itemCode === cCode : itemName === cName;
      const priceMatches = Math.abs(item.price - c.price) < 0.001;
      const doctorMatches = itemDoctorId && cDoctorId
        ? itemDoctorId === cDoctorId
        : itemDoctorId === cDoctorId || (!itemDoctorId && !cDoctorId && itemDoctorName === cDoctorName);

      return codeMatches && priceMatches && doctorMatches;
    });

    if (existing) {
      existing.qty += item.qty;
      if (!existing.doctorName && item.doctorName) {
        existing.doctorName = item.doctorName;
      }
    } else {
      consolidated.push({ ...item });
    }
  }
  return consolidated;
}
