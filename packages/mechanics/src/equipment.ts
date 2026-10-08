import { allowed, defineAction, denied } from '@incrementa/core';
import type { Availability, GameModule, ReadContext } from '@incrementa/core';
import { equipSchema, unequipSchema } from './model.js';
import type { GameDefinition, GameState } from './model.js';
import { slotCapacity } from './validation.js';

function availableSlot({ definition, state }: ReadContext<GameState, GameDefinition>, groupId: string, slot: number): Availability {
  if (!definition.slotGroups.some(g => g.id === groupId)) return denied('UNKNOWN_SLOT_GROUP', `Unknown slot group ${groupId}`);
  return slot < slotCapacity(definition, state, groupId) ? allowed : denied('SLOT_LOCKED', `Slot ${slot} is locked`);
}

export const equipmentModule: GameModule<GameState, GameDefinition> = {
  id: 'equipment', dependencies: ['modifiers'], actions: [
    defineAction<GameState, GameDefinition, ReturnType<typeof equipSchema.parse>>({
      id: 'equipment.equip', input: equipSchema,
      check: (context, input) => {
        const access = availableSlot(context, input.groupId, input.slot);
        if (!access.allowed) return access;
        const { state, definition } = context;
        const item = state.items.find(i => i.id === input.instanceId);
        if (!item) return denied('ITEM_NOT_OWNED', `Item ${input.instanceId} is not owned`);
        const collectible = definition.collectibles.find(c => c.id === item.definitionId)!;
        const group = definition.slotGroups.find(g => g.id === input.groupId)!;
        if (!group.acceptTags.every(tag => collectible.tags.includes(tag))) return denied('ITEM_INELIGIBLE', `Item ${input.instanceId} is not accepted here`);
        if (Object.values(state.equipment).some(slots => slots.includes(input.instanceId))) return denied('ALREADY_EQUIPPED', `Item ${input.instanceId} is already equipped`);
        if (state.equipment[input.groupId]![input.slot] && !input.replace) return denied('SLOT_OCCUPIED', 'Explicit replace is required for an occupied slot');
        return allowed;
      },
      run: ({ state }, input) => {
        const replaced = state.equipment[input.groupId]![input.slot];
        state.equipment[input.groupId]![input.slot] = input.instanceId;
        return [{ type: 'equipment.equipped', data: { groupId: input.groupId, slot: String(input.slot), instanceId: input.instanceId, replaced: replaced ?? '' } }];
      },
    }),
    defineAction<GameState, GameDefinition, ReturnType<typeof unequipSchema.parse>>({
      id: 'equipment.unequip', input: unequipSchema,
      check: (context, input) => availableSlot(context, input.groupId, input.slot),
      run: ({ state }, input) => {
        state.equipment[input.groupId]![input.slot] = null;
        return [{ type: 'equipment.unequipped', data: { groupId: input.groupId, slot: String(input.slot) } }];
      },
    }),
  ],
};
