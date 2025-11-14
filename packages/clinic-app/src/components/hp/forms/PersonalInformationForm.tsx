import { useForm } from "react-hook-form";
import { ScrollView, View } from "react-native";
import { PersonalInformationInput, personalInformationSchema } from "@schemas/healthcare-provider.schema";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormField, FormInput, FormItem, FormLabel, FormMessage } from "@components/form";
import PhoneInput from "@components/PhoneInput";
import React from "react";
import { defaultCountry } from "@lib/country-codes";
import ThemedPicker from "@components/ThemedPicker";
import { Genders, CivilStatuses, BloodTypes } from "@constants/form-options";
import DatePicker from "@components/DatePicker";

export default function PersonalInformationForm() {
  const [countryCode, setCountryCode] = React.useState(defaultCountry.code);

  const form = useForm<PersonalInformationInput>({
    defaultValues: {
      firstName: "",
      middleName: "",
      lastName: "",
      suffix: "",
      nickname: "",
      email: "",
      phoneNumber: "",
      gender: undefined,
      civilStatus: undefined,
      religion: "",
      nationality: "",
      bloodType: "",
      dateOfBirth: undefined,
    },
    resolver: zodResolver(personalInformationSchema),
  });

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ maxHeight: 500 }}
    >
      <View className="px-6 py-8">
        <Form {...form}>
          <View className="gap-3">
            <FormField
              name="firstName"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>First Name</FormLabel>
                  <FormInput
                    onChangeText={onChange}
                    onBlur={onBlur}
                    value={value}
                    placeholder="Enter your first name"
                    variant={"outlined"}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              name="middleName"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Middle Name</FormLabel>
                  <FormInput
                    onChangeText={onChange}
                    onBlur={onBlur}
                    value={value}
                    placeholder="Enter your middle name"
                    variant={"outlined"}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              name="lastName"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>Last Name</FormLabel>
                  <FormInput
                    onChangeText={onChange}
                    onBlur={onBlur}
                    value={value}
                    placeholder="Enter your last name"
                    variant={"outlined"}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              name="suffix"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Suffix</FormLabel>
                  <FormInput
                    onChangeText={onChange}
                    onBlur={onBlur}
                    value={value}
                    placeholder="Enter your suffix"
                    variant={"outlined"}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              name="nickname"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Nickname</FormLabel>
                  <FormInput
                    onChangeText={onChange}
                    onBlur={onBlur}
                    value={value}
                    placeholder="How should we call you?"
                    variant={"outlined"}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              name="phoneNumber"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>Phone Number</FormLabel>
                  <PhoneInput
                    value={value || ""}
                    countryCode={countryCode}
                    onCountryChange={(country) => setCountryCode(country.code)}
                    onChangeText={(phone) => {
                      onChange(phone);
                    }}
                    onBlur={() => {
                      onBlur();
                    }}
                    variant="outlined"
                    size="md"
                    state={form.formState.errors.phoneNumber ? "error" : "default"}
                    autoFormat={true}
                    placeholder="Enter phone number"
                  />
                </FormItem>
              )}
            />

            <FormField
              name="email"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel required>Email Address</FormLabel>
                  <FormInput
                    onChangeText={onChange}
                    onBlur={onBlur}
                    value={value}
                    placeholder="Enter your email address"
                    variant={"outlined"}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gender"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <ThemedPicker
                    items={Genders.map((gender) => ({ label: gender, value: gender }))}
                    placeholder="Select gender"
                    selectedValue={value}
                    onValueChange={onChange}
                    variant="outlined"
                    size="md"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="civilStatus"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel>Civil Status</FormLabel>
                  <ThemedPicker
                    items={CivilStatuses.map((status) => ({ label: status, value: status }))}
                    placeholder="Select civil status"
                    selectedValue={value}
                    onValueChange={onChange}
                    variant="outlined"
                    size="md"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="religion"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Religion</FormLabel>
                  <FormInput
                    placeholder="Enter religion"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    variant="outlined"
                    size="md"
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="nationality"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Nationality</FormLabel>
                  <FormInput
                    placeholder="Enter nationality"
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    variant="outlined"
                    size="md"
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bloodType"
              render={({ field: { onChange, onBlur, value } }) => (
                <FormItem>
                  <FormLabel>Blood Type</FormLabel>
                  <ThemedPicker
                    items={BloodTypes.map((type) => ({ label: type, value: type }))}
                    placeholder="Select blood type"
                    selectedValue={value}
                    onValueChange={onChange}
                    variant="outlined"
                    size="md"
                  />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="dateOfBirth"
              render={({ field: { onChange, value } }) => (
                <FormItem>
                  <FormLabel>Date of Birth</FormLabel>
                  <DatePicker
                    value={value}
                    onChange={onChange}
                    placeholder="Select birthdate"
                    variant="outlined"
                    size="md"
                    maximumDate={new Date()}
                  />
                </FormItem>
              )}
            />
          </View>
        </Form>
      </View>
    </ScrollView>
  );
}


// <Form {...form}>
//   <View className="gap-3">
//     <FormField
//       name="firstName"
//       control={form.control}
//       render={({ field: { onChange, onBlur, value } }) => (
//         <FormItem>
//           <FormLabel>First Name</FormLabel>
//           <FormInput
//             onChangeText={onChange}
//             onBlur={onBlur}
//             value={value}
//             placeholder="Enter your first name"
//             variant={"outlined"}
//             autoCapitalize="words"
//             returnKeyType="next"
//           />
//         </FormItem>
//       )}
//     />

//     <FormField
//       name="middleName"
//       control={form.control}
//       render={({ field: { onChange, onBlur, value } }) => (
//         <FormItem>
//           <FormLabel>Middle Name</FormLabel>
//           <FormInput
//             onChangeText={onChange}
//             onBlur={onBlur}
//             value={value}
//             placeholder="Enter your middle name"
//             variant={"outlined"}
//             autoCapitalize="words"
//             returnKeyType="next"
//           />
//         </FormItem>
//       )}
//     />

//     <FormField
//       name="lastName"
//       control={form.control}
//       render={({ field: { onChange, onBlur, value } }) => (
//         <FormItem>
//           <FormLabel>Last Name</FormLabel>
//           <FormInput
//             onChangeText={onChange}
//             onBlur={onBlur}
//             value={value}
//             placeholder="Enter your last name"
//             variant={"outlined"}
//             autoCapitalize="words"
//             returnKeyType="next"
//           />
//         </FormItem>
//       )}
//     />

//     <FormField
//       name="suffix"
//       control={form.control}
//       render={({ field: { onChange, onBlur, value } }) => (
//         <FormItem>
//           <FormLabel>Suffix</FormLabel>
//           <FormInput
//             onChangeText={onChange}
//             onBlur={onBlur}
//             value={value}
//             placeholder="Enter your suffix"
//             variant={"outlined"}
//             autoCapitalize="words"
//             returnKeyType="next"
//           />
//         </FormItem>
//       )}
//     />

//     <FormField
//       name="nickname"
//       control={form.control}
//       render={({ field: { onChange, onBlur, value } }) => (
//         <FormItem>
//           <FormLabel>Nickname</FormLabel>
//           <FormInput
//             onChangeText={onChange}
//             onBlur={onBlur}
//             value={value}
//             placeholder="How should we call you?"
//             variant={"outlined"}
//             autoCapitalize="words"
//             returnKeyType="next"
//           />
//         </FormItem>
//       )}
//     />
//   </View>
// </Form>
