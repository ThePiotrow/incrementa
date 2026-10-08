import type { GameContent } from '@incrementa/mechanics';

/** The maker creates mines continuously; every mine produces ore from its moment of creation. */
export const factoryContent = {
  id: 'factory', rulesVersion: '1',
  resources: [{ id: 'coins', initialAmount: '1000' }, { id: 'ore', initialAmount: '0' }],
  producers: [
    {
      id: 'maker', initialOwned: '1', tags: ['industrial'],
      production: { type: 'continuous', outputs: [{ target: { type: 'producer', id: 'mine' }, amountPerSecondPerUnit: '1' }] },
    },
    {
      id: 'mine', initialOwned: '0', tags: ['industrial', 'mining'], category: 'extractor',
      purchase: { costs: [{ resourceId: 'coins', amount: '50' }], scaling: { type: 'geometric', factor: '1.15' } },
      production: { type: 'continuous', outputs: [{ target: { type: 'resource', id: 'ore' }, amountPerSecondPerUnit: '1' }] },
    },
  ],
  upgrades: [{ id: 'better-mines', modifiers: [{ target: { kind: 'producer', tags: { all: ['mining'], none: [] }, stat: 'outputMultiplier' }, operation: 'multiply', value: '2' }] }],
  collectibles: [
    { id: 'gold-trophy', tags: ['trophy'], modifiers: [{ target: { kind: 'producer', id: 'mine', stat: 'outputMultiplier' }, operation: 'multiply', value: '2' }] },
    { id: 'silver-trophy', tags: ['trophy'], modifiers: [{ target: { kind: 'producer', id: 'mine', stat: 'outputMultiplier' }, operation: 'add', value: '1' }] },
  ],
  initialItems: [{ id: 'gold-001', definitionId: 'gold-trophy' }, { id: 'silver-001', definitionId: 'silver-trophy' }],
  slotGroups: [{ id: 'trophies', baseCapacity: 1, maxCapacity: 2, acceptTags: ['trophy'] }],
  nodes: [
    { id: 'mining', costs: [{ resourceId: 'ore', amount: '10' }], rewards: [{ type: 'upgrade', upgradeId: 'better-mines' }] },
    { id: 'display', requires: ['mining'], costs: [{ resourceId: 'ore', amount: '20' }], rewards: [{ type: 'slots', groupId: 'trophies', count: 1 }] },
  ],
} satisfies GameContent;
