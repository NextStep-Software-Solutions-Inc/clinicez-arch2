import { apiBaseUrl } from "@/transport/apiClient";
import { siteEmails } from "@/config/site";

export interface ContactMessageDto {
  name: string;
  email: string;
  message: string;
}

export interface PublicContactInfo {
  headquartersAddress: string;
  supportEmail: string;
  salesEmail: string;
  phoneNumber: string;
  operatingHours: string;
}

export const DEFAULT_CONTACT_INFO: PublicContactInfo = {
  headquartersAddress:
    "San Juan 2, Sto Nino\nLapasan, Cagayan de Oro City\nMisamis Oriental\nPhilippines 9000",
  supportEmail: siteEmails.support || "support@clinicez.com",
  salesEmail: siteEmails.sales || "sales@clinicez.com",
  phoneNumber: "+63 (965) 429-7640",
  operatingHours: "Mon - Fri, 8am - 5pm (PHT)",
};

export const getPublicContactInfo = async (): Promise<PublicContactInfo> => {
  try {
    const res = await fetch(`${apiBaseUrl}/contact/info`, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (res.ok) {
      const data = await res.json();
      return {
        headquartersAddress: data.headquartersAddress || DEFAULT_CONTACT_INFO.headquartersAddress,
        supportEmail: data.supportEmail || DEFAULT_CONTACT_INFO.supportEmail,
        salesEmail: data.salesEmail || DEFAULT_CONTACT_INFO.salesEmail,
        phoneNumber: data.phoneNumber || DEFAULT_CONTACT_INFO.phoneNumber,
        operatingHours: data.operatingHours || DEFAULT_CONTACT_INFO.operatingHours,
      };
    }
    return DEFAULT_CONTACT_INFO;
  } catch {
    return DEFAULT_CONTACT_INFO;
  }
};

// The portal API validates the message and emails it to the support inbox; this app never sends mail itself.
export const sendContactUsMessage = async (
  data: ContactMessageDto
): Promise<{ success: boolean; message: string }> => {
  const res = await fetch(`${apiBaseUrl}/contact`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      name: data.name.trim(),
      email: data.email.trim(),
      message: data.message.trim(),
    }),
  });

  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    return {
      success: true,
      message:
        body.message ||
        "Thank you for reaching out. Our team has received your inquiry and will respond within 1 business day.",
    };
  }

  if (res.status === 429) {
    throw new Error(
      "Too many contact requests from your network. Please try again in a few minutes or email us directly."
    );
  }

  if (res.status === 503) {
    throw new Error(
      "Contact messages are temporarily unavailable right now. Please reach out to us directly at our email."
    );
  }

  throw new Error(body.message || "Failed to submit contact inquiry.");
};
