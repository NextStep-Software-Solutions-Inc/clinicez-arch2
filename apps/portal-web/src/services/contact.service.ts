import { apiClient } from "@/transport/apiClient";

export interface ContactMessageDto {
  name: string;
  email: string;
  message: string;
}

// The portal API validates the message and emails it to the support inbox; this app never sends mail itself.
export const sendContactUsMessage = async (data: ContactMessageDto): Promise<void> => {
  await apiClient.post("/contact", data);
};
