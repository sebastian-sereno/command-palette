import type { Command } from './command';

export type CommandProxy<TContext = unknown, TExtensions extends object = {}> = DeepReadonly<
  Command<TContext> & TExtensions
>;

export type CommandList<
  TContext = unknown,
  TExtensions extends object = {},
> = readonly CommandProxy<TContext, TExtensions>[];

type DeepReadonly<T> = T extends (...args: infer Args) => infer Return
  ? (...args: Args) => Return
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
