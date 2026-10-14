export type CanonicalAliasCard = { display_name: string; aliases: string[] };

function normalizeAlias(value: unknown) {
  return String(value ?? "").trim().slice(0, 160).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Pure canonical alias resolver. It only returns a card when a declared alias matches. */
export function resolveCanonicalAlias<T extends CanonicalAliasCard>(value: unknown, card: T): T | null {
  const requested = normalizeAlias(value);
  if (!requested) return null;
  const accepted = [card.display_name, ...card.aliases].map(normalizeAlias);
  return accepted.includes(requested) ? card : null;
}
