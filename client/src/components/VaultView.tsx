/**
 * The vault.
 *
 * One screen holding what the course pays out: practice marks, super keys, and
 * the password to the blocker. The key is the only part that is gated — it
 * shows once the day's check has been passed, and not before.
 *
 * The handover is the fiddly part and it gets its own panel, because the app
 * cannot see the blocker. A new key is generated here, someone else types it
 * into the blocker, and only when that is confirmed does it become the
 * password. Until then the old one still opens things.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Copy, KeyRound, Lock, RefreshCw, Sparkles, Zap } from "lucide-react";

import { SlyFox } from "./Sly";
import { localDayKey } from "../lib/screenTimeUsage";
import {
  DEFAULT_BAR, HOLD_CAP, HOLD_DAYS, awardPerfect, canStartHold, cancelNext, carryOver,
  daysUntilDue, holdDaysLeft, isDue, isOpen, noteOpened, opensInLast, prepareNext, runningHold,
  startHold, vaultLine, type LessonResult, type Vault,
} from "../lib/vault";
import { loadVault, saveVault } from "../lib/vaultStore";

const cn = (...parts: Array<string | false | undefined>) => parts.filter(Boolean).join(" ");

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* Clipboard can be refused; the key is on screen to be typed either way. */
    }
    setCopied(true);
  };
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <button className="vault-copy" onClick={copy} aria-label={label}>
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

export function VaultView({
  xp,
  result,
  courseDay,
  today = localDayKey(),
}: {
  xp: number;
  result?: LessonResult;
  courseDay: number;
  today?: string;
}) {
  const [vault, setVault] = useState<Vault>(() => loadVault(today));
  const update = useCallback((next: Vault) => {
    setVault(next);
    saveVault(next);
  }, []);

  // A perfect day banks its hold the first time the vault is looked at.
  useEffect(() => {
    const banked = awardPerfect(vault, today, result);
    if (banked !== vault) update(banked);
  }, [vault, result, today, update]);

  const open = isOpen(vault, result, today, DEFAULT_BAR);
  const [shown, setShown] = useState(false);
  const reveal = () => {
    setShown(true);
    update(noteOpened(vault, today));
  };

  const line = useMemo(() => vaultLine(vault, result, today, courseDay), [vault, result, today, courseDay]);
  const until = daysUntilDue(vault, today);
  const due = isDue(vault, today);
  const startable = canStartHold(vault, result, today, DEFAULT_BAR);
  const running = runningHold(vault, today);
  const leftOnHold = holdDaysLeft(vault, today);

  return (
    <section className="vault-view">
      <section className="view-heading">
        <div>
          <span className="eyebrow">THE VAULT</span>
          <h1>What the work<br /><em>pays out.</em></h1>
          <p>Marks, hold keys, and the password to the blocker. The key opens once the day is passed.</p>
        </div>
      </section>

      <section className="vault-balances">
        <article className="paper-card vault-balance">
          <div className="mini-icon gold"><Zap aria-hidden="true" /></div>
          <div><span className="label">PRACTICE MARKS</span><h3>{xp}</h3><p>Evidence of learning put into action.</p></div>
        </article>
        <article className="paper-card vault-balance">
          <div className="mini-icon"><Sparkles aria-hidden="true" /></div>
          <div>
            <span className="label">HOLD KEYS</span>
            <h3>{vault.holds.length}<small> / {HOLD_CAP}</small></h3>
            <p>
              A perfect check banks {HOLD_DAYS.perfect} days of cover, a recheck {HOLD_DAYS.recheck}.
              Start one and the vault stays open without passing.
            </p>
          </div>
        </article>
      </section>

      <article className={cn("paper-card vault-door", open && "is-open")}>
        <div className="vault-sly"><SlyFox mood={open ? "pleased" : "watching"} /><p>{line}</p></div>

        {open ? (
          <div className="vault-key-panel">
            {shown ? (
              <>
                <span className="label">THE PASSWORD</span>
                <p className="vault-key" aria-label={`Password: ${vault.key.split("").join(" ")}`}>{vault.key}</p>
                <CopyButton value={vault.key} label="Copy the password" />
              </>
            ) : (
              <button className="primary-button" onClick={reveal}>
                <KeyRound aria-hidden="true" /> Show the key
              </button>
            )}
          </div>
        ) : (
          <div className="vault-key-panel locked">
            <div className="vault-locked-mark"><Lock aria-hidden="true" /></div>
            <p className="vault-locked-note">Finish day {courseDay} and pass its check at {Math.round(DEFAULT_BAR * 100)}%.</p>
            {startable && (
              <div className="vault-holds">
                {vault.holds.map((hold, index) => (
                  <button
                    key={`${hold.source}-${index}`}
                    className="secondary-button"
                    onClick={() => update(startHold(vault, index, today, result))}
                  >
                    <Sparkles aria-hidden="true" /> Use a {hold.days}-day hold ({hold.source === "perfect" ? "perfect check" : "recheck"})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <footer className="vault-meta">
          <span>
            {running
              ? `Held open — ${leftOnHold} day${leftOnHold === 1 ? "" : "s"} left`
              : `Opened ${opensInLast(vault, today)} of the last 7 days`}
          </span>
          {vault.rotationDays === null
            ? <span>Key is not on rotation</span>
            : <span>{due ? "New key due now" : `New key in ${until} day${until === 1 ? "" : "s"}`}</span>}
        </footer>
      </article>

      <article className={cn("paper-card vault-handover", (due || Boolean(vault.next)) && "is-due")}>
        <span className="eyebrow">MAKE A NEW KEY</span>
        <h2>Change the password.</h2>
        <p>
          Eight digits gets memorised fast, so it is replaced every week. Generate one here, have whoever
          set the blocker up enter it, then confirm — the old key keeps working until you do.
        </p>

        {vault.next ? (
          <div className="vault-next">
            <span className="label">WAITING TO BE ENTERED</span>
            <p className="vault-key" aria-label={`New password: ${vault.next.split("").join(" ")}`}>{vault.next}</p>
            <CopyButton value={vault.next} label="Copy the new password" />
            <div className="vault-next-actions">
              <button className="primary-button" onClick={() => update(carryOver(vault, today))}>
                <Check aria-hidden="true" /> It is in the blocker
              </button>
              <button className="backup-secondary" onClick={() => update(cancelNext(vault))}>Discard it</button>
            </div>
          </div>
        ) : (
          <button className="secondary-button" onClick={() => update(prepareNext(vault))}>
            <RefreshCw aria-hidden="true" /> Generate the next key
          </button>
        )}
      </article>

      <p className="vault-honest">
        This is friction, not security. Once a key has been shown it can be written down, and nothing
        here stops that — replacing it weekly is what keeps a copy from being worth much.
      </p>
    </section>
  );
}
