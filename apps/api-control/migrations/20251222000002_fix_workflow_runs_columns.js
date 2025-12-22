/**
 * Fix workflow_runs schema mismatches with runtime code.
 *
 * - Adds user_id (required by controllers/engine)
 * - Keeps existing error_message column; runtime should write to it
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasUserId = await knex.schema.hasColumn('workflow_runs', 'user_id');
  if (!hasUserId) {
    await knex.schema.alterTable('workflow_runs', (table) => {
      table
        .uuid('user_id')
        .nullable()
        .references('id')
        .inTable('users')
        .onDelete('SET NULL');
      table.index('user_id');
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasUserId = await knex.schema.hasColumn('workflow_runs', 'user_id');
  if (hasUserId) {
    await knex.schema.alterTable('workflow_runs', (table) => {
      table.dropIndex('user_id');
      table.dropColumn('user_id');
    });
  }
};

