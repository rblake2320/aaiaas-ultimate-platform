/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
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
exports.down = async function (knex) {
  const hasUserId = await knex.schema.hasColumn('workflow_runs', 'user_id');
  if (hasUserId) {
    await knex.schema.alterTable('workflow_runs', (table) => {
      table.dropIndex('user_id');
      table.dropColumn('user_id');
    });
  }
};

