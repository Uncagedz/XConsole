import { createBrowserRouter, createRoutesFromElements, Route } from 'react-router-dom';
import { AppShell } from './App';
import BankBrainApp from './features/bankBrain/BankBrainApp';
import { isOn } from './flags';

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<AppShell />} />
      <Route path="/legacy/*" element={<AppShell />} />
      {isOn('salesAssistantV2') && <Route path="/banks-brain" element={<BankBrainApp />} />}
    </>,
  ),
  { basename: '/admin' },
);
