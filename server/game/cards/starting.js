// Starting deck: 6 Burgle, 2 Stumble, 1 Sidestep, 1 Scramble (per player)
export default [
  { id: 'burgle', name: 'Burgle', kind: 'companion', tags: ['action'], qty: 6, cost: 0, points: 0, text: '+1 Skill', play: [{ skill: 1 }] },
  { id: 'stumble', name: 'Stumble', kind: 'companion', tags: ['action'], qty: 2, cost: 0, points: 0, text: '+1 Clank!', play: [{ clank: 1 }] },
  { id: 'sidestep', name: 'Sidestep', kind: 'companion', tags: ['action'], qty: 1, cost: 0, points: 0, text: '+1 Boot', play: [{ boots: 1 }] },
  { id: 'scramble', name: 'Scramble', kind: 'companion', tags: ['action'], qty: 1, cost: 0, points: 0, text: '+1 Skill. +1 Boot', play: [{ skill: 1, boots: 1 }] },
];
