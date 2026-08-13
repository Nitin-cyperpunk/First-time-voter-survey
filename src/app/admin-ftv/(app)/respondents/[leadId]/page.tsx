import { ParticipantDetail } from "@/components/admin/participant-detail";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ leadId: string }>;
};

export default async function ParticipantDetailPage({ params }: PageProps) {
  const { leadId } = await params;

  return <ParticipantDetail leadId={leadId} />;
}
