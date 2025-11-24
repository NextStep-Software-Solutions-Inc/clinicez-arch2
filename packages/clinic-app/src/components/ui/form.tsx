import { FontSize } from "@app-constants/styles";
import theme from "@app-constants/theme";
import React from "react";
import {
  Controller,
  ControllerProps,
  FieldPath,
  FieldValues,
  FormProvider,
  useFormContext,
  useFormState
} from "react-hook-form";
import { Text, View } from "react-native";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName
}

const FormFieldContext = React.createContext<FormFieldContextValue>(
  {} as FormFieldContextValue
);

const FormField = <
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
>({
  ...props
}: ControllerProps<TFieldValues, TName>) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  )
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState } = useFormContext();

  if (!fieldContext) {
    throw new Error("useFormField must be used within a FormField");
  }

  const formState = useFormState({ name: fieldContext.name });
  const fieldState = getFieldState(fieldContext.name, formState);

  const id = itemContext.id;

  return {
    id,
    name: fieldContext.name,
    formItemId: `form-item-${id}`,
    formDescriptionId: `form-item-${id}-description`,
    formMessageId: `form-item-${id}-message`,
    ...fieldState,
  };

};
type FormItemContextValue = {
  id: string;
}

const FormItemContext = React.createContext<FormItemContextValue>(
  {} as FormItemContextValue
);

const FormItem = ({
  style,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof View>) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <View
        style={[{ marginVertical: 8 }, style]}
        ref={ref}
        {...props}
      />
    </FormItemContext.Provider>
  );
};


const FormLabel = ({
  style,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof Text>) => {
  const { error, formItemId } = useFormField();

  return (
    <Text style={[
      { fontSize: FontSize.sm, fontWeight: "500", marginBottom: 4 },
      error && { color: theme.error.default },
      style
    ]} ref={ref}
      nativeID={formItemId}
      {...props}
    />
  );
};

const FormControl = ({
  ...props
}) => {
  const { formItemId } = useFormField();

  return (
    <View
      accessibilityLabelledBy={formItemId}
      {...props}
    />
  );
}

const FormMessage = ({
  style,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof Text>) => {
  const { error, formMessageId } = useFormField();

  if (!error?.message) {
    return null;
  }

  return (
    <Text
      style={[
        { color: theme.error.default, marginTop: 4, fontSize: FontSize.sm },
        style
      ]}
      ref={ref}
      nativeID={formMessageId}
      {...props}
    >
      {error.message}
    </Text>
  );
};

const FormDescription = ({
  style,
  ref,
  ...props
}: React.ComponentPropsWithRef<typeof Text>) => {
  const { formDescriptionId } = useFormField();

  return (
    <Text
      style={[
        { color: theme.muted, marginTop: 4 },
        style
      ]}
      ref={ref}
      nativeID={formDescriptionId}
      {...props}
    />
  );
};

export { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, useFormField };

