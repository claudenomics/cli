export interface SSEEvent {
  name: string | undefined;
  data: string;
}

export function* splitSSE(text: string): Generator<SSEEvent> {
  for (const block of text.split(/\n\n/)) {
    let name: string | undefined;
    const dataLines: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) name = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) yield { name, data: dataLines.join('\n') };
  }
}

export function tryParse<T>(text: string): T | undefined {
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}
