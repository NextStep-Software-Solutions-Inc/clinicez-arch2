import { Keyboard, Pressable, View, ViewProps } from "react-native";

function DismissKeyboard<P extends { style?: ViewProps["style"] }>(Component: React.ComponentType<P>) {
  function WrappedComponent({ children, ...props }: P & { children?: React.ReactNode }) {
    return (
      <Pressable onPress={() => Keyboard.dismiss()} accessible={false} style={{ flex: 1 }}>
        <Component {...(props as P)} style={[props.style, { flex: 1 }]}>
          {children}
        </Component>
      </Pressable>
    )
  }

  WrappedComponent.displayName = `DismissKeyboard(${Component.displayName || Component.name || "Component"})`;
  return WrappedComponent;
}

const DismissKeyboardView = DismissKeyboard<ViewProps>(View);

export default DismissKeyboardView;