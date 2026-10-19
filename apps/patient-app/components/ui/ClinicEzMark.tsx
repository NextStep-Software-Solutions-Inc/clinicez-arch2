import React from 'react';
import Svg, { Path, Rect } from 'react-native-svg';
import { lightColors, darkColors } from '@clinicez/design-tokens';

const PRISM_PATH =
  'm297.42,102.89L154.27,10.61c-41.58-26.8-96.78-.05-101.5,49.2l-14.92,155.7c-4.72,49.25,44.4,86,90.31,67.58l158.07-63.42c49.74-19.96,56.23-87.73,11.19-116.77Z';
const E_PATH =
  'm86.16,150.56c1.13,22.55,18.28,33.42,38.83,32.79,15.06-.46,23.7-3.29,31.27-6.55l3.79,13.26c-6.55,3.04-18.41,7.46-36.95,8.03-33.02,1.01-54.18-19.14-55.09-48.98-.91-29.63,17.56-55.05,49.88-56.04,36.72-1.12,46.33,29.64,46.85,46.68.12,3.79-.05,6.55-.47,8.41l-78.11,2.39Zm60.15-15.41c-.12-8.61-4.74-29.53-29.44-28.77-21.27.65-29.55,18.26-30.87,30.62l60.31-1.85Z';
const Z_PATH =
  'm178.04,183.03l48.05-59.35c4.9-5.93,9.08-10.62,14.4-16.44v-.41s-60.63,1.86-60.63,1.86l-.46-15.01,84.12-2.58.21,11.65-47.45,58.77c-4.64,5.66-8.95,10.89-13.99,16.22v.41s64.89-1.99,64.89-1.99l.46,15.01-89.27,2.73-.33-10.88Z';

export interface ClinicEzMarkProps {
  size?: number;
  variant?: 'bare' | 'squircle' | 'inverted';
}

export default function ClinicEzMark({
  size = 36,
  variant = 'inverted',
}: ClinicEzMarkProps) {
  if (variant === 'squircle' || variant === 'inverted') {
    const isInverted = variant === 'inverted';
    const bgFill = isInverted ? lightColors.primarySubtle : lightColors.primary;
    const frontPrism = isInverted ? lightColors.primary : lightColors.onPrimary;
    const backPrism = darkColors.primary;
    const monogramFill = isInverted ? lightColors.onPrimary : lightColors.primary;
    const frontTransform = 'translate(26, 42) scale(0.92)';
    return (
      <Svg width={size} height={size} viewBox="0 0 380 380">
        <Rect width="380" height="380" rx="84" fill={bgFill} />
        <Path d={PRISM_PATH} fill={backPrism} transform="matrix(0.91496 0.096166 -0.096166 0.91496 66.75 47.34)" />
        <Path d={PRISM_PATH} fill={frontPrism} transform={frontTransform} />
        <Path d={E_PATH} fill={monogramFill} transform={frontTransform} />
        <Path d={Z_PATH} fill={monogramFill} transform={frontTransform} />
      </Svg>
    );
  }

  const bareBackTransform = 'matrix(0.995396 0.095846 -0.095846 0.995396 42.6342 7.3322)';
  const bareFrontTransform = 'translate(4, 6)';

  return (
    <Svg width={size} height={size} viewBox="0 0 360 320">
      <Path d={PRISM_PATH} fill={darkColors.primary} opacity={0.9} transform={bareBackTransform} />
      <Path d={PRISM_PATH} fill={lightColors.primary} transform={bareFrontTransform} />
      <Path d={E_PATH} fill={lightColors.onPrimary} transform={bareFrontTransform} />
      <Path d={Z_PATH} fill={lightColors.onPrimary} transform={bareFrontTransform} />
    </Svg>
  );
}
