import { type CommandNode, isCommandTab } from './command.js';
import {
  type CommandHistoryEntry,
  type CommandHistoryOptions,
  DEFAULT_HISTORY_OPTIONS,
} from './history.js';
import type { CommandNodeProxy } from './proxy.js';
import type { CommandRegistry } from './registry.js';
import type {
  CommandSearch,
  CommandSearchFunctions,
  CommandSearchOptions,
  CommandSearchResult,
} from './search.js';

export type CommandExecutionResult<T = unknown> = {
  success: boolean;
  commandId: string;
  path: string[];
  value?: T;
  error?: unknown;
  cancelled?: boolean;
  duration: number;
};

export type CommandExecutionContext<TContext = unknown> = {
  context: TContext;
  signal?: AbortSignal;
};

export class CommandExecutor {
  private readonly registry: CommandRegistry;

  private readonly historyEntries: CommandHistoryEntry[] = [];
  private readonly historyOptions: Required<Omit<CommandHistoryOptions, 'onEntry'>> & {
    onEntry?: CommandHistoryOptions['onEntry'];
  };

  public readonly search: CommandSearch;

  constructor(registry: CommandRegistry, historyOptions: CommandHistoryOptions = {}) {
    this.registry = registry;

    this.historyOptions = {
      enabled: historyOptions.enabled ?? DEFAULT_HISTORY_OPTIONS.enabled,
      includeContext: historyOptions.includeContext ?? DEFAULT_HISTORY_OPTIONS.includeContext,
      maxEntries: historyOptions.maxEntries ?? DEFAULT_HISTORY_OPTIONS.maxEntries,
      onEntry: historyOptions.onEntry,
    };

    this.search = this.createSearchProxy();
  }

  /**
   * Execute a command by ID.
   */

  async execute<TContext = unknown, T = unknown>(
    location: readonly string[] | string,
    context: TContext,
    signal?: AbortSignal,
  ): Promise<CommandExecutionResult<T>> {
    const node = this.registry.getCommand(location);

    const locationArr = Array.isArray(location) ? location : [location];
    const commandId = locationArr.at(-1)!;
    const path = locationArr.slice(0, -1);

    if (!node) {
      return {
        commandId,
        duration: 0,
        error: new Error(`Command "${commandId}" was not found.`),
        path,
        success: false,
      };
    }

    if (isCommandTab(node as CommandNode)) {
      return {
        commandId,
        duration: 0,
        error: new Error(`Cannot execute "${commandId}": it contains subcommands.`),
        path,
        success: false,
      };
    }

    return this.executeResolved(location, node, context, signal);
  }

  private async executeResolved<TContext, T = unknown>(
    location: readonly string[] | string,
    command: CommandNodeProxy,
    context: TContext,
    signal?: AbortSignal,
  ): Promise<CommandExecutionResult<T>> {
    const startedAt = new Date();
    const start = performance.now();

    const locationArr = Array.isArray(location) ? location : [location];
    const commandId = locationArr.at(-1)!;
    const path = locationArr.slice(0, -1);

    const finish = (
      result: CommandExecutionResult<T>,
      error?: unknown,
    ): CommandExecutionResult<T> => {
      this.recordHistory({
        cancelled: result.cancelled ?? false,
        command,
        completedAt: new Date(),
        context: this.historyOptions.includeContext ? context : undefined,
        duration: result.duration,
        ...(error !== undefined ? { error } : {}),
        id: commandId,
        path,
        startedAt,
        success: result.success,
      });

      return result;
    };

    if (signal?.aborted) {
      const error = new DOMException('Command execution was cancelled.', 'AbortError');

      return finish(
        {
          cancelled: true,
          commandId,
          duration: performance.now() - start,
          error,
          path,
          success: false,
        },
        error,
      );
    }

    try {
      const commandNode = command as CommandNode;
      if (isCommandTab(commandNode))
        throw new Error(`Cannot execute "${command.id}": it contains subcommands.`);

      const value = (await commandNode.execute(context)) as T;

      // Report cancellation if it happened during execution.
      // Note: this does not stop the underlying operation.
      if (signal?.aborted) {
        const error = new DOMException('Command execution was cancelled.', 'AbortError');

        return finish(
          {
            cancelled: true,
            commandId: command.id,
            duration: performance.now() - start,
            error,
            path,
            success: false,
          },
          error,
        );
      }

      return finish({
        commandId,
        duration: performance.now() - start,
        path,
        success: true,
        value,
      });
    } catch (error) {
      const cancelled = signal?.aborted || (error instanceof Error && error.name === 'AbortError');

      return finish(
        {
          cancelled,
          commandId,
          duration: performance.now() - start,
          error,
          path,
          success: false,
        },
        error,
      );
    }
  }

  get history() {
    return this.getHistory();
  }

  getHistory(): readonly CommandHistoryEntry[] {
    return this.historyEntries.slice();
  }

  clearHistory(): void {
    this.historyEntries.length = 0;
  }

  getLastExecution(): CommandHistoryEntry | undefined {
    return this.historyEntries.at(-1);
  }

  getLastSuccessfulExecution(): CommandHistoryEntry | undefined {
    return [...this.historyEntries].reverse().find((entry) => entry.success);
  }

