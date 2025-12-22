import knex from 'knex';
// knexfile is JS; use require to avoid TS declaration issues
// eslint-disable-next-line @typescript-eslint/no-var-requires
const knexConfig: Record<string, any> = require('../../knexfile');

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment as keyof typeof knexConfig];

export const db = knex(config);

export default db;
