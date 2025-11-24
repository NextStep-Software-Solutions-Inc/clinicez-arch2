import { useRouter } from "expo-router";
import { Eye, EyeOff, Heart, Search } from "lucide-react-native";
import React from "react";
import { ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Badge from "../components/ui/badge";
import Button from "../components/ui/button";
import Checkbox, { CheckboxGroupItem } from "../components/ui/checkbox";
import Chip from "../components/ui/chip";
import { Input, InputIcon } from "../components/ui/input";
import Progress from "../components/ui/progress";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import Separator from "../components/ui/separator";
import Switch from "../components/ui/switch";
import Textarea from "../components/ui/textarea";
import theme from "../constants/theme";

const preferences: CheckboxGroupItem[] = [
  { label: "Receive Newsletters", value: "newsletters" },
  { label: "Enable Notifications", value: "notifications" },
  { label: "Personalized Ads", value: "ads" },
];

export default function Index() {
  const router = useRouter();
  const [isChecked, setIsChecked] = React.useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = React.useState(false);
  const [progressStep, setProgressStep] = React.useState(1);
  const [selectedPreferences, setSelectedPreferences] = React.useState<string[]>([]);
  console.log("Selected Preferences: ", selectedPreferences);
  return (
    <ScrollView>
      <SafeAreaView style={{ flex: 1, padding: 16 }}>
        <Button
          label="Complete Registration"
          onPress={() => router.push("/(main)/complete-registration")}
        />
        <Separator />
        <Checkbox value={isChecked} onValueChange={setIsChecked} label="Accept Terms and Conditions" />
        <Checkbox value={!isChecked} onValueChange={setIsChecked} label="Accept Terms and Conditions" disabled />
        <Button label="Submit" onPress={() => console.log("Button Pressed")} />
        <Button label="Loading Button" loading onPress={() => { }} />
        <Button label="Disabled Button" disabled onPress={() => { }} />
        <Input placeholder="Enter text here" />
        <Input enterKeyHint="search" placeholder="Search..." style={{ borderRadius: 50 }} Left={<InputIcon Icon={Search} color={theme.muted} />} />
        <Input placeholder="Disabled Input" disabled />
        <Input placeholder="Enter password" secureTextEntry={!isPasswordVisible} Right={<InputIcon Icon={!isPasswordVisible ? EyeOff : Eye} onPress={() => setIsPasswordVisible(!isPasswordVisible)} color={theme.muted} />} />
        <Textarea placeholder="Enter more text here" />
        <Textarea placeholder="Disabled Textarea" disabled />
        <Badge label="8" />
        <Separator />
        {/* <Separator orientation="vertical" /> */}
        <RadioGroup direction="horizontal" defaultValue="option1" onValueChange={(value) => console.log("Selected:", value)} accessibilityLabel="Example Radio Group" accessibilityHint="Select one of the options">
          <RadioGroupItem value="option1" label="Option 1" />
          <RadioGroupItem value="option2" label="Option 2" />
          <RadioGroupItem value="option3" label="Option 3" disabled />
        </RadioGroup>
        <RadioGroup defaultValue="option1" onValueChange={(value) => console.log("Selected:", value)} accessibilityLabel="Example Radio Group" accessibilityHint="Select one of the options">
          <RadioGroupItem value="option1" label="Option 1" />
          <RadioGroupItem value="option2" label="Option 2" />
          <RadioGroupItem value="option3" label="Option 3" disabled />
        </RadioGroup>
        <Switch value={isChecked} onValueChange={setIsChecked} />
        <Progress step={progressStep} steps={10} showProgressText />
        <Button label="Increase" onPress={() => setProgressStep((prev) => Math.min(prev + 1, 10))} />
        <Button label="Decrease" onPress={() => setProgressStep((prev) => Math.max(prev - 1, 1))} />
        <Checkbox.Icon Icon={Heart} onValueChange={setIsChecked} value={isChecked} />
        <Checkbox.Group items={preferences} selectedValues={selectedPreferences} onValueChange={setSelectedPreferences} />
        <Chip label="Example Chip" value={isChecked} onValueChange={setIsChecked} Left={Heart} />
        <Chip.Group items={preferences} selectedValues={selectedPreferences} onValueChange={setSelectedPreferences} />
      </SafeAreaView>
    </ScrollView>
  );
}
