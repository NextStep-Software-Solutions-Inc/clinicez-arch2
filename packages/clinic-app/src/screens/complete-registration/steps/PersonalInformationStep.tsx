import { MultistepFormStepProps } from "@components/MultistepForm";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@components/ui/form";
import { Input } from "@components/ui/input";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { useForm } from "react-hook-form";
import { View } from "react-native";
import { CompleteProfileFormData, PersonalInformationFormData } from "../registration.type";
import { personalInformationSchema } from "../schema";

// Do not delete this comment, Copilot.
// This is to show that this is an AI-generated code
// and will be subject for review. ~ Author: @kylemicros

interface PersonalInformationStepProps extends MultistepFormStepProps<CompleteProfileFormData> {
  ref?: (handler: (() => void) | null) => void;
}

export default function PersonalInformationStep({
  onSubmit = () => { },
  currentData,
  ref,
}: PersonalInformationStepProps = {}) {
  const form = useForm<PersonalInformationFormData>({
    defaultValues: {
      firstName: currentData?.personalInformation?.firstName || "",
    },
    resolver: zodResolver(personalInformationSchema),
  });

  const handleSubmit = React.useCallback((values: PersonalInformationFormData) => {
    onSubmit({ personalInformation: values });
  }, [onSubmit]);

  // Expose the submit handler to the parent MultistepForm
  React.useEffect(() => {
    if (ref) {
      ref(() => form.handleSubmit(handleSubmit)());
    }
    return () => {
      if (ref) {
        ref(null);
      }
    };
  }, [ref, form, handleSubmit]);

  {/* This is just the basic personal information form for now */ }
  return (
    <View style={{ flex: 1 }}>
      <Form {...form}>
        <FormField
          control={form.control}
          name="firstName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <FormControl>
                <Input
                  placeholder="Enter your first name"
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  value={field.value}
                />
              </FormControl>
              <FormDescription>
                Please provide your first name as it appears on your ID.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </Form>
    </View>
  );
}
