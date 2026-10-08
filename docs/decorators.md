# Decorator registration

Incrementa uses standard TypeScript/ECMAScript decorators. Leave `experimentalDecorators` and `emitDecoratorMetadata` off. Compile with TypeScript 6.0.3 (the pinned version), an ES2022 target and standard decorator types. Node runs the emitted JavaScript. There is no NestJS or `reflect-metadata` requirement.

`@Action({ id, input, check? })` marks a **public instance method** taking `(ActionContext<State, Definition>, ParsedInput)` and returning a synchronous domain-event array. It stores registration metadata on that method declaration. `@GameExtension({ id, dependencies? })` identifies the class as a module. Neither decorator registers globally or executes game behavior at import time.

```ts
const extension = new FactoryActions();
const module = decoratedModule<GameState, GameDefinition>(extension);
const game = createGame<FactoryActionsCatalog>(content, { extensions: [module] });
```

See the compiled-and-tested [factory action](../examples/factory/src/actions.ts). Explicitly registering `defineAction` with the same schema, check and handler produces the same behavior. `AbstractGameAction` provides the shared parsing/recheck sequence underneath both paths.

Instances are explicitly constructed by the caller and retain `this` binding. Multiple instances do not share registration state. Each concrete extension class, including subclasses, must declare its own `@GameExtension`. Inherited decorated methods are included; a decorated override replaces the base method and metadata. An undecorated override of a decorated method is rejected. Multiple methods with the same action ID fail assembly. Private/static methods and stacking two `@Action` decorators on one method are rejected. Fields and method decorators from unrelated libraries are outside the supported metadata contract.

The generic state/definition arguments to `decoratedModule` must match the contexts of the instance's methods; TypeScript cannot reflect those declaration types at runtime. Schemas are mandatory and never inferred from interfaces. The packed-consumer test verifies inherited methods, overriding behavior, receiver binding, multiple instances, explicit equivalence, and compile-time rejection of invalid dispatch inputs.

Future NestJS integration would need an adapter for its decorator conventions; this implementation does not claim compatibility with legacy experimental decorator signatures. Metadata collection is isolated in `@incrementa/decorators` so such an adapter need not change the engine.