  /**
   * Search commands by arbitrary text.
   */
  searchCommands(query: string, options: CommandSearchOptions = {}): CommandSearchResult[] {
    const { limit = 20, threshold = 0 } = options;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return [];

    const queryTokens = this.tokenize(normalizedQuery);
    const results: CommandSearchResult[] = [];

    // 1. Search normal commands.
    for (const command of this.registry.getCurrentCommands()) {
      if (isCommandTab(command as CommandNode)) continue;
      const result = this.scoreCommand(command, normalizedQuery, queryTokens);

      if (result.score >= threshold) {
        results.push({
          command: command as CommandNodeProxy,
          matches: result.matches,
          score: result.score,
        });
      }
    }

    // 2. Search symbolic commands belonging to the current group.
    const currentPath = this.registry.getCurrentPath();
    const symbolicCommands = this.registry.getSymbolicCommands(currentPath);

    for (const symbolic of symbolicCommands) {
      // Resolve the symbolic reference to the original command.
      const command = this.registry.getCommandByPath(symbolic.sourcePath);
      if (!command) continue;

      // Don't show a direct command twice.
      const isDirectCommand = symbolic.sourcePath.length === currentPath.length + 1;
      if (isDirectCommand) continue;

      const result = this.scoreCommand(command, normalizedQuery, queryTokens, symbolic.description);
      if (result.score < threshold) continue;

      results.push({
        command,
        matches: [...result.matches, 'symbolic'],
        score: result.score,
        sourcePath: [...symbolic.sourcePath],
        symbolic: true,
      });
    }

    // 3. Sort and limit combined results.
    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private createSearchProxy(queryParts: string[] = []): CommandSearch {
    const executor = this;
    const queryString = queryParts.join(' ');

    const target: CommandSearchFunctions = {
      find: () => {
        return executor.searchCommands(queryString, { limit: 1 })[0]?.command;
      },

      query: (additionalQuery = '', options) => {
        const parts = [...queryParts, ...executor.tokenize(additionalQuery)];
        return executor.searchCommands(parts.join(' '), options);
      },

      results: (options) => {
        return executor.searchCommands(queryString, options);
      },
    };

    // Normal API:
    //
    // search.query(...)
    // search.find()
    // search.results()

    // Chained search:
    //
    // search.file
    // search.file.open
    // search.file.open.recent

    return new Proxy(target, {
      get(target, property, receiver) {
        if (property in target) {
          return Reflect.get(target, property, receiver);
        } else if (typeof property === 'string') {
          return executor.createSearchProxy([...queryParts, property]);
        }
        return Reflect.get(target, property, receiver);
      },
    }) as CommandSearch;
  }

  private scoreCommand(
    command: CommandNodeProxy,
    query: string,
    tokens: string[],
    descriptionOverride?: string,
  ): {
    score: number;
    matches: string[];
  } {
    let score = 0;
    const matches: string[] = [];

    const id = command.id.toLowerCase();
    const title = command.title.toLowerCase();
    const description = (descriptionOverride ?? command.description).toLowerCase();

    const queryReg = new RegExp(
      `^${query.replaceAll(/(?=[+?|(){}[\].])/g, '\\').replaceAll(/(?=\*)/g, '.')}$`,
      'gi',
    );

    /*
     * Exact ID match gets the highest score.
     */
    if (id === query) {
      score += 100;
      matches.push('id');
    } else if (queryReg.test(id)) {
      score += 90;
      matches.push('id');
    } else if (id.includes(query)) {
      score += 60;
      matches.push('id');
    }

    /*
     * Title matches.
     */
    if (title === query) {
      score += 90;
      matches.push('title');
    } else if (queryReg.test(title)) {
      score += 80;
      matches.push('id');
    } else if (title.includes(query)) {
      score += 50;
      matches.push('title');
    }

    /*
     * Description matches.
     */
    if (description.includes(query)) {
      score += 20;
      matches.push('description');
    }

    /*
     * Keywords.
     */
    for (const keyword of command.keywords) {
      const normalizedKeyword = keyword.toLowerCase();

      if (normalizedKeyword === query) {
        score += 70;
        matches.push(`keyword:${keyword}`);
      } else if (normalizedKeyword.includes(query)) {
        score += 40;
        matches.push(`keyword:${keyword}`);
      }
    }

    /*
     * Categories.
     */
    for (const category of command.category) {
      const normalizedCategory = category.toLowerCase();

      if (normalizedCategory === query) {
        score += 50;
        matches.push(`category:${category}`);
      } else if (normalizedCategory.includes(query)) {
        score += 25;
        matches.push(`category:${category}`);
      }
    }

    /*
     * Token matching gives multi-word searches
     * useful behavior.
     */
    for (const token of tokens) {
      if (title.includes(token)) score += 15;
      if (description.includes(token)) score += 5;
      if (command.keywords.some((keyword) => keyword.toLowerCase().includes(token))) score += 10;
    }

    return { matches: [...new Set(matches)], score };
  }

  private tokenize(value: string): string[] {
    return value
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
  }

  private recordHistory(entry: CommandHistoryEntry): void {
    if (!this.historyOptions.enabled) return;
    this.historyEntries.push(entry);

    while (this.historyEntries.length > this.historyOptions.maxEntries) {
      this.historyEntries.shift();
    }

    this.historyOptions.onEntry?.(entry);
  }
}
