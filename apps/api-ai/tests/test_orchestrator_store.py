import time

from services.orchestrator_store import OrchestratorStore


def test_enqueue_claim_and_succeed(tmp_path):
    db = tmp_path / "orch.db"
    store = OrchestratorStore(str(db))
    try:
        agent_id = store.create_agent(
            name="Test Agent",
            agent_type="general",
            config={"model": "gpt-4.1-mini", "temperature": 0.1, "max_iterations": 1},
        )
        run_id = store.enqueue_run(agent_id=agent_id, task="hello", max_attempts=2)

        run = store.claim_due_run(worker_id="w1", lease_seconds=10)
        assert run is not None
        assert run.run_id == run_id
        assert run.status == "running"
        assert run.lease_owner == "w1"

        store.mark_succeeded(run_id=run_id, worker_id="w1", result={"answer": "ok"})
        final = store.get_run(run_id)
        assert final is not None
        assert final.status == "succeeded"
        assert final.last_error is None
    finally:
        store.close()


def test_recover_stale_running_run(tmp_path):
    db = tmp_path / "orch.db"
    store = OrchestratorStore(str(db))
    try:
        agent_id = store.create_agent(name="A", agent_type="general", config={})
        run_id = store.enqueue_run(agent_id=agent_id, task="t")
        run = store.claim_due_run(worker_id="w1", lease_seconds=1)
        assert run is not None

        # Force lease expiry in the past
        store._conn.execute(
            "UPDATE orchestrator_runs SET lease_expires_at=?, status='running' WHERE run_id=?",
            (int(time.time()) - 10, run_id),
        )
        store._conn.commit()

        changed = store.recover_stale_runs(stale_before_epoch=int(time.time()))
        assert changed == 1
        recovered = store.get_run(run_id)
        assert recovered is not None
        assert recovered.status == "retry"
        assert recovered.lease_owner is None
    finally:
        store.close()

