import { describe, expect, it } from 'vitest';

import type { Command, CommandNode, CommandTab } from '../src/command';
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

function createTab(overrides: Partial<CommandTab> = {}): CommandTab {
  return {
    category: ['testing'],
    children: new Map<string, CommandNode>(),
    description: 'A test tab',
    id: 'tab',
    keywords: ['tab'],
    title: 'Test Tab',
    ...overrides,
  };
}

describe('CommandRegistry tabs', () => {
  describe('registration', () => {
    it('registers a tab', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createTab({ id: 'file' }));

      expect(registry.getCommand('file')?.id).toBe('file');
      expect(registry.getCommands().map((node) => node.id)).toEqual(['file']);
    });

    it('prevents duplicate root IDs across commands and tabs', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createCommand({ id: 'file' }));

      expect(() => {
        registry.registerCommand(createTab({ id: 'file' }));
      }).toThrow();
    });

    it('registers a subcommand under a tab', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createCommand({ id: 'open' }));

      expect(registry.getCommands(['file']).map((node) => node.id)).toEqual(['open']);
    });

    it('rejects registration under a missing parent', () => {
      const registry = new CommandRegistry();

      expect(() => {
        registry.registerCommand(['missing'], createCommand({ id: 'open' }));
      }).toThrow();
    });

    it('rejects registration under an executable command', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createCommand({ id: 'file' }));

      expect(() => {
        registry.registerCommand(['file'], createCommand({ id: 'open' }));
      }).toThrow();
    });

    it('prevents duplicate sibling IDs', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createCommand({ id: 'open' }));

      expect(() => {
        registry.registerCommand(['file'], createCommand({ id: 'open', title: 'Open Again' }));
      }).toThrow();
    });

    it('allows identical child IDs under different parents', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(createTab({ id: 'project' }));

      registry.registerCommand(['file'], createCommand({ id: 'open' }));

      registry.registerCommand(['project'], createCommand({ id: 'open', title: 'Open Project' }));

      expect(registry.getCommandByPath(['file', 'open'])?.title).toBe('Test Command');
      expect(registry.getCommandByPath(['project', 'open'])?.title).toBe('Open Project');
    });
  });

  describe('nested tabs', () => {
    it('supports multiple levels of nesting', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'git' }));
      registry.registerCommand(['git'], createTab({ id: 'remote' }));
      registry.registerCommand(['git', 'remote'], createTab({ id: 'origin' }));
      registry.registerCommand(['git', 'remote', 'origin'], createCommand({ id: 'fetch' }));

      expect(registry.getCommandByPath(['git', 'remote', 'origin', 'fetch'])?.id).toBe('fetch');
    });

    it('returns undefined for invalid paths', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createTab({ id: 'git' }));

      expect(registry.getCommandByPath(['git', 'missing'])).toBeUndefined();
      expect(registry.getCommandByPath(['missing'])).toBeUndefined();
    });

    it('returns only direct children', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'git' }));
      registry.registerCommand(['git'], createTab({ id: 'remote' }));
      registry.registerCommand(['git', 'remote'], createCommand({ id: 'add' }));

      expect(registry.getCommands(['git']).map((node) => node.id)).toEqual(['remote']);
    });

    it('supports an empty tab', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createTab({ id: 'empty' }));

      expect(registry.getCommands(['empty'])).toHaveLength(0);
    });
  });

  describe('reusing commands', () => {
    it('allows the same command definition under multiple parents', () => {
      const registry = new CommandRegistry();
      const sharedCommand = createCommand({ id: 'open' });

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(createTab({ id: 'project' }));

      registry.registerCommand(['file'], sharedCommand);
      registry.registerCommand(['project'], sharedCommand);

      expect(registry.getCommandByPath(['file', 'open'])?.id).toBe('open');
      expect(registry.getCommandByPath(['project', 'open'])?.id).toBe('open');
    });

    it('allows reused definitions to have different sibling commands', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(createTab({ id: 'project' }));

      registry.registerCommand(['file'], createCommand({ id: 'open' }));
      registry.registerCommand(['file'], createCommand({ id: 'close' }));

      registry.registerCommand(['project'], createCommand({ id: 'open' }));

      expect(registry.getCommands(['file']).map((node) => node.id)).toEqual(['open', 'close']);
      expect(registry.getCommands(['project']).map((node) => node.id)).toEqual(['open']);
    });
  });

  describe('navigation', () => {
    it('starts at the root', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(createCommand({ id: 'help' }));

      expect(registry.isAtRoot()).toBe(true);
      expect(registry.getCurrentCommands().map((node) => node.id)).toEqual(['file', 'help']);
    });

    it('enters a tab and shows its children', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createCommand({ id: 'open' }));

      expect(registry.enterCommand('file')).toBe(true);
      expect(registry.isAtRoot()).toBe(false);

      expect(registry.getCurrentCommands().map((node) => node.id)).toEqual(['open']);
    });

    it('does not enter an executable command', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createCommand({ id: 'help' }));

      expect(registry.enterCommand('help')).toBe(false);
      expect(registry.isAtRoot()).toBe(true);
    });

    it('returns to the parent with goBack', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createTab({ id: 'recent' }));
      registry.registerCommand(['file', 'recent'], createCommand({ id: 'open' }));

      expect(registry.enterCommand('file')).toBe(true);
      expect(registry.enterCommand('recent')).toBe(true);

      expect(registry.goBack()).toBe(true);
      expect(registry.getCurrentCommands().map((node) => node.id)).toEqual(['recent']);
    });

    it('returns directly to the root', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createTab({ id: 'recent' }));

      registry.enterCommand('file');
      registry.enterCommand('recent');
      registry.goToRoot();

      expect(registry.isAtRoot()).toBe(true);
      expect(registry.getCurrentCommands().map((node) => node.id)).toEqual(['file']);
    });

    it('cannot go back beyond the root', () => {
      const registry = new CommandRegistry();

      expect(registry.goBack()).toBe(false);
      expect(registry.isAtRoot()).toBe(true);
    });

    it('does not enter a missing command', () => {
      const registry = new CommandRegistry();

      expect(registry.enterCommand('missing')).toBe(false);
    });
  });

  describe('unregistration', () => {
    it('removes a tab and its nested subtree', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createTab({ id: 'recent' }));
      registry.registerCommand(['file', 'recent'], createCommand({ id: 'open' }));

      expect(registry.unregisterCommand('file')).toBe(true);
      expect(registry.getCommand('file')).toBeUndefined();
      expect(registry.getCommandByPath(['file', 'recent', 'open'])).toBeUndefined();
    });

    it('removes a nested subcommand without affecting siblings', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createCommand({ id: 'open' }));
      registry.registerCommand(['file'], createCommand({ id: 'close' }));

      expect(registry.unregisterCommand(['file', 'open'])).toBe(true);
      expect(registry.getCommands(['file']).map((node) => node.id)).toEqual(['close']);
    });

    it('returns false when removing a missing child', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createTab({ id: 'file' }));

      expect(registry.unregisterCommand(['file', 'missing'])).toBe(false);
    });
  });

  describe('read-only proxies', () => {
    it('prevents modifying a tab proxy', () => {
      const registry = new CommandRegistry();
      registry.registerCommand(createTab({ id: 'file' }));

      const tab = registry.getCommand('file')!;

      expect(() => {
        (tab as any).title = 'Modified';
      }).toThrow('CommandProxy is read-only.');
    });

    it('prevents modifying nested command proxies', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createCommand({ id: 'open' }));

      const child = registry.getCommands(['file'])[0]!;

      expect(() => {
        (child as any).title = 'Modified';
      }).toThrow('CommandProxy is read-only.');
    });

    it('supports array methods on child lists', () => {
      const registry = new CommandRegistry();

      registry.registerCommand(createTab({ id: 'file' }));
      registry.registerCommand(['file'], createCommand({ id: 'open' }));
      registry.registerCommand(['file'], createCommand({ id: 'close' }));

      const children = registry.getCommands(['file']);

      expect(children.map((node) => node.id)).toEqual(['open', 'close']);
      expect(children.find((node) => node.id === 'close')?.id).toBe('close');
      expect(children.filter((node) => node.id === 'open')).toHaveLength(1);
    });
  });
});
