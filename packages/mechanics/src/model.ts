import { z } from 'zod';
import { quantity } from '@incrementa/core';

export const idSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/).refine(id => !['constructor', 'prototype', '__proto__'].includes(id), 'reserved identifier');
export const amountSchema = z.string().superRefine((value, ctx) => {
  try { if (quantity(value).compare('0') < 0) ctx.addIssue({ code: 'custom', message: 'must be nonnegative' }); }
  catch { ctx.addIssue({ code: 'custom', message: 'invalid or out-of-range decimal string' }); }
});
const integerAmount = amountSchema.refine(value => quantity(value).isInteger, 'must be integral');
const tagsSchema = z.array(idSchema).default([]);
const costSchema = z.strictObject({ resourceId: idSchema, amount: amountSchema });
export const selectorSchema = z.strictObject({
  kind: z.literal('producer'),
  id: idSchema.optional(),
  category: idSchema.optional(),
  tags: z.strictObject({ all: tagsSchema, none: tagsSchema }).optional(),
  stat: z.literal('outputMultiplier'),
});
export const modifierSchema = z.strictObject({
  target: selectorSchema,
  operation: z.enum(['add', 'multiply']),
  value: amountSchema,
});
const resourceSchema = z.strictObject({ id: idSchema, initialAmount: amountSchema });
const producerSchema = z.strictObject({
  id: idSchema,
  category: idSchema.optional(),
  tags: tagsSchema,
  initialOwned: amountSchema,
  purchase: z.strictObject({
    costs: z.array(costSchema).min(1),
    scaling: z.strictObject({ type: z.literal('geometric'), factor: amountSchema.refine(value => quantity(value).compare('1') >= 0, 'must be >= 1') }),
  }).optional(),
  production: z.strictObject({
    type: z.literal('continuous'),
    outputs: z.array(z.strictObject({
      target: z.strictObject({ type: z.enum(['resource', 'producer']), id: idSchema }),
      amountPerSecondPerUnit: amountSchema,
    })),
  }),
});
const upgradeSchema = z.strictObject({ id: idSchema, modifiers: z.array(modifierSchema) });
const collectibleSchema = z.strictObject({ id: idSchema, tags: tagsSchema, modifiers: z.array(modifierSchema) });
const itemSchema = z.strictObject({ id: idSchema, definitionId: idSchema });
const slotGroupSchema = z.strictObject({
  id: idSchema,
  baseCapacity: z.number().int().min(0).max(1000),
  maxCapacity: z.number().int().min(1).max(1000),
  acceptTags: tagsSchema,
});
const nodeSchema = z.strictObject({
  id: idSchema,
  requires: z.array(idSchema).default([]),
  costs: z.array(costSchema),
  rewards: z.array(z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('upgrade'), upgradeId: idSchema }),
    z.strictObject({ type: z.literal('slots'), groupId: idSchema, count: z.number().int().min(1).max(1000) }),
  ])).min(1),
});

export const gameDefinitionSchema = z.strictObject({
  id: idSchema,
  rulesVersion: z.string().min(1).max(128),
  resources: z.array(resourceSchema).default([]),
  producers: z.array(producerSchema).default([]),
  upgrades: z.array(upgradeSchema).default([]),
  collectibles: z.array(collectibleSchema).default([]),
  initialItems: z.array(itemSchema).default([]),
  slotGroups: z.array(slotGroupSchema).default([]),
  nodes: z.array(nodeSchema).default([]),
});

/** Typed authoring input. JSON follows exactly the same schema and validation. */
export type GameContent = z.input<typeof gameDefinitionSchema>;
export type GameDefinition = z.output<typeof gameDefinitionSchema>;
export type ProducerDefinition = GameDefinition['producers'][number];
export type Modifier = z.output<typeof modifierSchema>;
export type Selector = Modifier['target'];
export type Cost = z.output<typeof costSchema>;
export type EntityInstance = z.output<typeof itemSchema>;

export const gameStateSchema = z.strictObject({
  gameId: idSchema,
  rulesVersion: z.string(),
  schemaVersion: z.literal(1),
  revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  time: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  resources: z.record(idSchema, amountSchema),
  producers: z.record(idSchema, z.strictObject({ purchased: integerAmount, generated: amountSchema })),
  acquiredNodes: z.array(idSchema),
  items: z.array(itemSchema),
  equipment: z.record(idSchema, z.array(idSchema.nullable())),
});
export type GameState = z.output<typeof gameStateSchema>;

export const buyProducerSchema = z.strictObject({ producerId: idSchema, quantity: z.number().int().min(1).max(1_000_000) });
export const acquireNodeSchema = z.strictObject({ nodeId: idSchema });
export const equipSchema = z.strictObject({ groupId: idSchema, slot: z.number().int().min(0).max(999), instanceId: idSchema, replace: z.boolean().default(false) });
export const unequipSchema = z.strictObject({ groupId: idSchema, slot: z.number().int().min(0).max(999) });
export interface MechanicActions {
  'producer.buy': z.input<typeof buyProducerSchema>;
  'progression.acquire': z.input<typeof acquireNodeSchema>;
  'equipment.equip': z.input<typeof equipSchema>;
  'equipment.unequip': z.input<typeof unequipSchema>;
}
