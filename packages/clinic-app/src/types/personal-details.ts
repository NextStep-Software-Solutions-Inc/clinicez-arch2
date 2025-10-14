export type CivilStatus = "single" | "married" | "divorced" | "widowed" | "separated";

export type Gender = "male" | "female" | "other";

export type BloodType =
  | "a_positive"
  | "a_negative"
  | "b_positive"
  | "b_negative"
  | "o_positive"
  | "o_negative"
  | "ab_positive"
  | "ab_negative";

export type ContactInfo = {
  email: string;
  mobile: string;
}

export type Profile = {
  imageUrl?: string;
}

export type PersonalDetails = {
  id: number;
  userUid: string;
  profile: Profile;
  name: {
    firstName: string;
    middleName?: string;
    lastName: string;
    suffix?: string;
  };
  civilStatus: CivilStatus;
  gender: Gender;
  dateOfBirth: string; // ISO date string
  nationality: string;
  religion: string;
  bloodType: BloodType;
  contactInfo: ContactInfo;
}

export const GenderLabels: Record<Gender, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

export const CivilStatusLabels: Record<CivilStatus, string> = {
  single: "Single",
  married: "Married",
  divorced: "Divorced",
  widowed: "Widowed",
  separated: "Separated",
};

export const BloodTypeLabels: Record<BloodType, string> = {
  a_positive: "A+",
  a_negative: "A-",
  b_positive: "B+",
  b_negative: "B-",
  o_positive: "O+",
  o_negative: "O-",
  ab_positive: "AB+",
  ab_negative: "AB-",
};