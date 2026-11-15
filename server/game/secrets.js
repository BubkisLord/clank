// Secret tokens, straight from the rulebook's Field Reference Guide.
// use: 'immediate' = resolved when picked up; 'held' = kept and used on your turn; 'keep' = kept for points/gold.
export const MAJOR_SECRETS = [
  { id: 'potion_of_greater_healing', name: 'Potion of Greater Healing', qty: 2, use: 'held', text: 'Use during your turn to heal 2 damage.', effects: [{ heal: 2 }] },
  { id: 'greater_skill_boost', name: 'Greater Skill Boost', qty: 2, use: 'immediate', text: 'Immediately gain 5 Skill.', effects: [{ skill: 5 }] },
  { id: 'greater_treasure', name: 'Greater Treasure', qty: 2, use: 'keep', gold: 5, text: 'Counts as 5 Gold.' },
  { id: 'flash_of_brilliance', name: 'Flash of Brilliance', qty: 2, use: 'immediate', text: 'Immediately draw three cards.', effects: [{ draw: 3 }] },
  { id: 'chalice', name: 'Chalice', qty: 3, use: 'keep', points: 7, text: 'Worth 7 points at the end of the game.' },
];

export const MINOR_SECRETS = [
  { id: 'potion_of_healing', name: 'Potion of Healing', qty: 2, use: 'held', text: 'Use during your turn to heal 1 damage.', effects: [{ heal: 1 }] },
  { id: 'potion_of_swiftness', name: 'Potion of Swiftness', qty: 2, use: 'held', text: 'Use during your turn to gain 1 Boot.', effects: [{ boots: 1 }] },
  { id: 'potion_of_strength', name: 'Potion of Strength', qty: 2, use: 'held', text: 'Use during your turn to gain 2 Swords.', effects: [{ swords: 2 }] },
  { id: 'skill_boost', name: 'Skill Boost', qty: 3, use: 'immediate', text: 'Immediately gain 2 Skill.', effects: [{ skill: 2 }] },
  { id: 'treasure', name: 'Treasure', qty: 3, use: 'keep', gold: 2, text: 'Counts as 2 Gold.' },
  { id: 'magic_spring', name: 'Magic Spring', qty: 3, use: 'immediate', text: 'Trash a card from your discard pile or play area.', effects: [{ trash: { from: ['playArea', 'discard'], optional: true } }] },
  { id: 'dragon_egg', name: 'Dragon Egg', qty: 3, use: 'keep', points: 3, text: 'Worth 3 points. Advance the Dragon marker one space.', onPickup: 'rage' },
];

export const SECRET_DEFS = Object.fromEntries([...MAJOR_SECRETS, ...MINOR_SECRETS].map((s) => [s.id, s]));

export function buildSecretStack(list) {
  const out = [];
  for (const s of list) for (let i = 0; i < s.qty; i++) out.push({ id: s.id, major: list === MAJOR_SECRETS });
  return out;
}

export function publicSecretDefs() {
  const o = {};
  for (const [id, s] of Object.entries(SECRET_DEFS)) o[id] = { id, name: s.name, text: s.text, use: s.use, points: s.points || 0, gold: s.gold || 0 };
  return o;
}
