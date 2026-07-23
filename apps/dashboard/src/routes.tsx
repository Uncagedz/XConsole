import { Navigate, createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { AppShell } from './App';
import {
  ConnectorDetailPage,
  ConnectorsPage,
  DashboardPage,
  InventoryPage,
  PartialPage,
  VehiclePage,
} from './unified/pages';
import { UnifiedShell } from './unified/Shell';

export const requiredRoutes = [
  '/dashboard',
  '/inventory',
  '/inventory/:vin',
  '/leads',
  '/customers/:id',
  '/tasks',
  '/marketplace',
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
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/:vin" element={<VehiclePage />} />
        <Route path="leads" element={<PartialPage title="Leads" description="DriveCentric lead and conversation ingestion is connected through the shared gateway contract." />} />
        <Route path="customers/:id" element={<PartialPage title="Customer" description="Customer timeline, objections, trade, appointment, priority, and AI draft fields are represented in the normalized schema." />} />
        <Route path="tasks" element={<PartialPage title="Tasks" description="Priority and approval tasks are ready for workflow-created opportunities and alerts." />} />
        <Route path="marketplace" element={<PartialPage title="Marketplace" description="Facebook draft/live behavior is preserved behind an approval-gated Local Agent connector; Craigslist and OfferUp are recording skeletons." />} />
        <Route path="bank-brain" element={<PartialPage title="Bank Brain" description="RouteOne imports and rebuild scripts are preserved. Extracted lender rules require human review and approved versioning." />} />
        <Route path="connectors" element={<ConnectorsPage />} />
        <Route path="connectors/:connectorId" element={<ConnectorDetailPage />} />
        <Route path="settings" element={<PartialPage title="Settings" description="Device registration, connector enablement, and environment-backed service configuration belong here." />} />
      </Route>
      <Route path="/legacy/*" element={<AppShell />} />
    </>,
  ),
);
