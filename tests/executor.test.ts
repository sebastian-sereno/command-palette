import { describe, expect, it, vi } from 'vitest';
import { CommandExecutor } from '../src/executor';
import { CommandRegistry } from '../src/registry';

describe('CommandExecutor', () => {
  it('executes synchronous commands', async () => {
    const registry = new CommandRegistry();
    registry.registerCommand({
      category: [],
      description: 'Sync command',
      execute: (context) => {
        return context;
      },
      id: 'sync',
      keywords: [],
      shortcut: '',
      title: 'Sync',
    });

    const executor = new CommandExecutor(registry);
    const result = await executor.execute('sync', { value: 123 });

    expect(result.success).toBe(true);
    expect(result.value).toEqual({ value: 123 });
  });

  it('executes async commands', async () => {
    const registry = new CommandRegistry();

    registry.registerCommand({
      category: [],
      description: 'Async command',
      execute: async () => {
        return 'done';
      },
      id: 'async',
      keywords: [],
      shortcut: '',
      title: 'Async',
    });

    const executor = new CommandExecutor(registry);
    const result = await executor.execute('async', {});

    expect(result.success).toBe(true);
    expect(result.value).toBe('done');
  });

  it('returns a failure for an unknown command', async () => {
    const registry = new CommandRegistry();
    const executor = new CommandExecutor(registry);
    const result = await executor.execute('does-not-exist', {});

    expect(result.success).toBe(false);
    expect(result.commandId).toBe('does-not-exist');
    expect(result.error).toBeInstanceOf(Error);
  });

  it('handles command errors', async () => {
    const registry = new CommandRegistry();

    registry.registerCommand({
      category: [],
      description: 'Throws',
      execute: () => {
        throw new Error('Boom');
      },
      id: 'throws',
      keywords: [],
      shortcut: '',
      title: 'Throws',
    });

    const executor = new CommandExecutor(registry);
    const result = await executor.execute('throws', {});

    expect(result.success).toBe(false);
    expect(result.error).toEqual(new Error('Boom'));
  });

  it('handles an already-aborted signal', async () => {
    const registry = new CommandRegistry();
    const execute = vi.fn();

    registry.registerCommand({
      category: [],
      description: 'Cancelled',
      execute,
      id: 'cancelled',
      keywords: [],
      shortcut: '',
      title: 'Cancelled',
    });

    const executor = new CommandExecutor(registry);
    const controller = new AbortController();
    controller.abort();

    const result = await executor.execute('cancelled', {}, controller.signal);

    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });
});
