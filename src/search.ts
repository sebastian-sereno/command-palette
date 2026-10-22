import type { CommandProxy } from './proxy.js';

export type CommandSearchFunctions<TContext = unknown> = {
  query(query?: string, options?: CommandSearchOptions): CommandSearchResult<TContext>[];
  find(): CommandProxy<TContext> | undefined;
  results(options?: CommandSearchOptions): CommandSearchResult<TContext>[];
};
export type CommandSearch<TContext = unknown> = CommandSearchFunctions<TContext> & {
  [key: string]: CommandSearch<TContext>;
};

export type CommandSearchResult<TContext = unknown> = {
  command: CommandProxy<TContext>;
  score: number;
  matches: string[];
};

export type CommandSearchOptions = {
  limit?: number;
  threshold?: number;
};
