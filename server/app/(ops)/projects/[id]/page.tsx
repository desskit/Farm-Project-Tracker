import { notFound } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/session';
import { projectForViewer, projectTasksFor } from '@/lib/data/projects';
import { timerStatesFor } from '@/lib/data/timers';
import { aiSuggestConfigured } from '@/lib/ai/suggest-steps';
import { listNotes, listNotesForParents } from '@/lib/data/notes';
import { listUsers } from '@/lib/data/users';
import { listExpenses, budgetSummary } from '@/lib/data/project-expenses';
import { ProjectDetail } from './project-detail';
import { NotesSection } from '@/app/_components/notes-section';
import { BudgetSection } from './budget-section';
import { can } from '@/lib/domain/permissions';
import s from './project.module.css';

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return null; // middleware already guards this route

  const project = await projectForViewer(user, params.id);
  if (!project) notFound();

  const [tasks, people, notes, expenses] = await Promise.all([
    projectTasksFor(params.id, user),
    listUsers(),
    listNotes('project', params.id),
    // Budgets and receipts are money: only people who can see finances get them.
    can(user, 'finance.view') ? listExpenses(params.id) : Promise.resolve([]),
  ]);
  const summary = budgetSummary(
    project.budget,
    expenses.reduce((sum, e) => sum + e.amount, 0),
  );
  const [timers, taskNotes] = await Promise.all([
    timerStatesFor(user.id, 'task', tasks.map((t) => t.id)),
    listNotesForParents('task', tasks.map((t) => t.id)),
  ]);

  return (
    <main className={s.wrap}>
      <ProjectDetail
        project={project}
        tasks={tasks}
        people={people}
        currentUser={user}
        timers={timers}
        taskNotes={taskNotes}
        aiEnabled={aiSuggestConfigured()}
      />
      {can(user, 'finance.view') && (
        <BudgetSection projectId={project.id} expenses={expenses} summary={summary} currentUser={user} />
      )}
      <NotesSection parentType="project" parentId={project.id} notes={notes} currentUser={user} />
    </main>
  );
}
