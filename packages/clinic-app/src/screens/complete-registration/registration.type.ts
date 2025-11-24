import { z } from "zod";
import {
  basicInformationSchema,
  clinicApplicationSchema,
  completeProfileSchema,
  personalInformationSchema
} from "./schema";

export type PersonalInformationFormData = z.infer<typeof personalInformationSchema>;
export type BasicInformationFormData = z.infer<typeof basicInformationSchema>;
export type ClinicApplicationFormData = z.infer<typeof clinicApplicationSchema>;
export type CompleteProfileFormData = z.infer<typeof completeProfileSchema>;