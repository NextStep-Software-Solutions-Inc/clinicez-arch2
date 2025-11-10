import { DialogDescription } from "@components/Dialog";
import { Form, FormField, FormInput, FormItem, FormLabel } from "@components/form";
import ThemedButton from "@components/ThemedButton";
import ThemedText from "@components/ThemedText";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@components/ui/Dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react-native";
import { useForm } from "react-hook-form";
import z from "zod";

const addPatientSchema = z.object({
  firstName: z.string({
    error: "First name is required",
  }).min(2, "First name must be at least 2 characters"),
})

export function AddPatientDialog() {

  const form = useForm({
    defaultValues: {
      firstName: "",
    },
    resolver: zodResolver(addPatientSchema),
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <ThemedButton leftIcon={"plus"} className="flex-1">
          Add Patient
        </ThemedButton>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
          <DialogDescription>Please fill out the form below to add a new patient.</DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First Name</FormLabel>
                <FormInput placeholder="Enter first name" {...field} />
              </FormItem>
            )}
          />
        </Form>

        <DialogFooter>
          <DialogClose asChild>
            <ThemedButton variant="outline">
              Cancel
            </ThemedButton>
          </DialogClose>
          <ThemedButton>
            Save
          </ThemedButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
