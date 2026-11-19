/**
 * Visual-only "Updating…" badge for a panel whose result belongs to an older circuit. It appears
 * after 250 ms (CSS) so quick updates never flicker; assistive tech gets the state from the
 * panel's aria-busy and the app's "Computing…" status, so the badge itself is aria-hidden.
 */
export default function UpdatingBadge() {
  return (
    <span className="updating-badge" aria-hidden="true">
      Updating…
    </span>
  );
}
