import type { CommandNodeProxy } from './proxy.js';

export type CommandSearchFunctions = {
  query(query?: string, options?: CommandSearchOptions): CommandSearchResult[];
  find(): CommandNodeProxy | undefined;
  results(options?: CommandSearchOptions): CommandSearchResult[];
};
export type CommandSearch = CommandSearchFunctions & {
  [key: string]: CommandSearch;
};

export type CommandSearchResult = {
  command: CommandNodeProxy;
  score: number;
  matches: string[];
  symbolic?: boolean;
  sourcePath?: string[];
};

export type CommandSearchOptions = {
  limit?: number;
  threshold?: number;
};
