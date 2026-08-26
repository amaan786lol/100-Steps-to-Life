/**
 * Where the vault is kept.
 *
 * vault.ts is pure so it can be reasoned about and tested. This is the thin
 * layer that puts it in local storage, and it exists because two places write
 * to the vault: the vault screen, and the recheck — which banks a hold key from
 * somewhere else entirely.
 */
import { VAULT_STORAGE_KEY, awardHold, newVault, type Vault } from "./vault";

/**
 * Read the vault, filling in anything an older shape is missing rather than
 * discarding it. Losing the stored key would mean reinstalling the blocker to
 * get back in, so a partial record is always repaired, never replaced.
 */
export function loadVault(today: string): Vault {
  try {
    const raw = window.localStorage.getItem(VAULT_STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Partial<Vault>;
      if (typeof stored.key === "string" && stored.key.length > 0) {
        return {
          key: stored.key,
          since: stored.since ?? today,
          next: stored.next ?? null,
          rotationDays: stored.rotationDays === undefined ? 7 : stored.rotationDays,
          length: stored.length ?? stored.key.length,
          openedOn: stored.openedOn ?? [],
          holds: stored.holds ?? [],
          active: stored.active ?? null,
          earnedOn: stored.earnedOn ?? [],
        };
      }
    }
  } catch {
    /* A corrupt entry should not stop the screen rendering. */
  }
  return newVault(today);
}

export function saveVault(vault: Vault): void {
  try {
    window.localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch {
    /* A full store should not take the vault down. */
  }
}

/**
 * Bank the hold a passed recheck earns. Called from the recheck screen, which
 * has no other reason to know the vault exists.
 */
export function bankRecheckHold(today: string): Vault {
  const banked = awardHold(loadVault(today), today, "recheck");
  saveVault(banked);
  return banked;
}
