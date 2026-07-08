import { getSession } from "@/lib/get-session";
import LeagueDetailPanel from "@/app/components/league-detail-panel";

export default async function LeagueDetailPage() {
  const session = await getSession();

  return <LeagueDetailPanel isLoggedIn={!!session} />;
}
