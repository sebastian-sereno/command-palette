import { describe, expect, it } from 'vitest';

import type { Command } from '../src/command';
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
});
