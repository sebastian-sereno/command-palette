import { describe, expect, it } from 'vitest';

import type { Command } from '../src/command';
import { CommandRegistry } from '../src/registry';

function createCommand(): Command {
  return {
    category: ['testing'],
    description: 'Test command',
    execute: () => 'hello',
    id: 'test',
    keywords: ['test'],
    shortcut: 'Ctrl+T',
    title: 'Test',
  };
}

describe('CommandProxy', () => {
  it('returns a command proxy', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(createCommand());
    const command = registry.getCommand('test');

    expect(command).toBeDefined();
    expect(command?.id).toBe('test');
    expect(command?.title).toBe('Test');
  });

  it('prevents property mutation', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(createCommand());
    const command = registry.getCommand('test')!;

    expect(() => {
      (command as any).title = 'Modified';
    }).toThrow('CommandProxy is read-only.');
  });

  it('prevents property deletion', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(createCommand());
    const command = registry.getCommand('test')!;

    expect(() => {
      delete (command as any).title;
    }).toThrow('CommandProxy is read-only.');
  });

  it('still executes the original command', () => {
    const registry = new CommandRegistry();
    registry.registerCommand({ ...createCommand(), execute: () => 'executed' });

    const command = registry.getCommand('test', true)!;
    expect(command.execute({})).toBe('executed');
  });
});

function command(id: string, title = id): Command {
  return {
    category: ['test'],
    description: `${title} command`,
    execute: () => id,
    id,
    keywords: [id],
    shortcut: '',
    title,
  };
}

describe('CommandList', () => {
  it('returns the correct length', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('one'));
    registry.registerCommand(command('two'));
    registry.registerCommand(command('three'));

    const commands = registry.getCommands();
    expect(commands.length).toBe(3);
  });

  it('supports array indexing', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('one'));
    registry.registerCommand(command('two'));

    const commands = registry.getCommands();
    expect(commands[0]?.id).toBe('one');
    expect(commands[1]?.id).toBe('two');
  });

  it('returns command proxies from indexes', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('one'));

    const commands = registry.getCommands();
    expect(() => {
      (commands[0] as any).title = 'Modified';
    }).toThrow('CommandProxy is read-only.');
  });

  it('supports iteration', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('one'));
    registry.registerCommand(command('two'));

    const commands = registry.getCommands();
    const ids = [...commands].map((command) => command.id);
    expect(ids).toEqual(['one', 'two']);
  });

  it('supports for...of', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('one'));
    registry.registerCommand(command('two'));

    const commands = registry.getCommands();
    const ids: string[] = [];

    for (const command of commands) {
      ids.push(command.id);
    }

    expect(ids).toEqual(['one', 'two']);
  });

  it('supports map', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('one', 'One'));
    registry.registerCommand(command('two', 'Two'));

    const commands = registry.getCommands();
    const titles = commands.map((command) => command.title);
    expect(titles).toEqual(['One', 'Two']);
  });

  it('supports filter', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('file-open'));
    registry.registerCommand(command('file-save'));
    registry.registerCommand(command('edit-copy'));

    const commands = registry.getCommands();
    const fileCommands = commands.filter((command) => command.id.startsWith('file-'));
    expect(fileCommands.map((command) => command.id)).toEqual(['file-open', 'file-save']);
  });

  it('is readonly', () => {
    const registry = new CommandRegistry();
    registry.registerCommand(command('one'));

    const commands = registry.getCommands();
    expect(() => {
      (commands as any).push(command('two'));
    }).toThrow('CommandList is read-only.');
  });
});
