/** Normalize Zod's JSON Schema output to the subset required by OpenAI strict mode. */
export function sanitizeStrictJsonSchema(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};

  const source = input as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === '$schema' || key === 'default' || key === 'additionalProperties' || key === 'required') continue;
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      const properties: Record<string, unknown> = {};
      for (const [propertyName, propertySchema] of Object.entries(value as Record<string, unknown>)) {
        properties[propertyName] = sanitizeStrictJsonSchema(propertySchema);
      }
      output.properties = properties;
      output.required = Object.keys(properties);
      output.additionalProperties = false;
      continue;
    }
    if (key === 'items') {
      output.items = sanitizeStrictJsonSchema(value);
      continue;
    }
    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      output[key] = Array.isArray(value) ? value.map((item) => sanitizeStrictJsonSchema(item)) : value;
      continue;
    }
    output[key] = value;
  }

  if (output.type === 'object' && !output.properties) {
    output.properties = {};
    output.required = [];
    output.additionalProperties = false;
  }
  return output;
}
