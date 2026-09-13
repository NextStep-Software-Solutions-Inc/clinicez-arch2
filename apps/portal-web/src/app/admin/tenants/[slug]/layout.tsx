import { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const slug = resolvedParams.slug;
  return {
    title: `Workspace Settings (${slug})`,
    description: `Audit general settings, verify subscription status levels, and telemetry usage metrics for Clinic EZ workspace.`
  };
}

export default function TenantDetailLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
