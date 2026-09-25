import { describe, expect, it } from 'vitest';
import { sanitizeStrictJsonSchema } from '../../server/ai/strict-json-schema';
import { normalizeAiNullable } from '../../server/ai/ai-gateway';

function assertStrictSchema(schema: any): void {
  if (schema && typeof schema === 'object') {
    expect(schema.default).toBeUndefined();
    if (schema.type === 'object' || schema.properties) {
      expect(schema.additionalProperties).toBe(false);
      const names = Object.keys(schema.properties || {}).sort();
      expect([...schema.required || []].sort()).toEqual(names);
      Object.values(schema.properties || {}).forEach(assertStrictSchema);
    }
    if (schema.items) assertStrictSchema(schema.items);
    for (const key of ['anyOf', 'oneOf', 'allOf']) {
      (schema[key] || []).forEach(assertStrictSchema);
    }
  }
}

describe('OpenAI strict JSON schema sanitizer', () => {
  it('requires every property, removes defaults, and closes nested objects', () => {
    const schema = sanitizeStrictJsonSchema({
      type: 'object',
      properties: {
        title: { type: 'string', default: 'x' },
        nested: { type: 'object', properties: { value: { type: 'number', default: 1 } }, required: ['value'] },
        rows: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' } } } },
      },
      required: ['title'],
      additionalProperties: true,
    });
    assertStrictSchema(schema);
  });

  it('normalizes nullable AI wire values before domain parsing', () => {
    const normalized = normalizeAiNullable({ title: null, nested: { note: null }, rows: [null, { value: 1 }] });
    expect(normalized).toEqual({ title: undefined, nested: { note: undefined }, rows: [undefined, { value: 1 }] });
  });
});
