import { View, ViewProps } from "react-native";
import {
  Controller,
  FieldPath,
  FieldValues,
  FieldError,
  FormProvider,
  ControllerProps,
  useFormContext as useRHFFormContext
} from "react-hook-form";
import { cn } from "@lib/utils";
import ThemedText from "@components/ThemedText";
import { ThemedInput, ThemedInputProps } from "@components/ThemedInput";
import React from "react";

const Form = FormProvider;

type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>
> = {
  name: TName;
};

const FormFieldContext = React.createContext<FormFieldContextValue | null>(
  null
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
  );
};

type FormItemContextValue = {
  id: string;
};

const FormItemContext = React.createContext<FormItemContextValue | null>(
  null
);

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);

  // Get form context, but don't throw if it's not available
  // This allows FormMessage to work in legacy patterns
  let formContext;
  try {
    formContext = useRHFFormContext();
  } catch {
    formContext = null;
  }

  const fieldState = formContext && fieldContext?.name
    ? formContext.getFieldState(fieldContext.name, formContext.formState)
    : { error: undefined, isDirty: false, isTouched: false, invalid: false };

  if (!fieldContext) {
    // Return minimal context for legacy usage
    return {
      id: itemContext?.id ?? "",
      name: "",
      formItemId: `${itemContext?.id ?? ""}-form-item`,
      formDescriptionId: `${itemContext?.id ?? ""}-form-item-description`,
      formMessageId: `${itemContext?.id ?? ""}-form-item-message`,
      ...fieldState,
    };
  }

  const { id } = itemContext ?? { id: "" };

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

// interface FormContextValue<T extends FieldValues = FieldValues> {
//   control: Control<T>;
// }

// const FormContext = createContext<FormContextValue | null>(null);

// interface FormProps<T extends FieldValues = FieldValues> extends ViewProps {
//   control: Control<T>;
//   children: React.ReactNode;
// }

// export const Form = <T extends FieldValues = FieldValues>({
//   control,
//   children,
//   className,
//   ...props
// }: FormProps<T>) => {
//   return (
//     <FormContext.Provider value={{ control: control as Control<FieldValues> }}>
//       <View className={cn("gap-4", className)} {...props}>
//         {children}
//       </View>
//     </FormContext.Provider>
//   );
// };

// const useFormContext = () => {
//   const context = useContext(FormContext);
//   if (!context) {
//     throw new Error("Form components must be used within a Form provider");
//   }
//   return context;
// };

// interface FormFieldProps<T extends FieldValues> {
//   name: FieldPath<T>;
//   children: (props: {
//     field: {
//       value: T[FieldPath<T>];
//       onChange: (value: T[FieldPath<T>]) => void;
//       onBlur: () => void;
//     };
//     fieldState: {
//       error?: FieldError;
//     };
//     formState: {
//       isSubmitting: boolean;
//     };
//   }) => React.ReactNode;
//   control?: Control<T>;
// }

// export const FormField = <T extends FieldValues>({
//   name,
//   children,
//   control: externalControl,
// }: FormFieldProps<T>) => {
//   const { control: contextControl } = useFormContext();
//   const control = (externalControl || contextControl) as Control<T>;

//   return (
//     <Controller
//       control={control}
//       name={name}
//       render={({ field, fieldState, formState }) =>
//         children({ field, fieldState, formState }) as React.ReactElement
//       }
//     />
//   );
// };

interface FormItemProps extends ViewProps {
  children: React.ReactNode;
}

const FormItem = React.forwardRef<View, FormItemProps>(
  ({ children, className, ...props }, ref) => {
    const id = React.useId();

    return (
      <FormItemContext.Provider value={{ id }}>
        <View ref={ref} className={cn("gap-2", className)} {...props}>
          {children}
        </View>
      </FormItemContext.Provider>
    );
  }
);

FormItem.displayName = "FormItem";



interface FormLabelProps {
  children: React.ReactNode;
  required?: boolean;
  error?: boolean;
  className?: string;
}

const FormLabel = React.forwardRef<View, FormLabelProps>(
  ({ children, required = false, error = false, className }, ref) => {
    return (
      <ThemedText
        variant="label"
        className={cn(
          "font-medium mb-2",
          error
            ? "text-error dark:text-error"
            : "text-muted dark:text-primary",
          className
        )}
      >
        {children}
        {required && <ThemedText className="text-error ml-1"> *</ThemedText>}
      </ThemedText>
    );
  }
);

FormLabel.displayName = "FormLabel";

interface FormInputProps extends Omit<ThemedInputProps, 'state'> {
  error?: boolean;
  onValueChange?: (value: string) => void;
}

const FormInput = React.forwardRef<View, FormInputProps>(
  ({ error = false, onValueChange, onChangeText, variant, className, ...props }, ref) => {
    const handleChange = (text: string) => {
      onChangeText?.(text);
      onValueChange?.(text);
    };

    return (
      <ThemedInput
        state={error ? "error" : "default"}
        className={className}
        variant={variant}
        onChangeText={handleChange}
        {...props}
      />
    );
  }
);

FormInput.displayName = "FormInput";

interface FormMessageProps {
  children?: React.ReactNode;
  className?: string;
}

const FormMessage = React.forwardRef<View, FormMessageProps>(
  ({ children, className }, ref) => {
    // Try to get form field context, but support legacy usage
    let error;
    let formMessageId;

    try {
      const fieldData = useFormField();
      error = fieldData.error;
      formMessageId = fieldData.formMessageId;
    } catch {
      // Legacy usage without FormField context
      error = undefined;
      formMessageId = undefined;
    }

    // Prioritize error from context, fall back to children
    const body = error ? String(error?.message) : children;

    if (!body) {
      return null;
    }

    return (
      <ThemedText
        nativeID={formMessageId}
        variant="caption"
        className={cn("text-red-600 dark:text-red-400 mt-1", className)}
      >
        {body}
      </ThemedText>
    );
  }
);

FormMessage.displayName = "FormMessage";

interface FormDescriptionProps {
  children: React.ReactNode;
  className?: string;
}

const FormDescription = React.forwardRef<View, FormDescriptionProps>(
  ({ children, className }, ref) => {
    const { formDescriptionId } = useFormField();

    return (
      <ThemedText
        nativeID={formDescriptionId}
        variant="caption"
        className={cn("text-muted dark:text-muted-dark", className)}
      >
        {children}
      </ThemedText>
    );
  }
);

FormDescription.displayName = "FormDescription";

export {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormInput,
  FormMessage,
  FormDescription,
  useFormField,
};