import RootFooter from "@/components/RootFooter";
import RootHeader from "@/components/RootHeader";

export default function RootLayoutV2({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="relative min-h-screen">
      <RootHeader className="fixed top-0 left-0 right-0 z-50" />
      <div className="min-h-screen">
        {children}
      </div>
      <RootFooter />
    </div>
  );
}