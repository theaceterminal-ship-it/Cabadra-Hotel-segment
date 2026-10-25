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
    <aside className="hidden md:flex shrink-0 h-screen sticky top-0 w-20 bg-surface flex-col items-center py-5 gap-6">
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

/**
 * The same navigation on a phone: a bottom tab bar with the screens the
 * desk uses most, and "More" for the rest (plus the theme switch and sign
 * out) in a sheet. The rail above is hidden at that width.
 */
export function MobileNav({ navItems, primaryIds, activeId, onNavigate, onSignOut, extra }: SidebarProps & {
  /** Up to four items that get their own tab; the rest go under More. */
  primaryIds: string[];
  /** Shown at the top of the More sheet (the theme switch). */
  extra?: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const primary = primaryIds.map(id => navItems.find(i => i.id === id)).filter(Boolean) as SidebarNavItem[];
  const rest = navItems.filter(i => !primaryIds.includes(i.id));
  const moreActive = rest.some(i => i.id === activeId);
  const moreBadge = rest.reduce((n, i) => n + (i.badge ?? 0), 0);

  const Tab = ({ item, onClick, active }: { item: Pick<SidebarNavItem, 'label' | 'icon' | 'badge'>; onClick: () => void; active: boolean }) => (
    <button onClick={onClick} aria-current={active ? 'page' : undefined} className="flex-1 min-w-0 flex flex-col items-center gap-0.5 pt-2 pb-1">
      <span className={`relative h-8 w-14 rounded-full flex items-center justify-center transition-colors ${active ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
        <item.icon className="size-[18px]" />
        {!!item.badge && (
          <span className="absolute -top-1 right-1.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-room-ready text-room-ready-on font-semibold text-[9px] px-1">{item.badge > 9 ? '9+' : item.badge}</span>
        )}
      </span>
      <span className={`text-[11px] truncate max-w-full ${active ? 'font-semibold text-on-surface' : 'text-on-surface-variant'}`}>{item.label}</span>
    </button>
  );

  return (
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-outline-variant flex px-1" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {primary.map(item => <Tab key={item.id} item={item} active={item.id === activeId} onClick={() => onNavigate(item.id)} />)}
        <Tab item={{ label: 'More', icon: MoreIcon, badge: moreBadge }} active={moreActive || open} onClick={() => setOpen(true)} />
      </nav>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/40 flex items-end" onClick={() => setOpen(false)}>
          <div className="w-full bg-surface-container-lowest text-on-surface rounded-t-[28px] p-4 pb-6 space-y-4" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 rounded-full bg-outline-variant mx-auto" />
            {extra && <div className="flex justify-center">{extra}</div>}
            <div className="grid grid-cols-3 gap-2">
              {rest.map(item => {
                const Icon = item.icon;
                const active = item.id === activeId;
                return (
                  <button key={item.id} onClick={() => { onNavigate(item.id); setOpen(false); }} className={`relative rounded-[20px] p-3 flex flex-col items-center gap-1.5 text-center ${active ? 'bg-primary text-on-primary' : 'bg-surface-container-low'}`}>
                    <Icon className="size-5" />
                    <span className="text-xs font-medium leading-tight">{item.label}</span>
                    {!!item.badge && <span className="absolute top-2 right-2 min-w-[16px] h-4 rounded-full bg-room-ready text-room-ready-on text-[9px] font-semibold px-1 flex items-center justify-center">{item.badge}</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={onSignOut} className="w-full h-11 rounded-full bg-surface-container-low text-sm font-medium inline-flex items-center justify-center gap-2"><LogOut className="size-4" /> Sign out</button>
          </div>
        </div>
      )}
    </>
  );
}

function MoreIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" />
    </svg>
  );
}
