export type Command<TContext = unknown> = {
  shortcut: string;
  execute: (context: TContext) => unknown | Promise<unknown>;
  extras?: Record<string, unknown>;
} & CommandDetails;

export type CommandDetails = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  category: string[];
};

export type CommandTab = {
  children: Map<string, CommandNode>;
} & CommandDetails;

export type CommandNode<TContext = unknown> = Command<TContext> | CommandTab;

export function isCommandTab(node: CommandNode): node is CommandTab {
  return 'children' in node;
}

export function isExecutableCommand(node: CommandNode): node is Command {
  return !isCommandTab(node);
}
