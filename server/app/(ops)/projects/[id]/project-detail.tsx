'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Pencil, Trash2 } from 'lucide-react';
import type { ProjectRow, TaskRow } from '@/lib/data/projects';
import { STATUS_LABELS, type ProjectStatus } from '@/lib/domain/project-status';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import type { TimerState } from '@/lib/data/timers';
import type { NoteRow } from '@/lib/data/notes';
import { fmtDate } from '@/lib/domain/dates';
import { preparePhoto } from '@/lib/client/photo';
import { submitQueued } from '@/lib/client/outbox';
import { can } from '@/lib/domain/permissions';
import { Banner, Card, EmptyState, Field, IconButton, PageHeader, Select, Stack, StatusPill } from '@/components/ui';
import { useDialogs } from '@/components/ui/dialogs';
import { AddTaskForm, EditProjectForm } from './project-forms';
import { SuggestSteps } from './suggest-steps';
import { TaskItem } from './task-item';
import s from './project.module.css';

export function ProjectDetail({
  project, tasks, people, currentUser, timers, taskNotes, aiEnabled,
}: {
  project: ProjectRow;
  tasks: TaskRow[];
  people: PersonRow[];
  currentUser: SessionUser;
  timers: Record<string, TimerState>;
  taskNotes: Record<string, NoteRow[]>;
  aiEnabled: boolean;
}) {
  const { confirm: askConfirm, prompt: askPrompt } = useDialogs();
  const router = useRouter();
  const canManage = can(currentUser, 'work.manage');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTaskRef = useRef<string | null>(null);

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const pct = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  async function act(key: string, url: string, method: string, body?: unknown, then?: () => void) {
    setBusy(key);
    setError(null);
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
    setBusy(null);
    if (!res.ok) return setError((await res.json().catch(() => ({}))).error || 'Something went wrong.');
    (then ?? (() => router.refresh()))();
  }

  /** Ticking a task off is field work, so it goes through the offline outbox. */
  async function toggle(t: TaskRow, prepared?: Awaited<ReturnType<typeof preparePhoto>>) {
    setBusy('toggle-' + t.id);
    setError(null);
    const r = await submitQueued({ url: `/api/tasks/${t.id}/toggle`, body: {}, label: `${t.done ? 'Reopened' : 'Completed'} ${t.title}`, photo: prepared, photoField: 'photoId' });
    setBusy(null);
    if (r.ok) router.refresh();
    else if (!r.queued) setError(r.error);
  }

  function onToggle(t: TaskRow) {
    // Completing a photo-required task opens the camera/file picker first.
    if (!t.done && t.requirePhoto) {
      pendingTaskRef.current = t.id;
      photoInputRef.current?.click();
      return;
    }
    void toggle(t);
  }

  async function onPhotoPicked(file: File | null) {
    const task = tasks.find((t) => t.id === pendingTaskRef.current);
    pendingTaskRef.current = null;
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || !task) return;
    try {
      // Resize now, upload during the send — a proof photo taken out of signal queues with the toggle.
      await toggle(task, await preparePhoto(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that photo.');
    }
  }

  const item = (t: TaskRow) => (
    <TaskItem
      key={t.id}
      t={t}
      people={people}
      currentUser={currentUser}
      timer={timers[t.id]}
      notes={taskNotes[t.id] ?? []}
      busy={busy !== null && busy.endsWith(t.id)}
      onToggle={() => onToggle(t)}
      onAct={(path) => act(`${path}-${t.id}`, `/api/tasks/${t.id}/${path}`, 'POST')}
      onDelete={async () => {
        if (await askConfirm('Delete this task?')) await act('del-' + t.id, `/api/tasks/${t.id}`, 'DELETE');
      }}
      onSendBack={async () => {
        const reason = await askPrompt('Send this task back to be redone. Reason (optional):', '');
        if (reason !== null) await act('sb-' + t.id, `/api/tasks/${t.id}/send-back`, 'POST', { reason });
      }}
      onError={setError}
    />
  );

  return (
    <Stack gap={16}>
      <PageHeader
        back={<Link href="/projects" aria-label="Back to projects" className={s.back}><ChevronLeft /></Link>}
        title={project.name}
        subtitle={project.targetDate ? `Target ${fmtDate(project.targetDate)}` : undefined}
        actions={
          canManage ? (
            <>
              <IconButton label="Edit project" onClick={() => setEditingProject((v) => !v)}><Pencil /></IconButton>
              <IconButton
                label="Delete project"
                onClick={async () => {
                  if (await askConfirm('Delete this project and its tasks?')) await act('del-project', `/api/projects/${project.id}`, 'DELETE', undefined, () => router.push('/projects'));
                }}
              >
                <Trash2 />
              </IconButton>
            </>
          ) : undefined
        }
      />

      <Card>
        {project.description && <p className={s.desc}>{project.description}</p>}
        <span className={s.bar} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of tasks done`}>
          <span className={s.fill} style={{ width: `${pct}%` }} />
        </span>
        <div className={s.summary}>
          <span>{done.length} of {tasks.length} tasks done</span>
          {canManage ? (
            <Field label="Status" htmlFor="proj-status">
              <Select id="proj-status" value={project.status} disabled={busy === 'status'} onChange={(e) => act('status', `/api/projects/${project.id}/status`, 'PATCH', { status: e.target.value as ProjectStatus })}>
                {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
              </Select>
            </Field>
          ) : (
            <StatusPill tone="info">{STATUS_LABELS[project.status]}</StatusPill>
          )}
        </div>
        {canManage && editingProject && <EditProjectForm project={project} onDone={() => setEditingProject(false)} onError={setError} />}
      </Card>

      {error && <Banner tone="danger">{error}</Banner>}

      {/* Hidden picker used to capture a photo when completing a proof-required task. */}
      <input ref={photoInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => onPhotoPicked(e.target.files?.[0] ?? null)} />

      <Card title={<span className={s.titleIcon}>To do <span className={s.count}>{open.length}</span></span>} flush>
        {open.length ? open.map(item) : <EmptyState title={tasks.length ? 'All done' : 'No tasks yet'}>{canManage && !tasks.length ? 'Add the first one below.' : undefined}</EmptyState>}
      </Card>
      {done.length > 0 && (
        <details className={s.doneList}>
          <summary>Done ({done.length})</summary>
          <Card flush>{done.map(item)}</Card>
        </details>
      )}

      {aiEnabled && can(currentUser, 'ai.use') && <SuggestSteps projectId={project.id} onError={setError} />}
      {canManage && (
        <Card title="Add a task">
          <AddTaskForm projectId={project.id} people={people} onError={setError} />
        </Card>
      )}
    </Stack>
  );
}
