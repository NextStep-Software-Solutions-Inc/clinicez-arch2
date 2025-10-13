import { Redirect } from "expo-router";

const TabsIndex = () => {
  return <Redirect href="/(main)/(tabs)/dashboard" />;
};

TabsIndex.displayName = "TabsIndex";

export default TabsIndex;
