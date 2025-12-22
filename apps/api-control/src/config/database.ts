import knex from 'knex';
// knexfile is JavaScript; load via require to avoid TS declaration hassles.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const knexConfig = require('../../knexfile') as Record<string, any>;

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment as keyof typeof knexConfig];

export const db = knex(config);

export default db;
