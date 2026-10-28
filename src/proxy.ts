import type { Command, CommandNode } from './command.js';

export type CommandNodeProxy = DeepReadonly<CommandNode>;
export type CommandProxy = DeepReadonly<Command>;
export type CommandList = readonly CommandNodeProxy[];

type DeepReadonly<T> = T extends (...args: infer Args) => infer Return
  ? (...args: Args) => Return
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
