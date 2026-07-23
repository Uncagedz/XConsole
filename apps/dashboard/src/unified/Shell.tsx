import { NavLink, Outlet } from 'react-router-dom';
import './unified.css';

const navigation = [
  ['/dashboard', 'Dashboard'],
  ['/inventory', 'Inventory'],
  ['/leads', 'Leads'],
  ['/tasks', 'Tasks'],
  ['/marketplace', 'Marketplace'],
  ['/bank-brain', 'Bank Brain'],
  ['/connectors', 'Connectors'],
  ['/settings', 'Settings'],
] as const;

export function UnifiedShell() {
  return (
    <div className="ux-shell">
      <aside className="ux-sidebar">
        <div className="ux-brand">
          <span className="ux-brand-mark">X</span>
          <div><strong>XConsole</strong><small>Personal dealership OS</small></div>
        </div>
        <nav>
          {navigation.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/legacy" className="ux-legacy-link">Legacy command center</NavLink>
      </aside>
      <main className="ux-main"><Outlet /></main>
    </div>
  );
}
