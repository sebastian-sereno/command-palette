import type { Command } from './command.js';
import type { CommandList, CommandProxy } from './proxy.js';

export class CommandRegistry {
  private readonly commands = new Map<string, Command>();

  // Prevent duplicate command IDs
  // Validate command definitions when registering them
  registerCommand(command: Command): void {
    this.validateCommand(command);
    if (this.commands.has(command.id))
      throw new Error(`Command with ID "${command.id}" is already registered.`);

    this.commands.set(command.id, command);
  }

  unregisterCommand(commandOrId: Command | string): boolean {
    const id = typeof commandOrId === 'string' ? commandOrId : commandOrId?.id;
    if (!id) return false;
    return this.commands.delete(id);
  }

  replaceCommands(id: Command['id'], replacement: Command): boolean {
    if (!this.commands.has(id)) return false;

    if (!replacement || typeof replacement !== 'object')
      throw new TypeError('Replacement command must be a valid object.');
    if (replacement.id !== id)
      throw new Error(`Replacement command ID "${replacement.id}" does not match "${id}".`);

    this.validateCommand(replacement);

    this.commands.set(id, replacement);
    return true;
  }

  getCommandByID(id: Command['id']): CommandProxy | undefined {
    const command = this.commands.get(id);
    if (!command) return command;
    return this.createCommandProxy(command);
  }

  getAllCommands(): CommandList {
    return this.createCommandListProxy(Array.from(this.commands.values()));
  }

  private validateCommand(command: Command): void {
    if (!command || typeof command !== 'object')
      throw new TypeError('Command must be a valid object.');
    if (!command.id || typeof command.id !== 'string')
      throw new TypeError('Command ID must be a non-empty string.');
    if (!command.title || typeof command.title !== 'string')
      throw new TypeError(`Command "${command.id}" must have a title.`);
    if (typeof command.description !== 'string')
      throw new TypeError(`Command "${command.id}" description must be a string.`);
    if (!Array.isArray(command.keywords))
      throw new TypeError(`Command "${command.id}" keywords must be an array.`);
    if (!Array.isArray(command.category))
      throw new TypeError(`Command "${command.id}" category must be an array.`);
    if (typeof command.shortcut !== 'string')
      throw new TypeError(`Command "${command.id}" shortcut must be a string.`);
    if (typeof command.execute !== 'function')
      throw new TypeError(`Command "${command.id}" must have an execute function.`);
  }

  private createCommandListProxy(commands: readonly Command[]): CommandList {
    const proxyCache = new Map<string, CommandProxy>();

    const getProxy = (command: Command): CommandProxy => {
      let proxy = proxyCache.get(command.id);

      if (!proxy) {
        proxy = this.createCommandProxy(command);
        proxyCache.set(command.id, proxy);
      }

      return proxy;
    };

    const target = commands.map(() => undefined);

    return new Proxy(target, {
      defineProperty() {
        throw new TypeError('CommandList is read-only.');
      },

      deleteProperty() {
        throw new TypeError('CommandList is read-only.');
      },
      get(target, property, receiver) {
        // Array length
        if (property === 'length') return commands.length;

        // Array index
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          const index = Number(property);
          const command = commands[index];
          return command ? getProxy(command) : undefined;
        }

        // Native array methods / properties
        return Reflect.get(target, property, receiver);
      },

      set() {
        throw new TypeError('CommandList is read-only.');
      },
    }) as unknown as CommandList;
  }

  private createCommandProxy(command: Command): CommandProxy {
    return new Proxy(command, {
      defineProperty() {
        throw new TypeError('CommandProxy is read-only.');
      },

      deleteProperty() {
        throw new TypeError('CommandProxy is read-only.');
      },

      get(target, property, receiver) {
        return Reflect.get(target, property, receiver);
      },

      set() {
        throw new TypeError('CommandProxy is read-only.');
      },
    });
  }
}
