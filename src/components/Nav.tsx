"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/worker", label: "Worker" },
  { href: "/admin", label: "Employer desk" },
  { href: "/ledger", label: "Public ledger" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="brand" href="/">
          <span className="seal-mark" aria-hidden="true">
            FS
          </span>
          FairShift
        </Link>
        <span className="net-chip" aria-label="Network: devnet, theme: SDG 8">
          DEVNET · SDG 8
        </span>
        <nav className="nav-links" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="nav-link"
              data-active={pathname.startsWith(link.href)}
              aria-current={pathname.startsWith(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
