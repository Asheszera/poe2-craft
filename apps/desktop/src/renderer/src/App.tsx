import { VIEWS } from '@/app/navigation';
import { useAppStore } from '@/app/store';
import { useItemCapture } from '@/app/useItemCapture';
import { ComingSoon } from '@/components/ComingSoon';
import { Sidebar } from '@/components/Sidebar';
import { TitleBar } from '@/components/TitleBar';
import { AnalyzerView } from '@/features/analyzer/AnalyzerView';
import { BuildAdvisorView } from '@/features/build/BuildAdvisorView';
import { CraftAdvisorView } from '@/features/craft/CraftAdvisorView';
import { DashboardView } from '@/features/dashboard/DashboardView';
import { SettingsView } from '@/features/settings/SettingsView';

/**
 * View switch instead of a router.
 *
 * The app has no URLs, no deep links and no history semantics — a router would
 * add a dependency and a `HashRouter` workaround for `file://` to model state
 * that a single discriminated value already covers. Revisit if deep-linking
 * from the overlay is ever needed.
 */
function ActiveView(): React.JSX.Element {
  const activeView = useAppStore((s) => s.activeView);

  switch (activeView) {
    case 'dashboard':
      return <DashboardView />;
    case 'analyzer':
      return <AnalyzerView />;
    case 'build':
      return <BuildAdvisorView />;
    case 'craft':
      return <CraftAdvisorView />;
    case 'settings':
      return <SettingsView />;
    default: {
      const view = VIEWS.find((v) => v.id === activeView);
      return <ComingSoon label={view?.label ?? activeView} stage={view?.stage ?? 0} />;
    }
  }
}

export function App(): React.JSX.Element {
  // Subscribed once, at the root, so captures land regardless of active view.
  useItemCapture();

  return (
    <div className="flex h-full">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TitleBar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <ActiveView />
        </main>
      </div>
    </div>
  );
}
