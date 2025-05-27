export interface StatOption {
  id: string;
  text: string;
  type: string;
  option?: Record<string, unknown>;
}

interface StatEntry {
  id: string;
  text: string;
  option?: Record<string, unknown>;
}

export interface StatGroup {
  label: string;
  entries: StatEntry[];
}
