import { Command } from "./Command.js";

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private aliasMap: Map<string, Command> = new Map();

  register(command: Command) {
    this.commands.set(command.name, command);
    for (const alias of command.aliases) {
      this.aliasMap.set(alias, command);
    }
  }

  get(name: string): Command | undefined {
    return this.commands.get(name) || this.aliasMap.get(name);
  }

  getAll(): Command[] {
    return Array.from(this.commands.values());
  }

  findSimilar(input: string): string | null {
    const cleanInput = input.replace(/^\//, "").toLowerCase();

    for (const command of this.commands.values()) {
      if (command.name.startsWith(cleanInput) && cleanInput.length >= 2) {
        return command.name;
      }
      for (const alias of command.aliases) {
        // aliases often start with / or are short. 
        // We clean them for comparison if needed, but aliases in registry should probably be stored clean or as defined.
        // The original code checked specific variants like "/tasks" vs "tasks".
        // Here we assume aliases are strict matches usually, but for "similar" check, we can check prefix.
        const cleanAlias = alias.replace(/^\//, "").toLowerCase();
        if (cleanAlias.startsWith(cleanInput) && cleanInput.length >= 2) {
          return command.name;
        }
      }
    }
    return null;
  }
}
