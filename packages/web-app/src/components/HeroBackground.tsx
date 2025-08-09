import { StaticImageData } from "next/image"

interface HeroBackgroundProps {
  path: StaticImageData | string
  opacity?: number
}

export default function HeroBackground({ path, opacity = 0.3 }: HeroBackgroundProps) {
  return (
    <div
      className="fixed top-0 left-0 w-full h-screen bg-no-repeat bg-cover bg-center z-[-1]"
      style={{
        backgroundImage: `url(${typeof path === "string" ? path : path.src})`,
        opacity: opacity,
      }}
    />
  )
}