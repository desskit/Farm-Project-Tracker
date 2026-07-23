import { notFound } from 'next/navigation';
import { ComingSoon } from '../../_components/coming-soon';

// More-hub subsections whose shell exists but whose feature isn't wired yet.
// (Supplies and Rent are live — their static routes override this placeholder.)
const SECTIONS: Record<string, { title: string; icon: string; blurb: string }> = {
  leaderboard: { title: 'Leaderboard', icon: '🏆', blurb: 'Points, streaks, and photo-verified work — month & all-time.' },
  team: { title: 'Team', icon: '👥', blurb: 'Farm-wide status tiles and per-person workload.' },
  activity: { title: 'Activity', icon: '🕙', blurb: 'A running log of who did what, and when.' },
  notifications: { title: 'Notifications', icon: '🔔', blurb: 'Email digests and push preferences, per person.' },
  weather: { title: 'Weather', icon: '🌤️', blurb: '7-day forecast with the daily fire-danger estimate.' },
  data: { title: 'Data', icon: '💾', blurb: 'Backup and export your farm data.' },
};

export default function MoreSectionPage({ params }: { params: { section: string } }) {
  const section = SECTIONS[params.section];
  if (!section) notFound();
  return (
    <ComingSoon
      title={section.title}
      blurb={section.blurb}
      backHref="/more"
      backLabel="More"
    />
  );
}
