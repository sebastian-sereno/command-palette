import {
  type CommandHistoryEntry,
  type CommandHistoryOptions,
  DEFAULT_HISTORY_OPTIONS,
} from './history';
import type { CommandProxy } from './proxy';
import type { CommandRegistry } from './registry';
import type { CommandSearch, CommandSearchOptions, CommandSearchResult } from './search';

export type CommandExecutionResult<T = unknown> = {
  success: boolean;
  commandId: string;
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
    id: string,
    context: TContext,
    signal?: AbortSignal,
  ): Promise<CommandExecutionResult<T>> {
    const startedAt = new Date();
    const start = performance.now();

    const command = this.registry.getCommandByID(id);

    if (!command) {
      const result: CommandExecutionResult<T> = {
        commandId: id,
        duration: performance.now() - start,
        error: new Error(`Command "${id}" was not found.`),
        success: false,
      };

      return result;
    }

    if (signal?.aborted) {
      const result: CommandExecutionResult<T> = {
        cancelled: true,
        commandId: id,
        duration: performance.now() - start,
        error: new DOMException('Command execution was cancelled.', 'AbortError'),
        success: false,
      };

      this.recordHistory({
        cancelled: true,
        command,
        completedAt: new Date(),
        context: this.historyOptions.includeContext ? context : undefined,
        duration: result.duration,
        id,
        startedAt,
        success: false,
      });

      return result;
    }

    try {
      const value = (await command.execute(context)) as T;

      const result: CommandExecutionResult<T> = {
        commandId: id,
        duration: performance.now() - start,
        success: true,
        value,
      };

      this.recordHistory({
        cancelled: false,
        command,
        completedAt: new Date(),
        context: this.historyOptions.includeContext ? context : undefined,
        duration: result.duration,
        id,
        startedAt,
        success: true,
      });

      return result;
    } catch (error) {
      const result: CommandExecutionResult<T> = {
        commandId: id,
        duration: performance.now() - start,
        error,
        success: false,
      };

      this.recordHistory({
        cancelled: false,
        command,
        completedAt: new Date(),
        context: this.historyOptions.includeContext ? context : undefined,
        duration: result.duration,
        error,
        id,
        startedAt,
        success: false,
      });

      return result;
    }
  }

  /**
   * Execute a command returned from the search system.
   */
  async executeCommand<TContext = unknown, T = unknown>(
    command: CommandProxy<TContext>,
    context: TContext,
    signal?: AbortSignal,
  ): Promise<CommandExecutionResult<T>> {
    return this.execute(command.id, context, signal);
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

    return this.registry
      .getAllCommands()
      .map((command) => {
        const result = this.scoreCommand(command, normalizedQuery, queryTokens);

        return {
          command,
          matches: result.matches,
          score: result.score,
        };
      })
      .filter((result) => result.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private createSearchProxy(queryParts: string[] = []): CommandSearch {
    const executor = this;
    const queryString = queryParts.join(' ');

    const target: CommandSearch = {
      find: () => {
        return executor.searchCommands(queryString, { limit: 1 })[0]?.command;
      },

      query: (additionalQuery = '', options) => {
        const parts = [...queryParts, ...executor.tokenize(additionalQuery)];
        return executor.searchCommands(parts.join(' '), options);
      },

      get queryString() {
        return queryString;
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
    // search.queryString

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
    });
  }

  private scoreCommand(
    command: CommandProxy,
    query: string,
    tokens: string[],
  ): {
    score: number;
    matches: string[];
  } {
    let score = 0;
    const matches: string[] = [];

    const id = command.id.toLowerCase();
    const title = command.title.toLowerCase();
    const description = command.description.toLowerCase();

    /*
     * Exact ID match gets the highest score.
     */
    if (id === query) {
      score += 100;
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
      if (title.includes(token)) {
        score += 15;
      }

      if (description.includes(token)) {
        score += 5;
      }

      if (command.keywords.some((keyword) => keyword.toLowerCase().includes(token))) {
        score += 10;
      }
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
