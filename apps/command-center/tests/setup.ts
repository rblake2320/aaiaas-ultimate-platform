process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? 'http://localhost:3000';
process.env.COMMAND_CENTER_STORE_PATH =
  process.env.COMMAND_CENTER_STORE_PATH ?? '/tmp/command-center-test-store.json';

