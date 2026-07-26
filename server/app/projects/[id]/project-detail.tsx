'use client';
import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { ProjectRow, TaskRow } from '@/lib/data/projects';
import { STATUS_LABELS, type ProjectStatus } from '@/lib/domain/project-status';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import { fmtDate } from '@/lib/domain/dates';
import { uploadPhoto } from '@/lib/client/photo';
import { TimerControl } from '@/app/_components/timer-control';
import { NotesSection } from '@/app/_components/notes-section';
import { AssigneePicker } from '@/app/_components/assignee-picker';
import type { TimerState } from '@/lib/data/timers';
import type { NoteRow } from '@/lib/data/notes';

export function ProjectDetail({
  project,
  tasks,
  people,
  currentUser,
  timers,
  taskNotes,
  aiEnabled,
}: {
  project: ProjectRow;
  tasks: TaskRow[];
  people: PersonRow[];
  currentUser: SessionUser;
  timers: Record<string, TimerState>;
  taskNotes: Record<string, NoteRow[]>;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const canManage = currentUser.role === 'manager' || currentUser.role === 'admin';
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTaskRef = useRef<string | null>(null);

  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  async function request(url: string, method: string, body?: unknown): Promise<boolean> {
    setError(null);
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || 'Something went wrong.');
      return false;
    }
    return true;
  }

  async function act(key: string, url: string, method: string, body?: unknown, then?: () => void) {
    setBusy(key);
    const ok = await request(url, method, body);
    setBusy(null);
    if (ok) (then ?? (() => router.refresh()))();
  }

  async function onToggle(t: TaskRow) {
    // Completing a photo-required task opens the camera/file picker first.
    if (!t.done && t.requirePhoto) {
      pendingTaskRef.current = t.id;
      photoInputRef.current?.click();
      return;
    }
    await act('toggle-' + t.id, `/api/tasks/${t.id}/toggle`, 'POST');
  }

  async function onPhotoPicked(file: File | null) {
    const taskId = pendingTaskRef.current;
    pendingTaskRef.current = null;
    if (photoInputRef.current) photoInputRef.current.value = '';
    if (!file || !taskId) return;
    setBusy('toggle-' + taskId);
    setError(null);
    try {
      const photoId = await uploadPhoto(file);
      const ok = await request(`/api/tasks/${taskId}/toggle`, 'POST', { photoId });
      if (ok) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Photo upload failed.');
    } finally {
      setBusy(null);
    }
  }

  async function onStatus(status: ProjectStatus) {
    await act('status', `/api/projects/${project.id}/status`, 'PATCH', { status });
  }

  async function onDeleteProject() {
    if (!confirm('Delete this project and its tasks?')) return;
    await act('del-project', `/api/projects/${project.id}`, 'DELETE', undefined, () => router.push('/projects'));
  }

  async function onDeleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    await act('del-' + id, `/api/tasks/${id}`, 'DELETE');
  }

  async function onSendBack(id: string) {
    const reason = window.prompt('Send this task back to be redone. Reason (optional):', '');
    if (reason === null) return;
    await act('sb-' + id, `/api/tasks/${id}/send-back`, 'POST', { reason });
  }

  return (
    <>
      <div className="sub-head">
        <Link href="/projects" className="btn small ghost back-btn">
          ‹ Projects
        </Link>
        <h1>{project.name}</h1>
      </div>

      <div className="card">
        {project.description && <p style={{ marginTop: 0 }}>{project.description}</p>}
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="subtle" style={{ margin: '0 0 8px' }}>
          {done} / {tasks.length} tasks done
          {project.targetDate ? ` · target ${fmtDate(project.targetDate)}` : ''}
        </p>
        {canManage ? (
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select value={project.status} onChange={(e) => onStatus(e.target.value as ProjectStatus)} disabled={busy === 'status'}>
              {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="badge neutral">{STATUS_LABELS[project.status]}</span>
        )}
        {canManage && (
          <div className="row-actions" style={{ marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn small ghost" disabled={busy !== null} onClick={() => setEditingProject((v) => !v)}>
              {editingProject ? 'Cancel edit' : 'Edit project'}
            </button>
            <button className="btn small ghost danger" disabled={busy === 'del-project'} onClick={onDeleteProject}>
              Delete project
            </button>
          </div>
        )}
        {canManage && editingProject && (
          <div style={{ marginTop: 12 }}>
            <EditProjectForm project={project} onDone={() => setEditingProject(false)} onError={setError} />
          </div>
        )}
      </div>

      <div className="section-title">
        Tasks
        <span className="count-pill">{tasks.length}</span>
      </div>
      {!tasks.length && <div className="empty">No tasks yet.</div>}
      {/* Hidden picker used to capture a photo when completing a proof-required task. */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => onPhotoPicked(e.target.files?.[0] ?? null)}
      />

      {tasks.map((t) => (
        <div className="card" key={t.id}>
          {t.sentBack && (
            <div className="sb-banner">
              ↩ Sent back{t.sentBack.reason ? `: "${t.sentBack.reason}"` : ''} — please redo.
            </div>
          )}
          <div className={`check-row ${t.done ? 'done' : ''}`}>
            <input
              type="checkbox"
              checked={t.done}
              disabled={busy === 'toggle-' + t.id}
              onChange={() => onToggle(t)}
            />
            <div className="item-main">
              <p className="item-title c-title">{t.title}</p>
              {t.description && <p className="item-sub">{t.description}</p>}
              <div className="chips">
                {t.assigneeIds.length ? (
                  // One chip per person, so it's obvious who else is on the job.
                  t.assigneeIds.map((id) => (
                    <span className="chip" key={id}>
                      {nameById.get(id) ?? 'Someone'}
                    </span>
                  ))
                ) : (
                  <span className="chip">{t.open ? '🙌 open' : 'Unassigned'}</span>
                )}
                {t.dueDate && <span className="chip">due {fmtDate(t.dueDate)}</span>}
                {t.requirePhoto && !t.done && <span className="chip">📷 proof</span>}
                {t.done && t.doneAt && <span className="chip">done {fmtDate(t.doneAt)} by {nameById.get(t.doneBy ?? '') ?? 'Unknown'}</span>}
                {t.done && t.donePhotoId && (
                  <a href={`/api/attachments/${t.donePhotoId}`} target="_blank" rel="noopener" className="chip-link" style={{ fontSize: 12 }}>
                    📷 proof
                  </a>
                )}
              </div>
              {!t.done && timers[t.id] && (
                <TimerControl
                  kind="task"
                  refId={t.id}
                  running={timers[t.id].running}
                  startedAt={timers[t.id].startedAt}
                  totalSec={timers[t.id].totalSec}
                />
              )}
            </div>
            <div className="row-actions">
              {t.open && !t.done && !t.assigneeIds.includes(currentUser.id) && (
                <button className="btn small primary" disabled={busy === 'claim-' + t.id} onClick={() => act('claim-' + t.id, `/api/tasks/${t.id}/claim`, 'POST')}>
                  Claim
                </button>
              )}
              {t.open && !t.done && t.assigneeIds.includes(currentUser.id) && (
                <button className="btn small ghost" disabled={busy === 'release-' + t.id} onClick={() => act('release-' + t.id, `/api/tasks/${t.id}/release`, 'POST')}>
                  Release
                </button>
              )}
              <button
                className="icon-btn"
                title="Notes"
                onClick={() => setNotesOpen((v) => (v === t.id ? null : t.id))}
              >
                💬{taskNotes[t.id]?.length ? ` ${taskNotes[t.id].length}` : ''}
              </button>
              {canManage && !t.done && (
                <button
                  className="icon-btn"
                  title="Edit task"
                  disabled={busy !== null}
                  onClick={() => setEditingTask((v) => (v === t.id ? null : t.id))}
                >
                  ✏️
                </button>
              )}
              {canManage && t.done && (
                <button className="icon-btn" style={{ color: 'var(--overdue)' }} title="Send back" disabled={busy === 'sb-' + t.id} onClick={() => onSendBack(t.id)}>
                  ↩
                </button>
              )}
              {canManage && (
                <button className="icon-btn" title="Delete task" disabled={busy === 'del-' + t.id} onClick={() => onDeleteTask(t.id)}>
                  🗑
                </button>
              )}
            </div>
          </div>

          {canManage && editingTask === t.id && (
            <div style={{ marginTop: 10 }}>
              <EditTaskForm task={t} people={people} onDone={() => setEditingTask(null)} onError={setError} />
            </div>
          )}

          {notesOpen === t.id && (
            <div className="task-notes">
              <NotesSection
                parentType="task"
                parentId={t.id}
                notes={taskNotes[t.id] ?? []}
                currentUser={currentUser}
              />
            </div>
          )}
        </div>
      ))}

      {canManage && aiEnabled && <SuggestSteps projectId={project.id} onError={setError} />}

      {canManage && <AddTaskForm projectId={project.id} people={people} onError={setError} />}

      {error && <p className="error-text">{error}</p>}
    </>
  );
}

function SuggestSteps({ projectId, onError }: { projectId: string; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [steps, setSteps] = useState<{ title: string; description?: string }[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    onError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/suggest-steps`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(data.error || 'Could not generate suggestions.');
        return;
      }
      setSteps(Array.isArray(data.steps) ? data.steps : []);
    } finally {
      setLoading(false);
    }
  }

  async function addStep(step: { title: string; description?: string }) {
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: step.title, description: step.description || '' }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Could not add task.');
      return false;
    }
    return true;
  }

  async function addOne(step: { title: string; description?: string }, index: number) {
    setAdding(`one-${index}`);
    onError(null);
    const ok = await addStep(step);
    setAdding(null);
    if (ok) {
      setSteps((prev) => prev?.filter((_, i) => i !== index) ?? null);
      router.refresh();
    }
  }

  async function addAll() {
    if (!steps?.length) return;
    setAdding('all');
    onError(null);
    for (const step of steps) {
      const ok = await addStep(step);
      if (!ok) break;
    }
    setAdding(null);
    setSteps(null);
    router.refresh();
  }

  return (
    <>
      <div className="section-title">Plan with AI</div>
      <div className="card">
        {!steps ? (
          <>
            <p className="subtle" style={{ marginTop: 0 }}>
              Let Claude suggest a task breakdown from this project&apos;s name and description.
            </p>
            <button className="btn block" disabled={loading} onClick={generate}>
              {loading ? 'Thinking…' : '✨ Suggest steps'}
            </button>
          </>
        ) : steps.length === 0 ? (
          <p className="subtle" style={{ margin: 0 }}>
            No suggestions came back. Try adding a description, then generate again.
          </p>
        ) : (
          <>
            <ul className="suggest-list">
              {steps.map((s, i) => (
                <li key={i}>
                  <div className="item-main">
                    <p className="s-title">{s.title}</p>
                    {s.description && <p className="s-desc">{s.description}</p>}
                  </div>
                  <button className="btn small primary" disabled={adding !== null} onClick={() => addOne(s, i)}>
                    {adding === `one-${i}` ? '…' : 'Add'}
                  </button>
                </li>
              ))}
            </ul>
            <div className="row-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
              <button className="btn primary" disabled={adding !== null} onClick={addAll}>
                {adding === 'all' ? 'Adding…' : `Add all ${steps.length}`}
              </button>
              <button className="btn ghost" disabled={adding !== null} onClick={() => setSteps(null)}>
                Discard
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function AddTaskForm({ projectId, people, onError }: { projectId: string; people: PersonRow[]; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [open, setOpen] = useState(false);
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    onError(null);
    const res = await fetch(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, assigneeIds, dueDate: dueDate || null, open, requirePhoto }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Something went wrong.');
      return;
    }
    setTitle('');
    setDescription('');
    setDueDate('');
    setAssigneeIds([]);
    router.refresh();
  }

  return (
    <>
      <div className="section-title">Add a task</div>
      <div className="card">
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="e.g. Frame the walls" />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <AssigneePicker people={people} value={assigneeIds} onChange={setAssigneeIds} />
          <div className="field">
            <label>Due date (optional)</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <label className="inline-check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
            Leave open for anyone to claim
          </label>
          <label className="inline-check" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
            Require a photo to complete
          </label>
          <button type="submit" disabled={loading} className="btn primary block">
            {loading ? 'Saving…' : '+ Add task'}
          </button>
        </form>
      </div>
    </>
  );
}

/** Edit a project's name, description, and target date in place. */
function EditProjectForm({
  project,
  onDone,
  onError,
}: {
  project: ProjectRow;
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const [targetDate, setTargetDate] = useState(project.targetDate ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, targetDate: targetDate || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Could not save the project.');
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Name</label>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="field">
        <label>Target date (optional)</label>
        <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
      </div>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn primary">
          {saving ? 'Saving…' : 'Save project'}
        </button>
      </div>
    </form>
  );
}

/** Edit a task's title, description, assignee, due date, and flags. */
function EditTaskForm({
  task,
  people,
  onDone,
  onError,
}: {
  task: TaskRow;
  people: PersonRow[];
  onDone: () => void;
  onError: (m: string | null) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task.assigneeIds);
  const [dueDate, setDueDate] = useState(task.dueDate ?? '');
  const [open, setOpen] = useState(task.open);
  const [requirePhoto, setRequirePhoto] = useState(task.requirePhoto);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    onError(null);
    const res = await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        assigneeIds,
        dueDate: dueDate || null,
        open,
        requirePhoto,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      onError(data.error || 'Could not save the task.');
      return;
    }
    onDone();
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label>Title</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required />
      </div>
      <div className="field">
        <label>Description</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
      </div>
      <AssigneePicker people={people} value={assigneeIds} onChange={setAssigneeIds} />
      <div className="field">
        <label>Due date (optional)</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      <label className="inline-check" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
        Leave open for anyone to claim
      </label>
      <label className="inline-check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={requirePhoto} onChange={(e) => setRequirePhoto(e.target.checked)} />
        Require a photo to complete
      </label>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onDone}>
          Cancel
        </button>
        <button type="submit" disabled={saving} className="btn primary">
          {saving ? 'Saving…' : 'Save task'}
        </button>
      </div>
    </form>
  );
}
