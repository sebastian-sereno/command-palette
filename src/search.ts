import type { CommandProxy } from './proxy';

export type CommandSearch<TContext = unknown> = {
  query(query?: string, options?: CommandSearchOptions): CommandSearchResult<TContext>[];
  find(): CommandProxy<TContext> | undefined;
  results(options?: CommandSearchOptions): CommandSearchResult<TContext>[];

  readonly queryString: string;
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
