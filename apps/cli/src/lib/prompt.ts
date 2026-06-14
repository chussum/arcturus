import readline from 'node:readline';

/** One selectable choice: a display label and the value returned when chosen. */
export interface Choice<T> {
  label: string;
  value: T;
}

/**
 * Prompts the user to pick one of a numbered list of choices on the terminal.
 * Empty input (just Enter) takes the first choice (the default). Out-of-range or
 * non-numeric input re-asks. Callers must only invoke this when `process.stdin.isTTY`.
 */
export async function selectOption<T>(question: string, choices: Choice<T>[]): Promise<T> {
  const first = choices[0];
  if (!first) throw new Error('selectOption requires at least one choice');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(question);
    choices.forEach((choice, i) => {
      const marker = i === 0 ? ' (default)' : '';
      console.log(`  ${i + 1}) ${choice.label}${marker}`);
    });

    while (true) {
      const answer = (await question_(rl, `Choose [1-${choices.length}], default 1: `)).trim();
      if (answer === '') return first.value;
      const index = Number.parseInt(answer, 10);
      const chosen = choices[index - 1];
      if (chosen && Number.isInteger(index) && index >= 1 && index <= choices.length) {
        return chosen.value;
      }
      console.log(`Please enter a number between 1 and ${choices.length}.`);
    }
  } finally {
    rl.close();
  }
}

function question_(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => rl.question(prompt, resolve));
}
