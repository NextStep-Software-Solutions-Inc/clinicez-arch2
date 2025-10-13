/**
 * This component will act as a better approach than using `.map` directly in JSX.
 * It will help in optimizing re-renders and improve readability.
 */

import React from "react";
import { View } from "react-native";
import ThemedText from "./ThemedText";

interface EachProps<T> {
  items: T[];
  render: (item: T, index: number) => React.ReactNode;
  fallback?: React.ReactNode;
}

const Each = <T,>({ items, render, fallback = <Fallback /> }: EachProps<T>) => {
  return (
    <>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {render(item, index)}
        </React.Fragment>
      ))}
    </>
  );
};
Each.displayName = "Each";

const Fallback = () => {
  return (
    <ThemedText className="text-center text-muted dark:text-muted-dark">
      No items to display.
    </ThemedText>
  );
}

export default Each;