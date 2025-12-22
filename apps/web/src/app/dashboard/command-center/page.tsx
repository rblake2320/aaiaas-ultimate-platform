'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

type Repo = {
  id: string;
  name: string;
  orchestratorBaseUrl: string;
  createdAt: string;
};

export default function CommandCenterPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [name, setName] = useState('local-ai');
  const [orchestratorBaseUrl, setOrchestratorBaseUrl] = useState('http://localhost:5000');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  const apiKeyOrUndefined = useMemo(() => (apiKey.trim() ? apiKey.trim() : undefined), [apiKey]);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [reposRes, runsRes] = await Promise.all([
        apiClient.listCommandCenterRepos(),
        apiClient.listCommandCenterRuns({ limitPerRepo: 20 }),
      ]);
      setRepos(reposRes.repos ?? []);
      setRuns(runsRes.runs ?? []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load Command Center data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const onRegisterRepo = async () => {
    setError(null);
    try {
      await apiClient.registerCommandCenterRepo({
        name,
        orchestratorBaseUrl,
        apiKey: apiKeyOrUndefined,
      });
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to register repo');
    }
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <main className="container mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Command Center</h1>
            <p className="text-muted-foreground">
              Manage orchestrator-backed agents across multiple repositories.
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>

        {error ? (
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Register a Repository</CardTitle>
            <CardDescription>
              Add an orchestrator base URL (example: <code>http://localhost:5000</code>).
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <Input
              value={orchestratorBaseUrl}
              onChange={(e) => setOrchestratorBaseUrl(e.target.value)}
              placeholder="Orchestrator base URL"
            />
            <div className="flex gap-2">
              <Input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API key (optional)"
              />
              <Button onClick={onRegisterRepo}>Add</Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Registered Repos</CardTitle>
              <CardDescription>{loading ? 'Loading…' : `${repos.length} repo(s)`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {repos.length === 0 && !loading ? (
                <div className="text-sm text-muted-foreground">No repos registered yet.</div>
              ) : null}
              {repos.map((r) => (
                <div key={r.id} className="rounded border p-3">
                  <div className="font-medium">{r.name}</div>
                  <div className="text-sm text-muted-foreground">{r.orchestratorBaseUrl}</div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Latest Runs (All Repos)</CardTitle>
              <CardDescription>{loading ? 'Loading…' : `${runs.length} run(s)`}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {runs.length === 0 && !loading ? (
                <div className="text-sm text-muted-foreground">No runs found.</div>
              ) : null}
              {runs.slice(0, 20).map((row: any) => (
                <div key={`${row.repoId}:${row.run?.run_id}`} className="rounded border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium">{row.repoName}</div>
                    <div className="text-xs text-muted-foreground">{row.run?.status}</div>
                  </div>
                  <div className="text-sm">{row.run?.task}</div>
                  <div className="text-xs text-muted-foreground">Run: {row.run?.run_id}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}

