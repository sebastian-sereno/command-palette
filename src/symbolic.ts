export type SymbolicCommand = {
  id: string;
  sourceId: string;
  sourcePath: string[];
  parentPath: string[];
  title: string;
  description: string;
  keywords: string[];
  category: string[];
};

export type SymbolicRegistrationOptions = {
  recursive?: boolean;
  includeDirectCommands?: boolean;
};

export type SymbolicCommandAdapter = {
  registerSymbolicCommand(command: SymbolicCommand): void;
  unregisterSymbolicCommand?(id: string): void;
  getSymbolicCommands(parentPath?: readonly string[]): SymbolicCommand[];
};

/**
 * Default symbolic command adapter.
 *
 * Stores symbolic references independently of the
 * underlying executable command registrations.
 */
export class DefaultSymbolicCommandAdapter implements SymbolicCommandAdapter {
  private readonly registrations = new Map<string, SymbolicCommand>();

  registerSymbolicCommand(command: SymbolicCommand): void {
    if (this.registrations.has(command.id)) return;

    this.registrations.set(command.id, {
      ...command,
      category: [...command.category],
      keywords: [...command.keywords],
      parentPath: [...command.parentPath],
      sourcePath: [...command.sourcePath],
    });
  }

  unregisterSymbolicCommand(id: string): void {
    this.registrations.delete(id);
  }

  getSymbolicCommands(parentPath?: readonly string[]): SymbolicCommand[] {
    const commands = Array.from(this.registrations.values());

    const filtered = parentPath
      ? commands.filter(
          (command) =>
            command.parentPath.length === parentPath.length &&
            command.parentPath.every((part, index) => part === parentPath[index]),
        )
      : commands;

    return filtered.map((command) => ({
      ...command,
      category: [...command.category],
      keywords: [...command.keywords],
      parentPath: [...command.parentPath],
      sourcePath: [...command.sourcePath],
    }));
  }

  has(id: string): boolean {
    return this.registrations.has(id);
  }

  clear(): void {
    this.registrations.clear();
  }
}
