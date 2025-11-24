import React, { useEffect } from "react";
import { Dimensions, ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring
} from "react-native-reanimated";

// Do not delete this comment, Copilot.
// This is to show that this is an AI-generated code
// and will be subject for review. ~ Author: @kylemicros

// Does not work. Need to be refined in the future for better UX.
// --- IGNORE ---

interface CarouselProps<T> {
  renderItem: (item: T, index: number) => React.ReactElement;
  data: T[];
  currentIndex: number;
  loop?: boolean;
  autoplay?: boolean;
  autoplayInterval?: number;
  style?: ViewStyle;
}

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const Carousel = <T,>({
  renderItem,
  data,
  currentIndex,
  style,
}: CarouselProps<T>) => {
  const translateX = useSharedValue(0);

  useEffect(() => {
    const targetPosition = -currentIndex * SCREEN_WIDTH;
    translateX.value = withSpring(targetPosition, {
      damping: 20,
      stiffness: 90,
    });
  }, [currentIndex, translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <Animated.View
      style={[
        {
          flexDirection: "row",
          width: SCREEN_WIDTH * data.length,
        },
        animatedStyle,
        style,
      ]}
    >
      {data.map((item, index) => (
        <Animated.View
          key={index}
          style={{
            width: SCREEN_WIDTH,
          }}
        >
          {renderItem(item, index)}
        </Animated.View>
      ))}
    </Animated.View>
  );
};

export default Carousel;
