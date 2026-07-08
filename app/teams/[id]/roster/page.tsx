import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/get-session";
import RosterPanel from "@/app/components/roster-panel";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, team] = await Promise.all([
    getSession(),
    prisma.team.findUnique({ where: { id } }),
  ]);

  const isOwner = !!session && !!team && session.user.id === team.ownerId;

  return <RosterPanel isOwner={isOwner} />;
}
