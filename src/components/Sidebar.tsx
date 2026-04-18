"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

type NavItem = { href: string; label: string };

const items: NavItem[] = [
  { href: "/dashboard", label: "Projects" },
];

export function Sidebar({ userName, userEmail }: { userName?: string | null; userEmail?: string | null }) {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 bg-white flex flex-col">
      <div className="px-5 py-5 border-b border-gray-200">
        <Link href="/dashboard" className="text-xl font-semibold tracking-tight">
          Tellform
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-3 py-2 rounded-md text-sm transition ${
                active
                  ? "bg-gray-100 text-gray-900 font-medium"
                  : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200">
        <div className="text-sm text-gray-900 truncate">{userName ?? "—"}</div>
        <div className="text-xs text-gray-500 truncate">{userEmail ?? ""}</div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-3 text-xs text-gray-500 hover:text-gray-900 transition"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
