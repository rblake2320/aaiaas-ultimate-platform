import knex from 'knex';

// Import knexfile using require to avoid TypeScript issues with JS module
const knexConfig = require('../../knexfile');

const environment = process.env.NODE_ENV || 'development';
const config = knexConfig[environment];

export const db = knex(config);

export default db;
