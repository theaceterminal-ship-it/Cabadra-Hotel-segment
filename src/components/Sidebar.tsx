import React from 'react';
import { ChevronsLeft, ChevronsRight, LogOut } from 'lucide-react';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Small count badge, e.g. open requests — omit or 0 hides it. */
  badge?: number;
}

interface SidebarProps {
  title: string;
  navItems: SidebarNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSignOut: () => void;
}

/**
 * A collapsible left nav — the single source of navigation for a page,
 * replacing a top tab bar. Collapsed state persists per-browser via
 * localStorage (see ReceptionApp) since it's a per-user layout preference,
 * not app state anyone else needs to see.
 */
export const Sidebar: React.FC<SidebarProps> = ({ title, navItems, activeId, onNavigate, collapsed, onToggleCollapsed, onSignOut }) => {
  return (
    <aside
      className={`shrink-0 h-screen sticky top-0 bg-white border-r border-[#E9ECEF] flex flex-col transition-[width] duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className={`h-14 flex items-center border-b border-[#E9ECEF] shrink-0 ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && <span className="font-bold text-[#765a25] truncate">{title}</span>}
        <button
          onClick={onToggleCollapsed}
          className="h-8 w-8 shrink-0 flex items-center justify-center rounded-lg text-[#7f7668] hover:bg-[#ecf5fe] hover:text-[#765a25] transition-colors"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 py-3 px-2 space-y-1 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 rounded-lg text-sm font-semibold transition-colors ${
                collapsed ? 'justify-center h-11' : 'px-3 h-11'
              } ${active ? 'bg-[#fff8ec] text-[#765a25]' : 'text-[#4e463a] hover:bg-[#ecf5fe]'}`}
            >
              <span className="relative shrink-0">
                <Icon className="w-4 h-4" />
                {!!item.badge && (
                  <span className={`absolute -top-1.5 flex items-center justify-center rounded-full bg-[#BC4749] text-white font-bold ${
                    collapsed ? '-right-1.5 min-w-[14px] h-3.5 text-[8px] px-0.5' : '-right-1.5 min-w-[16px] h-4 text-[9px] px-1'
                  }`}>
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}
              </span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>

      <div className="p-2 border-t border-[#E9ECEF] shrink-0">
        <button
          onClick={onSignOut}
          title={collapsed ? 'Sign out' : undefined}
          className={`w-full flex items-center gap-3 rounded-lg text-sm font-semibold text-[#7f7668] hover:bg-[#ecf5fe] hover:text-[#141d23] transition-colors ${
            collapsed ? 'justify-center h-11' : 'px-3 h-11'
          }`}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
};
