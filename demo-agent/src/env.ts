export function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing env var ${name}. See .env.example`);
    process.exit(1);
  }
  return v;
}
