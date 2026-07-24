import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getProject, projectTasksFor } from '@/lib/data/projects';
import { timerStatesFor } from '@/lib/data/timers';
import { aiSuggestConfigured } from '@/lib/ai/suggest-steps';
import { listNotes } from '@/lib/data/notes';
import { listUsers } from '@/lib/data/users';
import { ProjectDetail } from './project-detail';
import { NotesSection } from '@/app/_components/notes-section';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const project = await getProject(params.id);
  if (!project) notFound();

  const [tasks, people, notes] = await Promise.all([
    projectTasksFor(params.id),
    listUsers(),
    listNotes('project', params.id),
  ]);
  const timers = await timerStatesFor(user.id, 'task', tasks.map((t) => t.id));

  return (
    <main className="view">
      <ProjectDetail project={project} tasks={tasks} people={people} currentUser={user} timers={timers} aiEnabled={aiSuggestConfigured()} />
      <NotesSection parentType="project" parentId={project.id} notes={notes} currentUser={user} />
    </main>
  );
}
