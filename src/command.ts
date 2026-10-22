export type Command<TContext = unknown> = {
  id: string;
  title: string;
  description: string;
  keywords: string[];
  category: string[];
  shortcut: string;
  execute: (context: TContext) => unknown | Promise<unknown>;
  extras?: Record<string, any>;
};
