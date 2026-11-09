'use client';
import { useState } from 'react';
import { Camera, Hand, Image as ImageIcon, MessageSquare, Pencil, Trash2, Undo2 } from 'lucide-react';
import type { TaskRow } from '@/lib/data/projects';
import type { PersonRow } from '@/lib/data/users';
import type { SessionUser } from '@/lib/auth/session';
import type { TimerState } from '@/lib/data/timers';
import type { NoteRow } from '@/lib/data/notes';
import { fmtDate, relativeLabel } from '@/lib/domain/dates';
import { can } from '@/lib/domain/permissions';
import { TimerControl } from '@/app/_components/timer-control';
import { NotesSection } from '@/app/_components/notes-section';
import { AvatarStack, Banner, Button, IconButton, StatusPill } from '@/components/ui';
import { EditTaskForm } from './project-forms';
import s from './project.module.css';

/** One task: tick it off (with a photo if needed), and everything else you can do to it. */
export function TaskItem({
  t, people, currentUser, timer, notes, busy, onToggle, onAct, onDelete, onSendBack, onError,
}: {
  t: TaskRow;
  people: PersonRow[];
  currentUser: SessionUser;
  timer?: TimerState;
  notes: NoteRow[];
  busy: boolean;
  onToggle: () => void;
  onAct: (path: 'claim' | 'release') => void;
  onDelete: () => void;
  onSendBack: () => void;
  onError: (m: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const canManage = can(currentUser, 'work.manage');
  const nameById = new Map(people.map((p) => [p.id, p.name]));
  const names = t.assigneeIds.map((id) => nameById.get(id) ?? 'Someone');
  const onIt = t.assigneeIds.includes(currentUser.id);
  const overdue = !t.done && t.dueDate && relativeLabel(t.dueDate).includes('ago');

  return (
    <div className={`${s.task} ${t.done ? s.taskDone : ''}`}>
      {t.sentBack && <Banner tone="warn" title="Sent back — please redo">{t.sentBack.reason || 'No reason given.'}</Banner>}
      <div className={s.taskRow}>
        <label className={s.check}>
          <input type="checkbox" checked={t.done} disabled={busy} onChange={onToggle} aria-label={`${t.done ? 'Reopen' : 'Complete'} ${t.title}`} />
        </label>
        <div className={s.taskMain}>
          <div className={s.taskTitle}>{t.title}</div>
          {t.description && <div className={s.muted}>{t.description}</div>}
          <div className={s.chips}>
            {names.length ? (
              <span className={s.who}><AvatarStack names={names} /> {names.join(', ')}</span>
            ) : (
              <span className={s.muted}>{t.open ? 'Up for grabs' : 'Nobody assigned'}</span>
            )}
            {t.dueDate && !t.done && <StatusPill tone={overdue ? 'overdue' : 'upcoming'}>{relativeLabel(t.dueDate)}</StatusPill>}
            {t.repeat && !t.done && <StatusPill tone="neutral">Every {t.repeat.every === 1 ? t.repeat.unit.replace(/s$/, '') : `${t.repeat.every} ${t.repeat.unit}`}</StatusPill>}
            {t.requirePhoto && !t.done && <span className={s.flag}><Camera aria-hidden /> photo</span>}
            {t.done && t.doneAt && (
              <span className={s.muted}>Done {fmtDate(t.doneAt)} by {nameById.get(t.doneBy ?? '') ?? 'someone'}</span>
            )}
            {t.done && t.donePhotoId && (
              <a href={`/api/attachments/${t.donePhotoId}`} target="_blank" rel="noopener" className={s.proof}>
                <ImageIcon aria-hidden /> proof
              </a>
            )}
          </div>
          {!t.done && timer && <TimerControl kind="task" refId={t.id} running={timer.running} startedAt={timer.startedAt} totalSec={timer.totalSec} />}
        </div>
      </div>
      <div className={s.taskActions}>
        {t.open && !t.done && !onIt && can(currentUser, 'work.claim') && (
          <Button size="sm" icon={<Hand />} disabled={busy} onClick={() => onAct('claim')}>Take it</Button>
        )}
        {t.open && !t.done && onIt && (
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAct('release')}>Step off</Button>
        )}
        <Button size="sm" variant="ghost" icon={<MessageSquare />} onClick={() => setNotesOpen((v) => !v)}>
          {notes.length ? notes.length : 'Notes'}
        </Button>
        {canManage && !t.done && <IconButton label="Edit task" onClick={() => setEditing((v) => !v)}><Pencil /></IconButton>}
        {canManage && t.done && <IconButton label="Send back to redo" onClick={onSendBack}><Undo2 /></IconButton>}
        {canManage && <IconButton label="Delete task" onClick={onDelete}><Trash2 /></IconButton>}
      </div>
      {editing && <EditTaskForm task={t} people={people} onDone={() => setEditing(false)} onError={onError} />}
      {notesOpen && (
        <div className={s.notes}>
          <NotesSection parentType="task" parentId={t.id} notes={notes} currentUser={currentUser} />
        </div>
      )}
    </div>
  );
}
