import {
  Boxes,
  Calculator,
  Coins,
  Hammer,
  LayoutDashboard,
  ScanSearch,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/**
 * The application's sections. Declared as data so the sidebar, the router and
 * (later) the command palette all read from one list.
 */
export const VIEWS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, stage: 1 },
  { id: 'analyzer', label: 'Item Analyzer', icon: ScanSearch, stage: 1 },
  { id: 'craft', label: 'Craft Advisor', icon: Hammer, stage: 1 },
  { id: 'price', label: 'Price Check', icon: Coins, stage: 3 },
  { id: 'build', label: 'Build Advisor', icon: Boxes, stage: 4 },
  { id: 'currency', label: 'Currency Calculator', icon: Calculator, stage: 4 },
  { id: 'settings', label: 'Settings', icon: Settings, stage: 2 },
] as const satisfies readonly {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Roadmap stage that implements it; drives the "coming soon" placeholder. */
  stage: number;
}[];

export type ViewId = (typeof VIEWS)[number]['id'];
