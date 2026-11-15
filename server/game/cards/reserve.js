// Reserve cards (always available, limited supply) + the Goblin
export default [
  { id: 'mercenary', name: 'Mercenary', kind: 'companion', reserve: true, qty: 15, cost: 2, points: 0, text: '+1 Skill. +2 Swords', play: [{ skill: 1, swords: 2 }] },
  { id: 'explore', name: 'Explore', kind: 'companion', reserve: true, qty: 15, cost: 3, points: 0, text: '+2 Skill. +1 Boot', play: [{ skill: 2, boots: 1 }] },
  { id: 'secret_tome', name: 'Secret Tome', kind: 'companion', reserve: true, qty: 12, cost: 7, points: 7, text: 'Does nothing when played. Worth 7 points.', play: [] },
  { id: 'goblin', name: 'Goblin', kind: 'monster', reserve: true, persistent: true, qty: 1, swords: 2, points: 0, text: 'Defeat: +1 Gold. (Not discarded; may be fought repeatedly.)', defeat: [{ gold: 1 }] },
];
