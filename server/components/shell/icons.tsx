import {
  Boxes, CalendarCheck, ClipboardList, FileText, Home, LayoutGrid, ListChecks, MessageSquareWarning, MoreHorizontal,
  Package, PawPrint, Plus, Sprout, Repeat, StickyNote, Timer, Tractor, User, Wallet, Wrench, type LucideIcon,
} from 'lucide-react';
import type { IconName } from '@/lib/domain/nav';

/** lucide icons for the nav's icon names (kept out of lib/domain so it stays dependency-free). */
export const ICONS: Record<IconName, LucideIcon> = {
  today: Home,
  work: ListChecks,
  add: Plus,
  farm: LayoutGrid,
  more: MoreHorizontal,
  me: User,
  chores: Repeat,
  projects: ClipboardList,
  upkeep: Wrench,
  supplies: Package,
  assets: Tractor,
  note: StickyNote,
  timer: Timer,
  rent: Wallet,
  docs: FileText,
  requests: MessageSquareWarning,
  animals: PawPrint,
  land: Sprout,
};
export { Boxes, CalendarCheck };
