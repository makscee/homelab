import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export function ComingSoon({ page, phase }: { page: string; phase: string }) {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{page}</CardTitle>
        <CardDescription>Coming in {phase}.</CardDescription>
      </CardHeader>
    </Card>
  );
}
