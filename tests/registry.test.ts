import { describe, expect, it } from 'vitest';

import type { Command } from '../src/command';
import { CommandRegistry } from '../src/registry';

function createCommand(overrides: Partial<Command> = {}): Command {
  return {
    category: ['testing'],
    description: 'A test command',
    execute: () => 'executed',
    id: 'test',
    keywords: ['test'],
    shortcut: 'Ctrl+T',
    title: 'Test Command',
    ...overrides,
  };
}

describe('CommandRegistry', () => {
  it('registers a command', () => {
    const registry = new CommandRegistry();
    const command = createCommand({ id: 'hello' });
    registry.registerCommand(command);
    const result = registry.getCommand('hello');
    expect(result).toBeDefined();
    expect(result?.id).toBe('hello');
  });

  it('prevents duplicate command IDs', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(createCommand({ id: 'duplicate' }));

    expect(() => {
      registry.registerCommand(createCommand({ id: 'duplicate' }));
    }).toThrow('Command with ID "duplicate" is already registered.');
  });

  it('unregisters by ID', () => {
    const registry = new CommandRegistry();

    registry.registerCommand(createCommand({ id: 'remove-me' }));
    expect(registry.unregisterCommand('remove-me')).toBe(true);
    expect(registry.getCommand('remove-me')).toBeUndefined();
  });

  it('unregisters by command', () => {
    const registry = new CommandRegistry();
    const command = createCommand({ id: 'remove-me' });
    registry.registerCommand(command);
    expect(registry.unregisterCommand(command.id)).toBe(true);
    expect(registry.getCommand('remove-me')).toBeUndefined();
  });

  it('returns false when unregistering a missing command', () => {
    const registry = new CommandRegistry();
    expect(registry.unregisterCommand('missing')).toBe(false);
  });

  it('replaces a command', () => {
    const registry = new CommandRegistry();

    registry.registerCommand(createCommand({ id: 'replace', title: 'Original' }));
    const replacement = createCommand({ id: 'replace', title: 'Replacement' });

    expect(registry.replaceCommand('replace', replacement)).toBe(true);
    expect(registry.getCommand('replace')?.title).toBe('Replacement');
  });

  it('does not replace a missing command', () => {
    const registry = new CommandRegistry();
    expect(registry.replaceCommand('missing', createCommand({ id: 'missing' }))).toBe(false);
  });

  it('rejects mismatched replacement IDs', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(createCommand({ id: 'original' }));

    expect(() => {
      registry.replaceCommand('original', createCommand({ id: 'different' }));
    }).toThrow('Replacement command ID "different" does not match "original".');
  });
});
