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
 * The icon-only rail: a narrow column of round icon buttons on the page's
 * own background, the active one filled ink like the website's pill
 * buttons, the Cabadra mark at the top and sign-out at the bottom. It has no
 * expanded state on purpose; each button names itself on hover.
 */
export const Sidebar: React.FC<SidebarProps> = ({ navItems, activeId, onNavigate, onSignOut }) => {
  return (
    <aside className="shrink-0 h-screen sticky top-0 w-20 bg-surface flex flex-col items-center py-5 gap-6">
      <div className="size-11 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0 text-lg font-semibold tracking-[-0.03em]" title="Cabadra">
        C
      </div>

      <nav className="flex-1 flex flex-col items-center gap-1.5 overflow-y-auto">
        {navItems.map(item => {
          const Icon = item.icon;
          const active = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
              className={`relative size-11 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                active ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface'
              }`}
            >
              <Icon className="size-[18px]" />
              {!!item.badge && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-room-ready text-room-ready-on font-semibold text-[10px] px-1">
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
        aria-label="Sign out"
        className="size-11 shrink-0 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-lowest hover:text-on-surface transition-colors"
      >
        <LogOut className="size-[18px]" />
      </button>
    </aside>
  );
};
