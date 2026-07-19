import type { ReactNode } from "react";

interface NavItem {
  id: string;
  label: string;
  icon: string;
}

interface ShellProps {
  children: ReactNode;
  navItems?: NavItem[];
  activeView?: string;
  onNavigate?: (id: string) => void;
}

export function Shell({ children, navItems = [], activeView, onNavigate }: ShellProps) {
  return (
    <>
      {/* ── Desktop ── */}
      <div className="hidden md:flex h-screen">
        <aside
          className="flex flex-col border-r h-full shrink-0"
          style={{ width: "17rem", borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <div className="p-6 font-bold text-xl" style={{ fontFamily: "Fraunces, serif", color: "var(--ink)" }}>
            PetDo 🐾
          </div>

          <nav className="flex-1 px-3 flex flex-col gap-1">
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate?.(item.id)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors w-full"
                  style={{
                    background: active ? "var(--accent)" : "transparent",
                    color: active ? "#fff" : "var(--ink)",
                  }}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="p-4 text-xs" style={{ color: "var(--muted)" }}>
            <a
              href="https://freeappstore.online"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
              style={{ color: "var(--muted)" }}
            >
              Part of FreeAppStore — free forever
            </a>
          </div>
        </aside>

        <main className="flex-1 overflow-auto p-8">{children}</main>
      </div>

      {/* ── Mobile ── */}
      <div className="flex flex-col h-screen md:hidden">
        <header
          className="flex items-center px-4 h-14 border-b shrink-0"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          <span className="font-bold text-lg" style={{ fontFamily: "Fraunces, serif" }}>
            PetDo 🐾
          </span>
        </header>

        <main className="flex-1 overflow-auto p-4">{children}</main>

        {navItems.length > 0 && (
          <nav
            className="flex items-center justify-around h-16 border-t shrink-0"
            style={{ borderColor: "var(--line)", background: "var(--dock)" }}
          >
            {navItems.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate?.(item.id)}
                  className="flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-colors"
                  style={{ color: active ? "var(--accent)" : "var(--muted)" }}
                >
                  <span className="text-xl">{item.icon}</span>
                  <span className="text-[10px] font-semibold">{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </>
  );
}
