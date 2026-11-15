// Companions and equipment (blue banners): go into your deck when acquired.
// Blue-banner cards. Subtype tags are shown on the card and matter for rules
// (e.g. the Rebels check for "another companion in your play area").
const companion = (o) => ({ kind: 'companion', tags: ['companion'], ...o });   // a person or creature
const equipment = (o) => ({ kind: 'companion', tags: ['equipment'], ...o });   // an item
const action = (o) => ({ kind: 'companion', tags: ['action'], ...o });         // a deed; no subtype on the card

const rebelDraw = { when: { otherCompanion: true }, effects: [{ draw: 1 }] };

export default [
  // --- Equipment / items ---
  equipment({ id: 'pickaxe', name: 'Pickaxe', qty: 2, cost: 4, points: 2, text: '+2 Swords. +2 Gold', play: [{ swords: 2, gold: 2 }] }),
  equipment({ id: 'flying_carpet', dragon: true, name: 'Flying Carpet', qty: 2, cost: 6, points: 2,
    text: '+2 Boots. This turn you ignore monsters in tunnels and do not have to stop in Crystal Caves.',
    play: [{ boots: 2 }, { flag: 'ignoreMonsterTunnels' }, { flag: 'ignoreCrystalCaves' }] }),
  equipment({ id: 'elven_boots', name: 'Elven Boots', qty: 2, cost: 4, points: 2, text: '+1 Skill. +1 Boot. Draw a card.', play: [{ skill: 1, boots: 1, draw: 1 }] }),
  equipment({ id: 'elven_dagger', name: 'Elven Dagger', qty: 2, cost: 4, points: 2, text: '+1 Skill. +1 Sword. Draw a card.', play: [{ skill: 1, swords: 1, draw: 1 }] }),
  equipment({ id: 'elven_cloak', name: 'Elven Cloak', qty: 2, cost: 4, points: 2, text: '+1 Skill. -2 Clank!. Draw a card.', play: [{ skill: 1, clank: -2, draw: 1 }] }),
  equipment({ id: 'scepter_of_the_ape_lord', name: 'Scepter of the Ape Lord', qty: 1, cost: 3, points: 3, text: '+3 Skill. +3 Clank!', play: [{ skill: 3, clank: 3 }] }),
  equipment({ id: 'singing_sword', dragon: true, name: 'Singing Sword', qty: 1, cost: 5, points: 2, text: '+3 Skill. +2 Swords. +1 Clank!', play: [{ skill: 3, swords: 2, clank: 1 }] }),
  equipment({ id: 'silver_spear', name: 'Silver Spear', qty: 1, cost: 3, points: 1, text: '+3 Swords. Acquire: +1 Gold.', play: [{ swords: 3 }], acquire: [{ gold: 1 }] }),
  equipment({ id: 'brilliance', dragon: true, name: 'Brilliance', qty: 1, cost: 6, points: 0, text: 'Draw 3 cards.', play: [{ draw: 3 }] }),
  equipment({ id: 'amulet_of_vigor', dragon: true, name: 'Amulet of Vigor', qty: 1, cost: 7, points: 3, text: '+4 Skill. Draw a card.', play: [{ skill: 4, draw: 1 }] }),
  equipment({ id: 'bracers_of_agility', name: 'Bracers of Agility', qty: 1, cost: 5, points: 2, text: 'Draw 2 cards.', play: [{ draw: 2 }] }),

  // --- Companions ---
  companion({ id: 'wizard', dragon: true, name: 'Wizard', qty: 2, cost: 6, points: 2, text: '+3 Skill. Draw a card.', play: [{ skill: 3, draw: 1 }] }),
  companion({ id: 'archaeologist', name: 'Archaeologist', qty: 2, cost: 2, points: 1, text: 'Draw a card. If you have a Monkey Idol, +2 Skill.',
    play: [{ draw: 1 }, { when: { has: 'monkeyIdol' }, effects: [{ skill: 2 }] }] }),
  companion({ id: 'apothecary', name: 'Apothecary', qty: 3, cost: 2, points: 1, text: 'Discard a card to choose one: +3 Swords, +2 Gold, or heal 1.',
    play: [{ discardThen: [{ choose: [
      { label: '+3 Swords', effects: [{ swords: 3 }] },
      { label: '+2 Gold', effects: [{ gold: 2 }] },
      { label: 'Heal 1', effects: [{ heal: 1 }] }] }] }] }),
  companion({ id: 'mister_whiskers', dragon: true, name: 'Mister Whiskers', qty: 2, cost: 1, points: 1, text: 'Choose one: Dragon Attack, or -2 Clank!.',
    play: [{ choose: [{ label: 'Dragon Attack', effects: [{ dragonAttack: true }] }, { label: '-2 Clank!', effects: [{ clank: -2 }] }] }] }),
  companion({ id: 'master_burglar', name: 'Master Burglar', qty: 2, cost: 3, points: 2, text: '+2 Skill. Trash a Burgle.',
    play: [{ skill: 2 }, { trash: { from: ['hand', 'playArea', 'discard'], match: 'burgle', optional: true } }] }),
  companion({ id: 'burglar', name: 'Burglar', qty: 2, cost: 3, points: 1, text: '+2 Skill. +1 Clank!', play: [{ skill: 2, clank: 1 }] }),
  companion({ id: 'tattle', name: 'Tattle', qty: 2, cost: 3, points: 1, text: '+2 Skill. Each other player adds 1 Clank!.', play: [{ skill: 2 }, { othersClank: 1 }] }),
  companion({ id: 'treasure_hunter', dragon: true, name: 'Treasure Hunter', qty: 2, cost: 5, points: 1, text: '+2 Skill. +2 Swords. Replace a card in the Dungeon Row.',
    play: [{ skill: 2, swords: 2 }, { replaceRow: true }] }),
  action({ id: 'underworld_dealing', name: 'Underworld Dealing', qty: 2, cost: 1, points: 1, text: 'Choose one: +1 Gold, or pay 7 Gold to gain two Secret Tomes.',
    play: [{ choose: [{ label: '+1 Gold', effects: [{ gold: 1 }] }, { label: 'Pay 7 Gold: gain 2 Secret Tomes', effects: [{ buyTomes: { gold: 7, count: 2 } }], requires: { gold: 7 } }] }] }),
  action({ id: 'dead_run', dragon: true, name: 'Dead Run', qty: 2, cost: 3, points: 0, text: '+2 Boots. +2 Clank!. You do not have to stop in Crystal Caves this turn.',
    play: [{ boots: 2, clank: 2 }, { flag: 'ignoreCrystalCaves' }] }),
  action({ id: 'sneak', name: 'Sneak', qty: 2, cost: 2, points: 0, text: '+1 Skill. +1 Boot. -2 Clank!', play: [{ skill: 1, boots: 1, clank: -2 }] }),
  action({ id: 'move_silently', name: 'Move Silently', qty: 2, cost: 3, points: 0, text: '+2 Boots. -2 Clank!', play: [{ boots: 2, clank: -2 }] }),
  action({ id: 'search', name: 'Search', qty: 2, cost: 4, points: 1, text: '+2 Skill. +1 Boot. +1 Gold', play: [{ skill: 2, boots: 1, gold: 1 }] }),
  action({ id: 'swagger', name: 'Swagger', qty: 2, cost: 2, points: 0, text: 'For each Clank! you make this turn (including before playing this), +1 Skill.', play: [{ skillPerClank: true }] }),
  action({ id: 'sleight_of_hand', name: 'Sleight of Hand', qty: 2, cost: 2, points: 0, text: 'Discard a card to draw two cards.', play: [{ discardThen: [{ draw: 2 }] }] }),
  companion({ id: 'kobold_merchant', name: 'Kobold Merchant', qty: 2, cost: 3, points: 1, text: '+2 Gold. If you have an Artifact, +2 Skill.',
    play: [{ gold: 2 }, { when: { has: 'artifact' }, effects: [{ skill: 2 }] }] }),
  companion({ id: 'gem_collector', name: 'Gem Collector', qty: 1, cost: 4, points: 2, text: '+2 Skill. -2 Clank!. Gems cost 2 less this turn.', play: [{ skill: 2, clank: -2 }, { gemDiscount: 2 }] }),
  companion({ id: 'dwarven_peddler', name: 'Dwarven Peddler', qty: 1, cost: 4, points: 1,
    text: '+2 Gold. At game end: +4 points if you have two different of: Chalice, Monkey Idol, Dragon Egg.',
    play: [{ gold: 2 }],
    endGamePoints(_, p) {
      const kinds = new Set();
      if (p.secrets.some((s) => s.id === 'chalice')) kinds.add('chalice');
      if (p.secrets.some((s) => s.id === 'dragon_egg')) kinds.add('egg');
      if (p.monkeyIdols > 0) kinds.add('idol');
      return kinds.size >= 2 ? 4 : 0;
    } }),
  companion({ id: 'rebel_captain', name: 'Rebel Captain', qty: 1, cost: 3, points: 1, text: '+2 Skill. If you have another companion in your play area, draw a card.', play: [{ skill: 2 }, rebelDraw] }),
  companion({ id: 'rebel_miner', name: 'Rebel Miner', qty: 1, cost: 2, points: 1, text: '+2 Gold. If you have another companion in your play area, draw a card.', play: [{ gold: 2 }, rebelDraw] }),
  companion({ id: 'rebel_scout', name: 'Rebel Scout', qty: 2, cost: 2, points: 1, text: '+2 Boots. If you have another companion in your play area, draw a card.', play: [{ boots: 2 }, rebelDraw] }),
  companion({ id: 'rebel_soldier', name: 'Rebel Soldier', qty: 2, cost: 2, points: 1, text: '+2 Swords. If you have another companion in your play area, draw a card.', play: [{ swords: 2 }, rebelDraw] }),
  companion({ id: 'the_mountain_king', dragon: true, name: 'The Mountain King', qty: 1, cost: 6, points: 3, text: '+2 Skill. +1 Sword. +1 Boot. If you have a Crown, +1 Sword and +1 Boot.',
    play: [{ skill: 2, swords: 1, boots: 1 }, { when: { has: 'crown' }, effects: [{ swords: 1, boots: 1 }] }] }),
  companion({ id: 'the_queen_of_hearts', dragon: true, name: 'The Queen of Hearts', qty: 1, cost: 6, points: 3, text: '+3 Skill. +1 Sword. If you have a Crown, heal 1.',
    play: [{ skill: 3, swords: 1 }, { when: { has: 'crown' }, effects: [{ heal: 1 }] }] }),
  companion({ id: 'the_duke', dragon: true, name: 'The Duke', qty: 1, cost: 5, points: 2, text: '+2 Skill. +2 Gold. If you have a Crown, +2 Skill.',
    play: [{ skill: 2, gold: 2 }, { when: { has: 'crown' }, effects: [{ skill: 2 }] }] }),
  companion({ id: 'invoker_of_the_ancients', name: 'Invoker of the Ancients', qty: 1, cost: 3, points: 1, text: '+1 Skill. +1 Sword. If you have a Chalice, +2 Skill.',
    play: [{ skill: 1, swords: 1 }, { when: { has: 'chalice' }, effects: [{ skill: 2 }] }] }),
  companion({ id: 'tunnel_guide', name: 'Tunnel Guide', qty: 2, cost: 1, points: 1, text: '+1 Sword. +1 Boot', play: [{ swords: 1, boots: 1 }] }),
];
