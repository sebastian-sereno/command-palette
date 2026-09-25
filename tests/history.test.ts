import { describe, expect, it } from 'vitest';
import { CommandExecutor } from '../src/executor';
import { CommandRegistry } from '../src/registry';

describe('Command history', () => {
  it('records successful executions', async () => {
    const registry = new CommandRegistry();

    registry.registerCommand({
      category: [],
      description: 'Test',
      execute: () => 'done',
      id: 'test',
      keywords: [],
      shortcut: '',
      title: 'Test',
    });

    const executor = new CommandExecutor(registry, {
      enabled: true,
      maxEntries: 10,
    });

    await executor.execute('test', { foo: 'bar' });
    expect(executor.history).toHaveLength(1);
    expect(executor.history[0]?.id).toBe('test');
    expect(executor.history[0]?.success).toBe(true);
    expect(executor.history[0]?.cancelled).toBe(false);
  });

  it('respects maxEntries', async () => {
    const registry = new CommandRegistry();

    registry.registerCommand({
      category: [],
      description: 'Test',
      execute: () => undefined,
      id: 'test',
      keywords: [],
      shortcut: '',
      title: 'Test',
    });

    const executor = new CommandExecutor(registry, {
      maxEntries: 2,
    });

    await executor.execute('test', {});
    await executor.execute('test', {});
    await executor.execute('test', {});

    expect(executor.history).toHaveLength(2);
  });

  it('does not retain context by default', async () => {
    const registry = new CommandRegistry();

    registry.registerCommand({
      category: [],
      description: 'Test',
      execute: () => undefined,
      id: 'test',
      keywords: [],
      shortcut: '',
      title: 'Test',
    });

    const executor = new CommandExecutor(registry);
    await executor.execute('test', { secret: 'value' });
    expect(executor.history[0]?.context).toBeUndefined();
  });

  it('can retain context', async () => {
    const registry = new CommandRegistry();

    registry.registerCommand({
      category: [],
      description: 'Test',
      execute: () => undefined,
      id: 'test',
      keywords: [],
      shortcut: '',
      title: 'Test',
    });

    const executor = new CommandExecutor(registry, { includeContext: true });
    const context = { value: 123 };

    await executor.execute('test', context);
    expect(executor.history[0]?.context).toEqual(context);
  });

  it('clears history', async () => {
    const registry = new CommandRegistry();

    registry.registerCommand({
      category: [],
      description: 'Test',
      execute: () => undefined,
      id: 'test',
      keywords: [],
      shortcut: '',
      title: 'Test',
    });

    const executor = new CommandExecutor(registry);
    await executor.execute('test', {});

    expect(executor.history).toHaveLength(1);

    executor.clearHistory();
    expect(executor.history).toHaveLength(0);
  });
});
