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
import type { TimerState } from '@/lib/data/timers';

export function ProjectDetail({
  project,
  tasks,
  people,
  currentUser,
  timers,
}: {
  project: ProjectRow;
  tasks: TaskRow[];
  people: PersonRow[];
  currentUser: SessionUser;
  timers: Record<string, TimerState>;
}) {
  const router = useRouter();
  const canManage = currentUser.role === 'manager' || currentUser.role === 'admin';
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
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
          <div className="row-actions" style={{ marginTop: 12 }}>
            <button className="btn small ghost danger" disabled={busy === 'del-project'} onClick={onDeleteProject}>
              Delete project
            </button>
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
                <span className="chip">{t.assignedTo ? (nameById.get(t.assignedTo) ?? 'Unassigned') : t.open ? '🙌 open' : 'Unassigned'}</span>
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
              {t.open && !t.assignedTo && !t.done && (
                <button className="btn small primary" disabled={busy === 'claim-' + t.id} onClick={() => act('claim-' + t.id, `/api/tasks/${t.id}/claim`, 'POST')}>
                  Claim
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
        </div>
      ))}

      {canManage && <AddTaskForm projectId={project.id} people={people} onError={setError} />}

      {error && <p className="error-text">{error}</p>}
    </>
  );
}

function AddTaskForm({ projectId, people, onError }: { projectId: string; people: PersonRow[]; onError: (m: string | null) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
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
      body: JSON.stringify({ title, description, assignedTo: assignedTo || null, dueDate: dueDate || null, open, requirePhoto }),
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
          <div className="field">
            <label>Assign to</label>
            <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
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
