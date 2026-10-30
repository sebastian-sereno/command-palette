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

  registerCommand(node: CommandNode): void;
  registerCommand(path: readonly string[], node: CommandNode): void;
  registerCommand(nodeOrPath: CommandNode | readonly string[], other?: CommandNode): void {
    const isSubCommand = Array.isArray(nodeOrPath);
    const node = !isSubCommand ? (nodeOrPath as CommandNode) : (other as CommandNode);

    // Check defaults
    this.validateDetails(node);
    if (isExecutableCommand(node)) {
      // We need this to be a executable command
      if (typeof node.execute !== 'function')
        throw new TypeError(`Command "${node.id}" needs an executor.`);
    } else {
      // Otherwise this is a command tab
      if (this.commands.has(node.id))
        throw new Error(`Command "${node.id}" is already registered.`);
    }

    if (Array.isArray(nodeOrPath)) {
      // This a subcommand
      const parent = this.getNode(nodeOrPath satisfies string[]);

      if (!parent || !isCommandTab(parent))
        throw new Error(`Parent "${nodeOrPath.join(' ')}" is not a command tab.`);
      if (parent.children.has(node.id))
        throw new Error(`Subcommand "${node.id}" already exists under "${nodeOrPath.join(' ')}".`);

      parent.children.set(node.id, node);
    } else {
      // This is a root command

      if (this.commands.has(node.id))
        throw new Error(`Command with ID "${node.id}" is already registered.`);

      this.commands.set(node.id, node);
    }
  }

  unregisterCommand(path: string): boolean;
  unregisterCommand(path: readonly string[]): boolean;
  unregisterCommand(path: readonly string[] | string): boolean {
    // We need the array to have values...
    // Thankfully, this will also check the text length
    if (path.length === 0) return false;
    const target = Array.isArray(path) ? path.pop()! : path;

    if (Array.isArray(path) && path.length !== 0) {
      const parent = this.getNode(path);
      if (!parent || isExecutableCommand(parent)) return false;
      return parent.children.delete(target);
    }

    return this.commands.delete(target);
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

  getCommand(path: string, onlyCommand: true): CommandProxy | undefined;
  getCommand(path: string, onlyCommand?: false): CommandNodeProxy | undefined;
  getCommand(path: readonly string[], onlyCommand: true): CommandProxy | undefined;
  getCommand(path: readonly string[], onlyCommand?: false): CommandNodeProxy | undefined;
  getCommand(path: readonly string[] | string, onlyCommand: true): CommandProxy | undefined;
  getCommand(path: readonly string[] | string, onlyCommand?: false): CommandNodeProxy | undefined;
  getCommand(path: readonly string[] | string, onlyCommand?: boolean) {
    if (path.length === 0) return undefined;
    let command: CommandNode | undefined;

    const parent = this.getNode(this.currentPath);

    if (Array.isArray(path)) command = this.getNode(path);
    else if (parent && !isCommandTab(parent)) return undefined;
    else if (parent) command = parent.children.get(path as string);
    else command = this.commands.get(path as string);

    if (!command || (isCommandTab(command) && onlyCommand)) return undefined;
    return this.createCommandProxy(command);
  }

  getCommandByPath(path: readonly string[]): CommandNodeProxy | undefined {
    if (path.length === 0) return undefined;
    const node = this.getNode(path);
    if (!node || isCommandTab(node)) return undefined;
    return this.createCommandProxy(node) as CommandNodeProxy;
  }

  getCommands(path?: never): CommandList;
  getCommands(path: readonly string[]): CommandList;
  getCommands(path?: readonly string[] | never) {
    let commands: CommandNode[] = [];

    if (path && Array.isArray(path) && path.length > 0) {
      const parent = this.getNode(path);
      if (parent && !isExecutableCommand(parent)) {
        commands = Array.from(parent.children.values());
      }
    } else commands = Array.from(this.commands.values());

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
