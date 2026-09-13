import SolutionList from "@/components/SolutionList";
import HeroBackground from "@/components/HeroBackground";
import MainBackgroundImage from "@/../public/assets/main-background.png";

export default function SolutionPage() {
    return (
        <main className="relative min-h-[70vh] flex flex-col items-center justify-start py-16 px-4 overflow-hidden">
            <HeroBackground path={MainBackgroundImage} opacity={0.3} />
            <section className="w-full">
                <div className="max-w-2xl w-full mx-auto text-center my-12">
                    <h1 className="text-4xl md:text-5xl font-medium tracking-tight text-primary mt-16 drop-shadow-sm">Clinic EZ Solutions</h1>
                    <p className="text-lg md:text-xl text-gray-600 my-4">Modern modules for every clinic workflow. Designed for speed, security, and simplicity.</p>
                    <div className="flex justify-center gap-4 mb-2">
                        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">OPD</span>
                        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Pharmacy</span>
                        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Accounting</span>
                        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Bed</span>
                        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Laboratory</span>
                        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Prescription</span>
                        <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">Medcert</span>
                    </div>
                </div>
                <div className="w-full max-w-5xl mx-auto">
                    <SolutionList />
                </div>
            </section>
        </main>
    );
}
