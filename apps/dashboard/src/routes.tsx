import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import {
  ConnectorDetailPage,
  ConnectorsPage,
  BankBrainPage,
  InventoryPage,
  MessengerPage,
  PartialPage,
  SettingsPage,
  VehiclePage,
} from './unified/pages';
import { CommandCenterPage } from './unified/CommandCenterPage';
import { UnifiedShell } from './unified/Shell';

const LegacyAppShell = lazy(async () => {
  const module = await import('./App');
  return { default: module.AppShell };
});

export const requiredRoutes = [
  '/dashboard',
  '/inventory',
  '/inventory/:vin',
  '/leads',
  '/customers/:id',
  '/tasks',
  '/marketplace',
  '/messenger',
  '/bank-brain',
  '/connectors',
  '/connectors/:connectorId',
  '/settings',
] as const;

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<UnifiedShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<CommandCenterPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/:vin" element={<VehiclePage />} />
        <Route path="leads" element={<PartialPage title="Leads" description="DriveCentric lead and conversation ingestion is connected through the shared gateway contract." />} />
        <Route path="customers/:id" element={<PartialPage title="Customer" description="Customer timeline, objections, trade, appointment, priority, and AI draft fields are represented in the normalized schema." />} />
        <Route path="tasks" element={<PartialPage title="Tasks" description="Priority and approval tasks are ready for workflow-created opportunities and alerts." />} />
        <Route path="marketplace" element={<PartialPage title="Marketplace" description="Facebook draft/live behavior is preserved behind an approval-gated Local Agent connector; Craigslist and OfferUp are recording skeletons." />} />
        <Route path="messenger" element={<MessengerPage />} />
        <Route path="bank-brain" element={<BankBrainPage />} />
        <Route path="connectors" element={<ConnectorsPage />} />
        <Route path="connectors/:connectorId" element={<ConnectorDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route
        path="/legacy/*"
        element={<Suspense fallback={<div className="ux-state">Loading legacy command center…</div>}><LegacyAppShell /></Suspense>}
      />
    </>,
  ),
);
