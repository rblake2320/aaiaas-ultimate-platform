/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // Workflow triggers (schedules + external events)
  await knex.schema.createTable('workflow_triggers', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table
      .uuid('workflow_id')
      .notNullable()
      .references('id')
      .inTable('workflows')
      .onDelete('CASCADE');
    table
      .uuid('organization_id')
      .notNullable()
      .references('id')
      .inTable('organizations')
      .onDelete('CASCADE');

    // interval: fixed minute-based schedule (e.g. 5m)
    // hourly: top-of-hour schedule
    // git_push: GitHub push event webhook trigger
    table
      .enum('type', ['interval', 'hourly', 'git_push'], {
        useNative: true,
        enumName: 'workflow_trigger_type',
      })
      .notNullable();

    table.integer('interval_minutes'); // only for type=interval
    table.jsonb('config').notNullable().defaultTo('{}'); // e.g. repo/branch filters for git_push
    table.boolean('is_active').notNullable().defaultTo(true);

    table.timestamp('last_triggered_at');
    table.timestamp('next_trigger_at'); // only for interval/hourly

    table.timestamps(true, true);

    table.unique(['workflow_id']);
    table.index(['organization_id']);
    table.index(['type']);
    table.index(['is_active']);
    table.index(['next_trigger_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('workflow_triggers');
  await knex.raw('DROP TYPE IF EXISTS workflow_trigger_type');
};

