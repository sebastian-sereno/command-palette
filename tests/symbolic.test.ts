import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command, CommandTab } from '../src/command.js';
import { CommandExecutor } from '../src/executor.js';
import { CommandRegistry } from '../src/registry.js';
import { DefaultSymbolicCommandAdapter } from '../src/symbolic.js';

describe('Symbolic command registration', () => {
  let registry: CommandRegistry;
  let adapter: DefaultSymbolicCommandAdapter;

  const createCommand = (id: string): Command => ({
    category: ['test'],
    description: `${id} command`,
    execute: vi.fn(),
    id,
    keywords: [id],
    shortcut: '',
    title: id,
  });

  const createGroup = (
    id: string,
    children: CommandTab['children'] = new Map(),
    symbolic?: boolean,
  ): CommandTab => ({
    category: [],
    children,
    description: `${id} group`,
    id,
    keywords: [],
    title: id,
    ...(symbolic !== undefined ? { symbolic } : {}),
  });

  beforeEach(() => {
    registry = new CommandRegistry();
    adapter = new DefaultSymbolicCommandAdapter();
    registry.setSymbolicAdapter(adapter);
  });

  describe('basic registration', () => {
    it('registers direct commands symbolically', () => {
      const build = createCommand('build');
      const frontend = createGroup('frontend', new Map([['build', build]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      const symbols = adapter.getSymbolicCommands(['frontend']);
      expect(symbols).toHaveLength(1);
      expect(symbols[0]?.sourceId).toBe('build');
      expect(symbols[0]?.sourcePath).toEqual(['frontend', 'build']);
    });

    it('does not duplicate underlying commands', () => {
      const build = createCommand('build');
      const frontend = createGroup('frontend', new Map([['build', build]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      const commands = registry.getCommands(['frontend']);
      expect(commands).toHaveLength(1);
      expect(commands[0]?.id).toBe('build');
    });

    it('generates symbolic identifiers', () => {
      const build = createCommand('build');
      const frontend = createGroup('frontend', new Map([['build', build]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      const symbols = adapter.getSymbolicCommands();
      expect(symbols[0]?.id).toMatch(/^sym_/);
    });
  });

  describe('recursive registration', () => {
    it('registers commands from grandchildren', () => {
      const build = createCommand('build');
      const test = createCommand('test');
      const react = createGroup(
        'react',
        new Map([
          ['build', build],
          ['test', test],
        ]),
      );
      const frontend = createGroup('frontend', new Map([['react', react]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend'], { recursive: true });

      const symbols = adapter.getSymbolicCommands(['frontend']);
      expect(symbols).toHaveLength(2);
      expect(symbols.map((symbol) => symbol.sourceId)).toEqual(
        expect.arrayContaining(['build', 'test']),
      );
    });

    it('preserves complete relative paths', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]));
      const frontend = createGroup('frontend', new Map([['react', react]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      const symbols = adapter.getSymbolicCommands(['frontend']);
      expect(symbols[0]?.description).toBe('frontend/react/build');
    });

    it('registers nested commands in their ancestor groups', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]));
      const frontend = createGroup('frontend', new Map([['react', react]]));
      const development = createGroup('development', new Map([['frontend', frontend]]));

      registry.registerCommand(development);
      registry.registerSymbolicCommands(['development']);

      const developmentSymbols = adapter.getSymbolicCommands(['development']);
      expect(developmentSymbols).toHaveLength(1);
      expect(developmentSymbols[0]?.sourceId).toBe('build');
    });
  });

  describe('opt-out behavior', () => {
    it('does not register commands from an opted-out group', () => {
      const build = createCommand('build');
      const backend = createGroup('backend', new Map([['build', build]]), false);
      const development = createGroup('development', new Map([['backend', backend]]));

      registry.registerCommand(development);
      registry.registerSymbolicCommands(['development']);

      expect(adapter.getSymbolicCommands(['development'])).toHaveLength(0);
    });

    it('continues registering sibling groups after an opt-out', () => {
      const backend = createGroup('backend', new Map([['build', createCommand('build')]]), false);
      const frontend = createGroup('frontend', new Map([['test', createCommand('test')]]));

      const development = createGroup(
        'development',
        new Map([
          ['backend', backend],
          ['frontend', frontend],
        ]),
      );

      registry.registerCommand(development);
      registry.registerSymbolicCommands(['development']);

      const symbols = adapter.getSymbolicCommands(['development']);

      expect(symbols).toHaveLength(1);
      expect(symbols[0]?.sourceId).toBe('test');
    });
  });

  describe('duplicate prevention', () => {
    it('does not register the same symbolic ID twice', () => {
      const build = createCommand('build');
      const frontend = createGroup('frontend', new Map([['build', build]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);
      registry.registerSymbolicCommands(['frontend']);

      expect(adapter.getSymbolicCommands(['frontend'])).toHaveLength(1);
    });

    it('creates distinct identifiers for different targets', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]));
      const frontend = createGroup('frontend', new Map([['react', react]]));
      const development = createGroup('development', new Map([['frontend', frontend]]));

      registry.registerCommand(development);
      registry.registerSymbolicCommands(['development']);

      const symbols = adapter.getSymbolicCommands();
      expect(new Set(symbols.map((symbol) => symbol.id)).size).toBe(symbols.length);
    });

    it('does not duplicate the command ID in descriptions', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]));
      const frontend = createGroup('frontend', new Map([['react', react]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      const symbols = adapter.getSymbolicCommands(['frontend']);
      expect(symbols[0]?.description).toBe('frontend/react/build');
      expect(symbols[0]?.description).not.toContain('build/build');
    });
  });

  describe('default adapter', () => {
    it('filters symbolic commands by parent path', () => {
      adapter.registerSymbolicCommand({
        category: [],
        description: 'frontend/build',
        id: 'sym_1',
        keywords: [],
        parentPath: ['frontend'],
        sourceId: 'build',
        sourcePath: ['frontend', 'build'],
        title: 'Build',
      });

      adapter.registerSymbolicCommand({
        category: [],
        description: 'backend/test',
        id: 'sym_2',
        keywords: [],
        parentPath: ['backend'],
        sourceId: 'test',
        sourcePath: ['backend', 'test'],
        title: 'Test',
      });

      expect(adapter.getSymbolicCommands(['frontend'])).toHaveLength(1);
      expect(adapter.getSymbolicCommands(['backend'])).toHaveLength(1);
    });

    it('supports unregistering symbolic commands', () => {
      adapter.registerSymbolicCommand({
        category: [],
        description: 'frontend/build',
        id: 'sym_1',
        keywords: [],
        parentPath: ['frontend'],
        sourceId: 'build',
        sourcePath: ['frontend', 'build'],
        title: 'Build',
      });

      adapter.unregisterSymbolicCommand('sym_1');

      expect(adapter.has('sym_1')).toBe(false);
      expect(adapter.getSymbolicCommands()).toHaveLength(0);
    });

    it('returns copies instead of exposing internal registrations', () => {
      adapter.registerSymbolicCommand({
        category: ['test'],
        description: 'frontend/build',
        id: 'sym_1',
        keywords: ['build'],
        parentPath: ['frontend'],
        sourceId: 'build',
        sourcePath: ['frontend', 'build'],
        title: 'Build',
      });

      const symbols = adapter.getSymbolicCommands();
      symbols[0]!.keywords.push('modified');

      expect(adapter.getSymbolicCommands()[0]?.keywords).toEqual(['build']);
    });
  });

  describe('Symbolic command search', () => {
    it('finds commands from descendant groups', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]));
      const frontend = createGroup('frontend', new Map([['react', react]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      // Navigate into the group containing symbolic registrations.
      expect(registry.enterCommand('frontend')).toBe(true);

      const executor = new CommandExecutor(registry);
      const results = executor.searchCommands('build');

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.symbolic).toBe(true);
      expect(results[0]?.sourcePath).toEqual(['frontend', 'react', 'build']);
    });

    it('resolves symbolic results to original commands', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]));
      const frontend = createGroup('frontend', new Map([['react', react]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);
      registry.enterCommand('frontend');

      const executor = new CommandExecutor(registry);
      const result = executor.search.build.find();

      expect(result?.id).toBe('build');
    });
  });

  it('does not return duplicate direct commands', () => {
    const build = createCommand('build');
    const frontend = createGroup('frontend', new Map([['build', build]]));

    registry.registerCommand(frontend);
    registry.registerSymbolicCommands(['frontend']);
    registry.enterCommand('frontend');

    const executor = new CommandExecutor(registry);
    const results = executor.searchCommands('build');

    expect(results.filter((result) => result.command.id === 'build')).toHaveLength(1);
    expect(results[0]?.symbolic).toBeUndefined();
  });

  describe('Symbolic child group isolation', () => {
    it('does not load child symbolic commands until entering the child', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]));
      const frontend = createGroup('frontend', new Map([['react', react]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      const executor = new CommandExecutor(registry);
      expect(registry.enterCommand('frontend')).toBe(true);

      const frontendResults = executor.searchCommands('build');
      expect(frontendResults).toHaveLength(2);
      expect(frontendResults[0]?.symbolic).toBe(true);

      registry.goToRoot();

      const rootResults = executor.searchCommands('build');
      expect(rootResults).toHaveLength(1);

      // Child group remains available for navigation.
      expect(registry.enterCommand('frontend')).toBe(true);

      const groups = registry.getCurrentCommands();
      expect(groups.some((command) => command.id === 'react')).toBe(true);
      expect(registry.enterCommand('react')).toBe(true);

      const reactResults = executor.searchCommands('build');

      expect(reactResults).toHaveLength(1);
      expect(reactResults[0]?.symbolic).toBeUndefined();
    });

    it('does not load an explicitly opted-out child', () => {
      const build = createCommand('build');
      const react = createGroup('react', new Map([['build', build]]), false);
      const frontend = createGroup('frontend', new Map([['react', react]]));

      registry.registerCommand(frontend);
      registry.registerSymbolicCommands(['frontend']);

      const executor = new CommandExecutor(registry);
      expect(registry.enterCommand('frontend')).toBe(true);

      // React must remain visible as a navigation group.
      const frontendCommands = registry.getCurrentCommands();
      expect(frontendCommands.some((command) => command.id === 'react')).toBe(true);

      // But its descendants must not be symbolically exposed.
      expect(executor.searchCommands('build')).toHaveLength(1);
      expect(registry.enterCommand('react')).toBe(true);

      // Its direct executable commands remain available.
      const reactResults = executor.searchCommands('build');

      expect(reactResults).toHaveLength(1);
      expect(reactResults[0]?.command.id).toBe('build');
      expect(reactResults[0]?.symbolic).toBeUndefined();
    });
  });
});
