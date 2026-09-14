import React from 'react';
import { LogOut } from 'lucide-react';

export interface SidebarNavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Small count badge, e.g. open requests — omit or 0 hides it. */
  badge?: number;
}

interface SidebarProps {
  navItems: SidebarNavItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  onSignOut: () => void;
}

/**
 * The icon-only rail from the TimeFrame reference — a fixed-width column
 * of rounded circular icon buttons, active one filled solid, logo mark at
 * top, sign-out at the bottom. Replaces the old collapsible text-label
 * sidebar entirely: this design has no expanded state, on purpose — it's
 * meant to stay this narrow always, same as the reference.
 */
export const Sidebar: React.FC<SidebarProps> = ({ navItems, activeId, onNavigate, onSignOut }) => {
  return (
    <aside className="shrink-0 h-screen sticky top-0 w-20 bg-surface flex flex-col items-center py-5 gap-6">
      <div className="w-10 h-10 rounded-full border-2 border-on-surface-strong-muted flex items-center justify-center shrink-0" title="Cabadra">
        <span className="w-2.5 h-2.5 rounded-full bg-on-surface-strong-muted" />
      </div>

      <nav className="flex-1 flex flex-col items-center gap-2">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              className={`relative w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                active ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-strong-muted hover:bg-primary-container/30 hover:text-on-surface-strong'
              }`}
            >
              <Icon className="w-4.5 h-4.5" />
              {!!item.badge && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-error text-on-error font-bold text-[9px] px-1">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <button
        onClick={onSignOut}
        title="Sign out"
        className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-on-surface-strong-muted hover:bg-primary-container/30 hover:text-on-surface-strong transition-colors"
      >
        <LogOut className="w-4.5 h-4.5" />
      </button>
    </aside>
  );
};
