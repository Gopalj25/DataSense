import { LayoutDashboard, Table, Columns3, Settings } from 'lucide-react';

export type ViewType = 'dashboard' | 'table' | 'schema';

interface SidebarProps {
    activeView: ViewType;
    onViewChange: (view: ViewType) => void;
    hasData: boolean;
}

const navItems: { id: ViewType; icon: typeof LayoutDashboard; label: string }[] = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'table',     icon: Table,           label: 'Data Table' },
    { id: 'schema',    icon: Columns3,        label: 'Schema' },
];

export default function Sidebar({ activeView, onViewChange, hasData }: SidebarProps) {
    return (
        <aside className="fixed left-0 top-12 bottom-0 w-[52px] flex flex-col items-center py-4 gap-1 border-r z-30"
               style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>
            {/* Nav items */}
            <div className="flex flex-col gap-1 flex-1">
                {navItems.map(item => {
                    const Icon = item.icon;
                    const active = activeView === item.id;
                    const disabled = !hasData && item.id !== 'dashboard';
                    return (
                        <button
                            key={item.id}
                            onClick={() => !disabled && onViewChange(item.id)}
                            disabled={disabled}
                            title={item.label}
                            className="relative w-9 h-9 rounded-lg flex items-center justify-center transition-all group"
                            style={{
                                background: active ? 'var(--bg-elevated)' : 'transparent',
                                color: active ? 'var(--text-primary)' : disabled ? 'var(--text-muted)' : 'var(--text-muted)',
                                cursor: disabled ? 'not-allowed' : 'pointer',
                                opacity: disabled ? 0.4 : 1,
                            }}
                        >
                            {/* Active indicator */}
                            {active && (
                                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 rounded-r"
                                      style={{ background: 'var(--accent)' }} />
                            )}
                            <Icon size={18} style={{ color: active ? 'var(--accent-text)' : undefined }} />
                        </button>
                    );
                })}
            </div>

            {/* Bottom: Settings */}
            <button
                title="Settings"
                className="w-9 h-9 rounded-lg flex items-center justify-center transition-all"
                style={{ color: 'var(--text-muted)' }}
            >
                <Settings size={18} />
            </button>
        </aside>
    );
}
