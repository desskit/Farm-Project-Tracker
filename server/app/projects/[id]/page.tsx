import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { getProject, projectTasksFor } from '@/lib/data/projects';
import { listUsers } from '@/lib/data/users';
import { ProjectDetail } from './project-detail';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const project = await getProject(params.id);
  if (!project) notFound();

  const [tasks, people] = await Promise.all([projectTasksFor(params.id), listUsers()]);

  return (
    <main className="view">
      <ProjectDetail project={project} tasks={tasks} people={people} currentUser={user} />
    </main>
  );
}
