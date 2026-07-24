import { Navigate, createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { CommandCenterPage } from './unified/CommandCenterPage';
import { UnifiedShell } from './unified/Shell';

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

const redirects = [
  'inventory',
  'inventory/:vin',
  'leads',
  'customers/:id',
  'tasks',
  'marketplace',
  'messenger',
  'bank-brain',
  'connectors',
  'connectors/:connectorId',
  'settings',
  'legacy/*',
];

export const router = createBrowserRouter(
  createRoutesFromElements(
    <Route path="/" element={<UnifiedShell />}>
      <Route index element={<Navigate to="/dashboard" replace />} />
      <Route path="dashboard" element={<CommandCenterPage />} />
      {redirects.map((path) => (
        <Route key={path} path={path} element={<Navigate to="/dashboard" replace />} />
      ))}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Route>,
  ),
);
