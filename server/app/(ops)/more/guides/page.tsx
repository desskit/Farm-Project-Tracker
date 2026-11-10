import { notFound } from 'next/navigation';
import { BookOpen } from 'lucide-react';
import { getSessionUser } from '@/lib/auth/session';
import { listGuides } from '@/lib/data/guides';
import { can } from '@/lib/domain/permissions';
import { Card, EmptyState, ListRow } from '@/components/ui';
import { Screen } from '@/components/patterns/screen';
import { GuideEditorButton } from './guide-editor';

export const metadata = { title: 'How-to guides · Farm Project Tracker' };

export default async function GuidesPage() {
  const user = await getSessionUser();
  if (!user || !can(user, 'farm.view')) notFound();
  const guides = await listGuides();
  const manage = can(user, 'work.manage');
  return (
    <Screen title="How-to guides" subtitle="Step-by-step instructions, kept where the work is" back="/more" actions={manage ? <GuideEditorButton /> : undefined}>
      <Card flush>
        {guides.length === 0 ? (
          <EmptyState icon={<BookOpen />} title="No guides yet">
            {manage ? 'Write one for the jobs people ask about: starting the generator, mixing milk replacer, winterizing the pump.' : 'A manager can write how-to guides here.'}
          </EmptyState>
        ) : (
          guides.map((g) => (
            <ListRow key={g.id} href={`/more/guides/${g.id}`} lead={<BookOpen />} title={g.title} meta={[g.summary, `${g.steps.length} step${g.steps.length === 1 ? '' : 's'}`, g.photoCount ? `${g.photoCount} photo${g.photoCount === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ')} />
          ))
        )}
      </Card>
    </Screen>
  );
}
