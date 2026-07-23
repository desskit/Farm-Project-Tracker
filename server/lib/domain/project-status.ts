// Client-safe project status labels + type (no server-only imports), so client
// components can use them without dragging the data layer into their bundle.
export type ProjectStatus = 'idea' | 'planned' | 'in_progress' | 'on_hold' | 'done';

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  idea: 'Idea',
  planned: 'Planned',
  in_progress: 'In progress',
  on_hold: 'On hold',
  done: 'Done',
};
