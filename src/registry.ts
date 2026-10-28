import {
  type Command,
  type CommandNode,
  type CommandTab,
  isCommandTab,
  isExecutableCommand,
} from './command.js';
import type { CommandList, CommandNodeProxy, CommandProxy } from './proxy.js';

export class CommandRegistry {
  private readonly commands = new Map<string, CommandNode>();
  private currentPath: string[] = [];

  getCurrentPath(): readonly string[] {
    return [...this.currentPath];
  }

  getCurrentCommands(): CommandNode[] {
    if (this.currentPath.length === 0) return [...this.commands.values()];
    const current = this.getNode(this.currentPath);
    return current && isCommandTab(current) ? [...current.children.values()] : [];
  }

  enterCommand(id: string): boolean {
    const currentCommands = this.getCurrentCommands();
    const node = currentCommands.find((command) => command.id === id);
    if (!node || !isCommandTab(node)) return false;
    this.currentPath = [...this.currentPath, id];
    return true;
  }

  goBack(): boolean {
    if (this.currentPath.length === 0) return false;
    this.currentPath = this.currentPath.slice(0, -1);
    return true;
  }

  goToRoot(): void {
    this.currentPath = [];
  }

  isAtRoot(): boolean {
    return this.currentPath.length === 0;
  }

  registerCommand(command: Command): void {
    this.validateDetails(command);

    if (this.commands.has(command.id))
      throw new Error(`Command "${command.id}" is already registered.`);
    if (typeof command.execute !== 'function')
      throw new TypeError(`Command "${command.id}" needs an executor.`);
    if (this.commands.has(command.id))
      throw new Error(`Command with ID "${command.id}" is already registered.`);

    this.commands.set(command.id, command);
  }

  registerCommandTab(commandTab: CommandTab): void {
    this.validateDetails(commandTab);

    if (this.commands.has(commandTab.id))
      throw new Error(`Command "${commandTab.id}" is already registered.`);

    this.commands.set(commandTab.id, commandTab);
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

    this.validateDetails(replacement);
    this.commands.set(id, replacement);
    return true;
  }

  getCommandByID(id: Command['id'], enforceCommand: true): CommandProxy | undefined;
  getCommandByID(id: Command['id'], enforceCommand?: false): CommandNodeProxy | undefined;
  getCommandByID(
    id: Command['id'],
    enforceCommand: boolean = false,
  ): CommandProxy | CommandNodeProxy | undefined {
    const node = this.commands.get(id);
    if (!node || (isCommandTab(node) && enforceCommand)) return undefined;
    return this.createCommandProxy(node);
  }

  getAllCommands(): CommandList {
    const commands = Array.from(this.commands.values());
    return this.createCommandListProxy(commands);
  }

  private validateDetails(command: CommandNode): void {
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
  }

  private createCommandListProxy(commands: readonly CommandNode[]): CommandList {
    const proxyCache = new WeakMap<object, CommandNodeProxy>();

    const getProxy = (command: CommandNode): CommandNodeProxy => {
      let proxy = proxyCache.get(command);

      if (!proxy) {
        proxy = this.createCommandProxy(command);
        proxyCache.set(command, proxy);
      }

      return proxy;
    };

    const target = commands.map(getProxy);

    return new Proxy(target, {
      defineProperty() {
        throw new TypeError('CommandList is read-only.');
      },

      deleteProperty() {
        throw new TypeError('CommandList is read-only.');
      },

      set() {
        throw new TypeError('CommandList is read-only.');
      },
    }) as unknown as CommandList;
  }

  private createCommandProxy(command: CommandNode): CommandNodeProxy {
    const registry = this;

    return new Proxy(command, {
      defineProperty() {
        throw new TypeError('CommandProxy is read-only.');
      },

      deleteProperty() {
        throw new TypeError('CommandProxy is read-only.');
      },

      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver);

        if (property === 'children' && 'children' in target) {
          return registry.createCommandListProxy(
            Array.from((target as CommandTab).children.values()),
          );
        }

        return value;
      },

      set() {
        throw new TypeError('CommandProxy is read-only.');
      },
    });
  }

  registerSubcommand(parentPath: readonly string[], node: CommandNode): void {
    this.validateDetails(node);
    const parent = this.getNode(parentPath);

    if (!parent || !isCommandTab(parent))
      throw new Error(`Parent "${parentPath.join(' ')}" is not a command tab.`);
    if (parent.children.has(node.id))
      throw new Error(`Subcommand "${node.id}" already exists under "${parentPath.join(' ')}".`);
    if (!isCommandTab(node) && typeof node.execute !== 'function')
      throw new TypeError(`Command "${node.id}" needs an executor.`);

    parent.children.set(node.id, node);
  }

  unregisterSubcommand(parentPath: readonly string[], subcommandId: string): boolean {
    const parent = this.getNode(parentPath);
    if (!parent || isExecutableCommand(parent)) return false;
    return parent.children.delete(subcommandId);
  }

  getCommandByPath(path: readonly string[]): CommandNodeProxy | undefined {
    if (path.length === 0) return undefined;
    const node = this.getNode(path);
    if (!node || isCommandTab(node)) return undefined;
    return this.createCommandProxy(node) as CommandNodeProxy;
  }

  getSubcommands(parentPath: readonly string[]): CommandList {
    const parent = this.getNode(parentPath);
    if (!parent || isExecutableCommand(parent)) return this.createCommandListProxy([]);

    const commands = Array.from(parent.children.values());
    return this.createCommandListProxy(commands);
  }

  private getNode(path: readonly string[]): CommandNode | undefined {
    if (path.length === 0) return undefined;
    let node = this.commands.get(path[0]!);

    for (const id of path.slice(1)) {
      if (!node || !isCommandTab(node)) return undefined;
      node = node.children.get(id);
    }

    return node;
  }
}
