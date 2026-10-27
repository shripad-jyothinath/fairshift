import Link from "next/link";
import { LiveStats } from "@/components/LiveStats";
import { ArrowIcon, ChainIcon, LockIcon, ShieldIcon } from "@/components/Icons";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div className="wrap hero-grid">
          <div>
            <p className="eyebrow">FairShift · Decent work, on the record</p>
            <h1 style={{ marginTop: 18 }}>
              The worker&apos;s proof.
              <br />
              The employer&apos;s early warning.
            </h1>
            <p className="lede" style={{ marginTop: 22 }}>
              A hazard report that cannot be traced to a person, quietly deleted,
              or closed with a promise. Workers speak anonymously. Employers get
              seven days of warning instead of a hospital bill. Every action is
              signed and public.
            </p>
            <div className="btn-row" style={{ marginTop: 28 }}>
              <Link className="btn btn-primary btn-lg" href="/worker">
                Report a hazard <ArrowIcon className="w-4" />
              </Link>
              <Link className="btn btn-quiet btn-lg" href="/admin">
                Open employer desk
              </Link>
            </div>
            <div style={{ marginTop: 34 }}>
              <LiveStats />
            </div>
          </div>

          <aside className="hero-seal" aria-label="What makes this different">
            <div className="flex-between">
              <span className="label">Issue dossier</span>
              <span className="stamp stamp-verified">Sealed</span>
            </div>
            <h3 style={{ marginTop: 14 }}>Three things nobody else can do</h3>
            <div className="stack-sm" style={{ marginTop: 16, fontSize: 14 }}>
              <p style={{ margin: 0 }}>
                <strong>1. Prove membership, reveal nobody.</strong> A Groth16
                proof shows the reporter is one of {""}
                <span className="mono">N</span> verified workers — not which one.
              </p>
              <p style={{ margin: 0 }}>
                <strong>2. Count people, not clicks.</strong> Each credential
                produces one nullifier per issue, so five reports means five
                people. No ballot stuffing.
              </p>
              <p style={{ margin: 0 }}>
                <strong>3. Make closure expensive.</strong> Fix it or hold someone
                accountable — in public. High severity needs two signatures.
              </p>
            </div>
            <hr className="rule" />
            <div className="mono small">
              <div className="flex-between">
                <span className="muted">Chain</span>
                <span>SHA-256 / Ed25519</span>
              </div>
              <div className="flex-between" style={{ marginTop: 6 }}>
                <span className="muted">Identity</span>
                <span>Semaphore v4 · BN254</span>
              </div>
              <div className="flex-between" style={{ marginTop: 6 }}>
                <span className="muted">Bodies</span>
                <span>AES-256-GCM</span>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 56 }}>
        <div className="grid-3">
          <Link className="role-card" href="/worker">
            <span className="label">01 · Worker</span>
            <h3>Speak without a name</h3>
            <p>
              Icon-first, voice-ready, three languages. The proof is built on the
              phone. The secret never leaves it.
            </p>
            <span className="arrow">OPEN WORKER CARD →</span>
          </Link>
          <Link className="role-card" href="/admin">
            <span className="label">02 · Employer</span>
            <h3>Show your work</h3>
            <p>
              Triage by SLA, read the sealed detail, publish a fix or a
              disciplinary action. Then ask oversight to countersign.
            </p>
            <span className="arrow">OPEN EMPLOYER DESK →</span>
          </Link>
          <Link className="role-card" href="/ledger">
            <span className="label">03 · Public</span>
            <h3>Check the whole record</h3>
            <p>
              Every event, every signature, every proof. Recompute the chain in
              your browser. Nothing is hidden behind an admin panel.
            </p>
            <span className="arrow">OPEN PUBLIC LEDGER →</span>
          </Link>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 64 }}>
        <div className="grid-2" style={{ alignItems: "start" }}>
          <div>
            <p className="eyebrow">How an issue moves</p>
            <h2 style={{ marginTop: 14 }}>Four steps. No back doors.</h2>
            <div className="steps" style={{ marginTop: 26 }}>
              <div className="step">
                <div>
                  <h3>Enrol a commitment</h3>
                  <p>
                    The employer verifies employment once and adds a public
                    commitment to the site group. The matching secret is generated
                    on the worker&apos;s device.
                  </p>
                </div>
              </div>
              <div className="step">
                <div>
                  <h3>Report with a proof</h3>
                  <p>
                    The phone proves &quot;I am in this group&quot; and derives a
                    nullifier for this issue. The chain stores the proof, the
                    nullifier and a redacted body — never a name.
                  </p>
                </div>
              </div>
              <div className="step">
                <div>
                  <h3>Escalate on evidence</h3>
                  <p>
                    Three unique reporters moves it to the site manager, five to
                    regional, ten to public. An SLA breach escalates it without
                    waiting for a crowd.
                  </p>
                </div>
              </div>
              <div className="step">
                <div>
                  <h3>Close in public</h3>
                  <p>
                    A fix or a disciplinary action must be published with an
                    evidence hash. High severity also needs an independent
                    oversight signature. Otherwise the issue stays open — visibly.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="stack">
            <div className="card card-pad">
              <LockIcon className="w-6" />
              <h3 style={{ marginTop: 12 }}>Anonymity is structural</h3>
              <p className="small muted" style={{ marginTop: 8 }}>
                There is no &quot;anonymous&quot; checkbox. The server verifies a
                zero-knowledge proof and never receives an identity. Even a full
                database leak contains no link from a report to a worker.
              </p>
            </div>
            <div className="card card-pad">
              <ChainIcon className="w-6" />
              <h3 style={{ marginTop: 12 }}>The record cannot be edited</h3>
              <p className="small muted" style={{ marginTop: 8 }}>
                Every event commits to the hash before it. Change one byte and
                every later hash breaks. The public ledger re-verifies the chain
                and every proof on demand.
              </p>
            </div>
            <div className="card card-pad">
              <ShieldIcon className="w-6" />
              <h3 style={{ marginTop: 12 }}>Closure has two exits</h3>
              <p className="small muted" style={{ marginTop: 8 }}>
                Fix the hazard, or hold a role accountable with hashed evidence.
                A third path — quietly marking it resolved — does not exist in the
                event vocabulary.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="wrap" style={{ paddingBottom: 70 }}>
        <div className="card card-pad" style={{ borderTop: "3px solid var(--ink)" }}>
          <div className="flex-between">
            <div>
              <p className="eyebrow">Cross-sector, one engine</p>
              <h2 style={{ marginTop: 12, fontSize: 34 }}>
                Construction rules. Hospital rules. Same ledger.
              </h2>
            </div>
            <span className="stamp">2 sectors live</span>
          </div>
          <div className="grid-3" style={{ marginTop: 24 }}>
            <div>
              <span className="label">Site pack · Construction</span>
              <p className="small" style={{ marginTop: 6 }}>
                Scaffolding, electrical, machinery. Overtime and hazard categories
                mapped to the Factories Act.
              </p>
            </div>
            <div>
              <span className="label">Site pack · Healthcare</span>
              <p className="small" style={{ marginTop: 6 }}>
                Sharps, chemicals, sanitation, retaliation. Shift rotations and
                infection-control categories.
              </p>
            </div>
            <div>
              <span className="label">Why it matters</span>
              <p className="small" style={{ marginTop: 6 }}>
                The same anonymous credential, escalation ladder and closure gate
                run in both. Adoption is a config change, not a rewrite.
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
