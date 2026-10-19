"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Rocket } from "lucide-react";

export function MobileAppStoreButtons() {
  return (
    <div className="flex flex-wrap gap-4 mt-auto">
      <Dialog>
        <DialogTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-full bg-background border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            App Store
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Rocket className="w-8 h-8 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold text-center">Launching Soon!</DialogTitle>
            <DialogDescription className="text-center text-lg mt-2">
              Our mobile application is currently undergoing final beta testing and will be available on the App Store very soon. Stay tuned!
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <button className="inline-flex items-center justify-center rounded-full bg-background border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted transition-colors">
            Google Play
          </button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <div className="mx-auto bg-primary/10 w-16 h-16 rounded-full flex items-center justify-center mb-4">
              <Rocket className="w-8 h-8 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold text-center">Launching Soon!</DialogTitle>
            <DialogDescription className="text-center text-lg mt-2">
              Our mobile application is currently undergoing final beta testing and will be available on Google Play very soon. Stay tuned!
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </div>
  );
}
