import { describe, expect, test } from 'bun:test';
import { generateDeploymentId } from './drizzle-deployments.repository';

// A deployment id is used verbatim as a Docker image tag (`imageTagFor`), so it
// must satisfy Docker's tag grammar: first character alphanumeric or underscore,
// the rest alphanumeric / '.' / '_' / '-'. nanoid's default URL-safe alphabet
// could place a leading/trailing '-' that builds but fails `docker create` with
// "invalid reference format" — this guards against regressing to it.
const DOCKER_TAG = /^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/;

describe('generateDeploymentId', () => {
  test('always produces a Docker-tag-safe id (no leading/trailing separators)', () => {
    for (let attempt = 0; attempt < 5000; attempt += 1) {
      const id = generateDeploymentId();
      expect(id).toMatch(DOCKER_TAG);
      // Stronger than the tag grammar: the alphanumeric-only alphabet can never
      // emit '-' or '_' anywhere, so no edge position can break a reference.
      expect(id).toMatch(/^[a-zA-Z0-9]{21}$/);
    }
  });
});
