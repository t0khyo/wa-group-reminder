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

  /**
   * Normalize command name for fuzzy matching
   * Removes leading slash and dashes, converts to lowercase
   * Example: "/all-tasks" → "alltasks"
   */
  private normalize(str: string): string {
    return str.replace(/^\//, "").replace(/-/g, "").toLowerCase();
  }

  /**
   * Find all commands that match the given prefix
   * Supports dash-skipping: /allt matches /all-tasks
   */
  findAllMatching(input: string): string[] {
    const normalizedInput = this.normalize(input);
    const matches: Set<string> = new Set();

    // Only search if input has at least 1 character
    if (normalizedInput.length < 1) {
      return [];
    }

    for (const command of this.commands.values()) {
      // Check command name
      if (this.normalize(command.name).startsWith(normalizedInput)) {
        matches.add(command.name);
      }

      // Check all aliases
      for (const alias of command.aliases) {
        if (this.normalize(alias).startsWith(normalizedInput)) {
          matches.add(command.name); // Always return canonical name
        }
      }
    }

    return Array.from(matches).sort();
  }

  /**
   * Get the best match for a partial command
   * Returns: { type: 'exact' | 'unique' | 'ambiguous' | 'none', matches: string[] }
   */
  findBestMatch(input: string): { type: string; matches: string[] } {
    // First try exact match
    const exact = this.get(input);
    if (exact) {
      return { type: 'exact', matches: [exact.name] };
    }

    // Then try partial matching
    const allMatches = this.findAllMatching(input);
    
    if (allMatches.length === 0) {
      return { type: 'none', matches: [] };
    }
    
    if (allMatches.length === 1) {
      return { type: 'unique', matches: allMatches };
    }
    
    return { type: 'ambiguous', matches: allMatches };
  }

  /**
   * Find similar command (legacy method, now uses findBestMatch)
   * Returns single match if unique, null otherwise
   */
  findSimilar(input: string): string | null {
    const result = this.findBestMatch(input);
    return result.type === 'unique' ? result.matches[0] : null;
  }
}
