"use client";

import { useEffect } from "react";

interface HeaderEffectsProps {
  headerId: string;
}

export default function HeaderEffects({ headerId }: HeaderEffectsProps) {
  useEffect(() => {
    const header = document.getElementById(headerId);
    if (!header) return;

    const blurClasses = "bg-[#FCF8F1]/30 backdrop-blur";

    const apply = () => {
      const scrolled = window.scrollY > 0;
      if (scrolled) {
        header.classList.add(...blurClasses.split(" "));
      } else {
        header.classList.remove(...blurClasses.split(" "));
      }
    };

    apply();
    window.addEventListener("scroll", apply);
    return () => window.removeEventListener("scroll", apply);
  }, [headerId]);

  return null;
}