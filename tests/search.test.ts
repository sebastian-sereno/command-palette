import { describe, expect, it, vi } from 'vitest';

import { type Command, CommandVisibility } from '../src/command';
import { CommandExecutor } from '../src/executor';
import { CommandRegistry } from '../src/registry';

function command(overrides: Partial<Command>): Command {
  return {
    category: [],
    description: 'Test command',
    execute: () => undefined,
    id: 'test',
    keywords: [],
    shortcut: '',
    title: 'Test',
    ...overrides,
  };
}

function createExecutor() {
  const registry = new CommandRegistry();

  registry.registerCommand(
    command({
      category: ['file', 'navigation'],
      description: 'Open a file',
      id: 'open-file',
      keywords: ['open', 'file', 'document'],
      title: 'Open File',
    }),
  );

  registry.registerCommand(
    command({
      category: ['file'],
      description: 'Save the current file',
      id: 'save-file',
      keywords: ['save', 'file'],
      title: 'Save File',
    }),
  );

  registry.registerCommand(
    command({
      category: ['edit'],
      description: 'Copy selected content',
      id: 'copy',
      keywords: ['clipboard'],
      title: 'Copy',
    }),
  );

  return new CommandExecutor(registry);
}

describe('Command search', () => {
  it('finds commands by ID', () => {
    const executor = createExecutor();
    const results = executor.search.query('open-file');
    expect(results[0]?.command.id).toBe('open-file');
  });

  it('finds commands by title', () => {
    const executor = createExecutor();
    const results = executor.search.query('Open File');
    expect(results[0]?.command.id).toBe('open-file');
  });

  it('finds commands by keyword', () => {
    const executor = createExecutor();
    const results = executor.search.query('clipboard');
    expect(results[0]?.command.id).toBe('copy');
  });

  it('finds commands by description', () => {
    const executor = createExecutor();
    const results = executor.search.query('current file');
    expect(results.some((result) => result.command.id === 'save-file')).toBe(true);
  });

  it('supports result limits', () => {
    const executor = createExecutor();
    const results = executor.search.query('file', { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('supports find()', () => {
    const executor = createExecutor();
    const command = executor.search.query('clipboard').at(0)?.command;
    expect(command?.id).toBe('copy');
  });

  it('supports chained searches', () => {
    const executor = createExecutor();
    const command = executor.search.clipboard.results().at(0)?.command;
    expect(command?.id).toBe('copy');
  });
});

describe('Command visibility', () => {
  function createVisibilityExecutor() {
    const registry = new CommandRegistry();

    const visibilities = [
      CommandVisibility.ALWAYS,
      CommandVisibility.SHOWN,
      CommandVisibility.SEARCHABLE,
      CommandVisibility.HIDDEN,
    ];

    for (const visibility of visibilities) {
      registry.registerCommand(
        command({
          description: `Command with ${visibility.toLowerCase()} visibility`,
          id: visibility.toLowerCase(),
          keywords: ['visibility-test'],
          title: `${visibility} Command`,
          visibility,
        }),
      );
    }

    // Command without explicitly configured visibility.
    registry.registerCommand(
      command({
        id: 'default',
        keywords: ['visibility-test'],
        title: 'Default Command',
      }),
    );

    return new CommandExecutor(registry);
  }

  describe('Search visibility', () => {
    it.each([
      [CommandVisibility.ALWAYS, true],
      [CommandVisibility.SHOWN, false],
      [CommandVisibility.SEARCHABLE, true],
      [CommandVisibility.HIDDEN, false],
    ] as const)('%s visibility should be searchable: %s', (visibility, searchable) => {
      const executor = createVisibilityExecutor();
      const results = executor.search.query(visibility.toLowerCase());

      expect(results.some((result) => result.command.id === visibility.toLowerCase())).toBe(
        searchable,
      );
    });

    it('defaults to ALWAYS visibility', () => {
      const executor = createVisibilityExecutor();
      const results = executor.search.query('default');
      expect(results.some((result) => result.command.id === 'default')).toBe(true);
    });

    it('does not return SHOWN commands in search results', () => {
      const executor = createVisibilityExecutor();
      const results = executor.search.query('visibility-test');
      expect(results.some((result) => result.command.id === 'shown')).toBe(false);
    });

    it('does not return HIDDEN commands in search results', () => {
      const executor = createVisibilityExecutor();
      const results = executor.search.query('visibility-test');
      expect(results.some((result) => result.command.id === 'hidden')).toBe(false);
    });

    it('returns SEARCHABLE commands in search results', () => {
      const executor = createVisibilityExecutor();
      const results = executor.search.query('visibility-test');
      expect(results.some((result) => result.command.id === 'searchable')).toBe(true);
    });

    it('returns ALWAYS commands in search results', () => {
      const executor = createVisibilityExecutor();
      const results = executor.search.query('visibility-test');
      expect(results.some((result) => result.command.id === 'always')).toBe(true);
    });
  });

  describe('Execution visibility', () => {
    it.each([
      CommandVisibility.ALWAYS,
      CommandVisibility.SHOWN,
      CommandVisibility.SEARCHABLE,
      CommandVisibility.HIDDEN,
    ])('allows execution of %s commands', async (visibility) => {
      const execute = vi.fn();

      const registry = new CommandRegistry();
      registry.registerCommand(command({ execute, id: visibility.toLowerCase(), visibility }));

      const executor = new CommandExecutor(registry);
      const result = await executor.execute(visibility.toLowerCase(), {});

      expect(result.success).toBe(true);
      expect(execute).toHaveBeenCalledOnce();
    });
  });
});
