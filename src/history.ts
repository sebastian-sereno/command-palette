import type { CommandNodeProxy } from './proxy.js';

export type CommandHistoryEntry<TContext = unknown> = {
  readonly id: string;
  readonly path: readonly string[];
  readonly command: CommandNodeProxy;
  readonly context?: TContext;
  readonly startedAt: Date;
  readonly completedAt: Date;
  readonly duration: number;
  readonly success: boolean;
  readonly cancelled: boolean;
  readonly error?: unknown;
};

export type CommandHistoryOptions<TContext = unknown> = {
  enabled?: boolean;
  maxEntries?: number;

  /**
   * Whether execution context should be retained.
   */
  includeContext?: boolean;

  /**
   * Called whenever an entry is added.
   */
  onEntry?: (entry: CommandHistoryEntry<TContext>) => void;
};

export const DEFAULT_HISTORY_OPTIONS: Required<Omit<CommandHistoryOptions, 'onEntry'>> = {
  enabled: true,
  includeContext: false,
  maxEntries: 100,
};
