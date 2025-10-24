require('dotenv').config();

module.exports = {
  development: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL || {
      host: 'localhost',
      port: 5432,
      database: 'aaiaas',
      user: 'postgres',
      password: 'postgres'
    },
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),
      max: parseInt(process.env.DATABASE_POOL_MAX || '10', 10)
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },

  production: {
    client: 'postgresql',
    connection: process.env.DATABASE_URL,
    pool: {
      min: parseInt(process.env.DATABASE_POOL_MIN || '5', 10),
      max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10)
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './seeds'
    }
  },

  test: {
    client: 'postgresql',
    connection: process.env.TEST_DATABASE_URL || {
      host: 'localhost',
      port: 5432,
      database: 'aaiaas_test',
      user: 'postgres',
      password: 'postgres'
    },
    pool: {
      min: 1,
      max: 5
    },
    migrations: {
      directory: './migrations',
      tableName: 'knex_migrations'
    }
  }
};

