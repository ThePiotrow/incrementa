import { defineAction, denied } from '@incrementa/core';
import type { GameModule } from '@incrementa/core';
import { acquireNodeSchema } from './model.js';
import type { GameDefinition, GameState } from './model.js';
import { canAfford, payCosts } from './economy.js';

export const progressionModule: GameModule<GameState, GameDefinition> = {
  id: 'progression', dependencies: ['economy', 'modifiers'], actions: [defineAction({
    id: 'progression.acquire', input: acquireNodeSchema,
    check: ({ definition, state }, { nodeId }) => {
      const node = definition.nodes.find(n => n.id === nodeId);
      if (!node) return denied('UNKNOWN_NODE', `Unknown node ${nodeId}`);
      if (state.acquiredNodes.includes(nodeId)) return denied('ALREADY_ACQUIRED', `Node ${nodeId} is already acquired`);
      if (node.requires.some(id => !state.acquiredNodes.includes(id))) return denied('PREREQUISITE_REQUIRED', `Prerequisites for ${nodeId} are not acquired`);
      return canAfford(state, node.costs);
    },
    run: ({ definition, state }, { nodeId }) => {
      const node = definition.nodes.find(n => n.id === nodeId)!;
      payCosts(state, node.costs);
      state.acquiredNodes.push(nodeId);
      return [{ type: 'progression.acquired', data: { nodeId } }];
    },
  })],
};
