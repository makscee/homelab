import { ComingSoon } from "@/components/common/coming-soon";

export default async function TerminalPage({
  params,
}: {
  params: Promise<{ vmid: string }>;
}) {
  const { vmid } = await params;
  return <ComingSoon page={`Web Terminal — VM ${vmid}`} phase="Phase 18" />;
}
