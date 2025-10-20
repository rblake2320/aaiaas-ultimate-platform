/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Enable UUID extension
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

  // Organizations table
  await knex.schema.createTable('organizations', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('name', 255).notNullable();
    table.string('slug', 255).notNullable().unique();
    table.enum('plan', ['free', 'pro', 'enterprise']).defaultTo('free');
    table.enum('status', ['active', 'suspended', 'cancelled']).defaultTo('active');
    table.jsonb('settings').defaultTo('{}');
    table.jsonb('limits').defaultTo('{}');
    table.timestamps(true, true);
    
    table.index('slug');
    table.index('status');
  });

  // Users table
  await knex.schema.createTable('users', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.string('email', 255).notNullable().unique();
    table.string('password_hash', 255).notNullable();
    table.string('name', 255);
    table.string('avatar_url', 500);
    table.boolean('email_verified').defaultTo(false);
    table.timestamp('email_verified_at');
    table.enum('status', ['active', 'suspended', 'deleted']).defaultTo('active');
    table.timestamp('last_login_at');
    table.timestamps(true, true);
    
    table.index('email');
    table.index('status');
  });

  // Organization members table
  await knex.schema.createTable('organization_members', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.enum('role', ['owner', 'admin', 'member', 'viewer']).defaultTo('member');
    table.timestamps(true, true);
    
    table.unique(['organization_id', 'user_id']);
    table.index('organization_id');
    table.index('user_id');
  });

  // API Keys table
  await knex.schema.createTable('api_keys', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.string('key_hash', 255).notNullable().unique();
    table.string('key_prefix', 20).notNullable();
    table.jsonb('permissions').defaultTo('[]');
    table.timestamp('last_used_at');
    table.timestamp('expires_at');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('organization_id');
    table.index('key_prefix');
    table.index('is_active');
  });

  // Refresh tokens table
  await knex.schema.createTable('refresh_tokens', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 255).notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.boolean('is_revoked').defaultTo(false);
    table.timestamps(true, true);
    
    table.index('user_id');
    table.index('token_hash');
  });

  // Subscriptions table
  await knex.schema.createTable('subscriptions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('stripe_subscription_id', 255).unique();
    table.string('stripe_customer_id', 255);
    table.enum('status', ['active', 'cancelled', 'past_due', 'trialing']).defaultTo('active');
    table.timestamp('current_period_start');
    table.timestamp('current_period_end');
    table.timestamp('cancelled_at');
    table.timestamps(true, true);
    
    table.index('organization_id');
    table.index('stripe_subscription_id');
  });

  // Usage records table
  await knex.schema.createTable('usage_records', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('metric', 100).notNullable(); // tokens, api_calls, storage_mb
    table.integer('value').notNullable();
    table.jsonb('metadata').defaultTo('{}');
    table.timestamp('recorded_at').notNullable().defaultTo(knex.fn.now());
    
    table.index('organization_id');
    table.index('metric');
    table.index('recorded_at');
  });

  // Workflows table
  await knex.schema.createTable('workflows', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('created_by').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('name', 255).notNullable();
    table.text('description');
    table.jsonb('definition').notNullable().defaultTo('{}');
    table.enum('status', ['draft', 'active', 'paused', 'archived']).defaultTo('draft');
    table.timestamps(true, true);
    
    table.index('organization_id');
    table.index('status');
  });

  // Workflow runs table
  await knex.schema.createTable('workflow_runs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('workflow_id').notNullable().references('id').inTable('workflows').onDelete('CASCADE');
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.enum('status', ['pending', 'running', 'completed', 'failed', 'cancelled']).defaultTo('pending');
    table.jsonb('input').defaultTo('{}');
    table.jsonb('output').defaultTo('{}');
    table.text('error_message');
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamps(true, true);
    
    table.index('workflow_id');
    table.index('organization_id');
    table.index('status');
    table.index('created_at');
  });

  // Webhooks table
  await knex.schema.createTable('webhooks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').notNullable().references('id').inTable('organizations').onDelete('CASCADE');
    table.string('url', 500).notNullable();
    table.string('secret', 255).notNullable();
    table.jsonb('events').notNullable().defaultTo('[]');
    table.boolean('is_active').defaultTo(true);
    table.timestamps(true, true);
    
    table.index('organization_id');
    table.index('is_active');
  });

  // Webhook deliveries table
  await knex.schema.createTable('webhook_deliveries', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('webhook_id').notNullable().references('id').inTable('webhooks').onDelete('CASCADE');
    table.string('event_type', 100).notNullable();
    table.jsonb('payload').notNullable();
    table.integer('response_status');
    table.text('response_body');
    table.integer('attempt_count').defaultTo(0);
    table.timestamp('delivered_at');
    table.timestamps(true, true);
    
    table.index('webhook_id');
    table.index('event_type');
    table.index('created_at');
  });

  // Audit logs table
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('organization_id').references('id').inTable('organizations').onDelete('CASCADE');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100).notNullable();
    table.string('resource_type', 100);
    table.uuid('resource_id');
    table.jsonb('metadata').defaultTo('{}');
    table.string('ip_address', 45);
    table.string('user_agent', 500);
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    
    table.index('organization_id');
    table.index('user_id');
    table.index('action');
    table.index('created_at');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
  await knex.schema.dropTableIfExists('webhook_deliveries');
  await knex.schema.dropTableIfExists('webhooks');
  await knex.schema.dropTableIfExists('workflow_runs');
  await knex.schema.dropTableIfExists('workflows');
  await knex.schema.dropTableIfExists('usage_records');
  await knex.schema.dropTableIfExists('subscriptions');
  await knex.schema.dropTableIfExists('refresh_tokens');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('organization_members');
  await knex.schema.dropTableIfExists('users');
  await knex.schema.dropTableIfExists('organizations');
};
