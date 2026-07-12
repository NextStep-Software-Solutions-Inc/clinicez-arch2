"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./ui/button";
import { LoaderCircle } from "lucide-react";


interface ActionButtonProps extends React.ComponentPropsWithRef<typeof Button> {
  children: React.ReactNode;
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ children, ...props }, ref) => {
    const { pending } = useFormStatus();
    return (
      <Button
        ref={ref}
        {...props}
        disabled={pending || props.disabled}
      >
        {pending && <LoaderCircle className="animate-spin transition-all mr-2" />}
        {children}
      </Button>
    );
  }
);

ActionButton.displayName = "ActionButton";

export default ActionButton;
