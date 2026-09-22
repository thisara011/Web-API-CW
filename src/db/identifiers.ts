export function quoteIdentifier(value: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error('Database identifiers must be lowercase letters, digits or underscores, starting with a letter (maximum 63 characters)');
  }
  return `"${value}"`;
}

export function applicationSchema(value: string): string {
  const quoted = quoteIdentifier(value);
  if (value === 'public' || value === 'information_schema' || value.startsWith('pg_')) {
    throw new Error('Use a dedicated application schema, not a shared or PostgreSQL system schema');
  }
  return quoted;
}
