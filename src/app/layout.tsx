import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: {
    default: "FairShift — the worker's proof",
    template: "%s · FairShift",
  },
  description:
    "Anonymous, zero-knowledge worker safety reporting. Every issue is public, every closure is signed, and nobody can quietly erase the record.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <Nav />
        <main id="main">{children}</main>
        <footer className="footer">
          <div className="footer-inner">
            <span>FairShift · PromptWars 2026 · SDG 8</span>
            <span>No names, no phone numbers, no identities on chain</span>
            <Link href="/ledger">Verify the ledger yourself →</Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
