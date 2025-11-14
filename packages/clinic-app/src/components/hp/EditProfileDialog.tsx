import ThemedButton from "@components/ThemedButton";
import ThemedIcon from "@components/ThemedIcon";
import ThemedText from "@components/ThemedText";
import Avatar from "@components/ui/Avatar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@components/ui/Dialog";
import Item, { ItemProps } from "@components/ui/Item";
import { Animated, FlatList, Pressable, View } from "react-native";
import { useState, useRef, useEffect } from "react";
import PersonalInformationForm from "./forms/PersonalInformationForm";
import CredentialsEducationForm from "./forms/CredentialsEducationForm";
import AboutForm from "./forms/AboutForm";
import SpecializationForm from "./forms/SpecializationForm";
import LicenseInformationForm from "./forms/LicenseInformationForm";
import ContactDetailsForm from "./forms/ContactDetailsForm";

const editItems: ItemProps[] = [
  { id: "personal-information", title: "Personal Information" },
  { id: "credentials-education", title: "Credentials & Education" },
  { id: "about", title: "About" },
  { id: "specialization", title: "Specialization" },
  { id: "license-information", title: "License Information" },
  { id: "contact-details", title: "Contact Details" }
];


const formComponents: Record<string, React.ComponentType> = {
  "personal-information": PersonalInformationForm,
  "credentials-education": CredentialsEducationForm,
  "about": AboutForm,
  "specialization": SpecializationForm,
  "license-information": LicenseInformationForm,
  "contact-details": ContactDetailsForm,
};

export default function EditProfileDialog() {
  const [selectedForm, setSelectedForm] = useState<string | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: selectedForm ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [selectedForm]);

  const handleItemPress = (formId: string) => {
    slideAnim.setValue(0);
    setSelectedForm(formId);
  };

  const handleBack = () => {
    slideAnim.setValue(0);
    setSelectedForm(null);
  };

  const handleDialogChange = (isOpen: boolean) => {
    if (!isOpen) {
      setSelectedForm(null);
    }
  };

  const getFormTitle = () => {
    const item = editItems.find(item => item.id === selectedForm);
    return item?.title || "";
  };

  const renderForm = () => {
    if (!selectedForm) return null;
    const FormComponent = formComponents[selectedForm];
    return FormComponent ? <FormComponent /> : null;
  };

  return (
    <Dialog onOpenChange={handleDialogChange}>
      <DialogTrigger asChild>
        <ThemedButton
          size="sm"
          leftIcon={<ThemedIcon icon="edit" size={16} color={"base"} />}
        >
          <ThemedText variant="button" className="text-white dark:text-base-dark">Edit Profile</ThemedText>
        </ThemedButton>
      </DialogTrigger>
      <DialogContent style={{ overflow: 'hidden' }}>
        {!selectedForm ? (
          <>
            <DialogHeader>
              <DialogTitle>Edit Profile</DialogTitle>
            </DialogHeader>

            <View className="px-6 pb-8">
              <View className="items-center mb-4">
                <View className="flex-col justify-center items-center gap-3">
                  <Avatar />
                  <ThemedButton variant="ghost" size="sm">
                    <ThemedText variant="description" className="text-primary dark:text-primary-dark">Change</ThemedText>
                  </ThemedButton>
                </View>
              </View>
              <FlatList
                data={editItems}
                renderItem={({ item }) => (
                  <Item
                    title={item.title}
                    onPress={() => handleItemPress(item.id!)}
                  />
                )}
                keyExtractor={(item) => item.id!}
                ItemSeparatorComponent={() => <View className="h-4" />}
                contentContainerStyle={{ paddingBottom: 8 }}
              />
            </View>

            <DialogFooter className="justify-between">
              <ThemedButton variant="outline" size="lg">
                <ThemedText variant="button">Cancel</ThemedText>
              </ThemedButton>
              <ThemedButton size="lg">
                <ThemedText variant="button" className="text-white">Save</ThemedText>
              </ThemedButton>
            </DialogFooter>
          </>
        ) : (
          <Animated.View
            style={{
              opacity: slideAnim,
              transform: [
                {
                  translateX: slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [20, 0],
                  }),
                },
              ],
            }}
          >
            <DialogHeader className="flex-row items-center gap-3 border-b border-border dark:border-border-dark">
              <Pressable onPress={handleBack} hitSlop={8}>
                <ThemedIcon icon="chevron-left" size={24} color="text" />
              </Pressable>
              <DialogTitle>{getFormTitle()}</DialogTitle>
            </DialogHeader>

            {renderForm()}

            <DialogFooter className="justify-between">
              <ThemedButton variant="outline" size="lg" onPress={handleBack}>
                <ThemedText variant="button">Cancel</ThemedText>
              </ThemedButton>
              <ThemedButton size="lg">
                <ThemedText variant="button" className="text-white">Save</ThemedText>
              </ThemedButton>
            </DialogFooter>
          </Animated.View>
        )}
      </DialogContent>
    </Dialog>
  );
}
