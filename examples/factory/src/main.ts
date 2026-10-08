import { decoratedModule } from '@incrementa/decorators';
import { createGame, explainProduction } from '@incrementa/mechanics';
import type { GameDefinition, GameState } from '@incrementa/mechanics';
import { LocalRuntime, MemoryGameRepository } from '@incrementa/runtime-local';
import { FactoryActions } from './actions.js';
import type { FactoryActionsCatalog } from './actions.js';
import { factoryContent } from './content.js';

// JSON and typed authoring use exactly the same assembly path.
const definition: unknown = JSON.parse(JSON.stringify(factoryContent));
const engine = createGame<FactoryActionsCatalog>(definition, {
  extensions: [decoratedModule<GameState, GameDefinition>(new FactoryActions())],
});
const repository = new MemoryGameRepository();
let now = 0;
const clock = { now: () => now };
const client = await LocalRuntime.open({ engine, clock, repository, key: 'player-1' });

const print = (label: string) => console.log(label, JSON.stringify({
  time: client.snapshot.time, resources: client.snapshot.resources,
  mines: client.snapshot.producers['mine'], equipment: client.snapshot.equipment,
}));

await client.dispatch('factory.gather', { amount: '10' });
await client.dispatch('producer.buy', { producerId: 'mine', quantity: 2 });
now = 10_000;
await client.advance();
print('10 seconds: 2 purchased + 10 generated mines; 70 ore');

await client.dispatch('progression.acquire', { nodeId: 'mining' });
await client.dispatch('equipment.equip', { groupId: 'trophies', slot: 0, instanceId: 'gold-001' });
console.log('Locked second slot:', engine.availability(client.snapshot, 'equipment.equip', { groupId: 'trophies', slot: 1, instanceId: 'silver-001' }));
await client.dispatch('progression.acquire', { nodeId: 'display' });
await client.dispatch('equipment.equip', { groupId: 'trophies', slot: 1, instanceId: 'silver-001' });
now = 20_000;
await client.advance();
print('20 seconds: modifiers apply only after second 10');
console.log('Mine stat:', explainProduction(engine.definition, client.snapshot, 'mine'));

now = 30_000;
const restored = await LocalRuntime.open({ engine, clock, repository, key: 'player-1' });
console.log('Reload after absence:', JSON.stringify(restored.snapshot));
if (restored.snapshot.resources['ore'] !== '3560') throw new Error('Unexpected integrated production');
