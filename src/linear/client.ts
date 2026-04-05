// Thin GraphQL client using native fetch (Node 18+). No SDK dependency.
// Includes exponential backoff retry for rate limits (429) and transient 5xx errors.

const LINEAR_API_URL = 'https://api.linear.app/graphql';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 4): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    // Retry on rate limit or transient server errors
    if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
      const retryAfter = res.headers.get('retry-after');
      const delayMs = retryAfter
        ? parseInt(retryAfter, 10) * 1000
        : Math.min(1000 * 2 ** attempt, 30_000); // exponential backoff capped at 30s
      await sleep(delayMs);
      continue;
    }
    return res;
  }
  throw new Error('Linear API: max retries exceeded');
}

export interface LinearProject {
  id: string;
  name: string;
  description?: string;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: { name: string };
  children?: LinearIssue[];
}

export interface CreateIssueInput {
  teamId: string;
  title: string;
  description?: string;
  projectId?: string;
  parentId?: string;
  assigneeId?: string;
  cycleId?: string;
  labelIds?: string[];
}

// Fetch the viewer's ID (the authenticated user)
export async function getViewerId(apiKey: string): Promise<string> {
  const data = await linearQuery<{ viewer: { id: string } }>(apiKey, '{ viewer { id } }');
  return data.viewer.id;
}

// Fetch the team's active cycle ID
export async function getActiveCycleId(apiKey: string, teamId: string): Promise<string | undefined> {
  const safeTeamId = teamId.replace(/["\\]/g, '');
  const data = await linearQuery<{ team: { activeCycle?: { id: string } } }>(
    apiKey, `{ team(id: "${safeTeamId}") { activeCycle { id } } }`
  );
  return data.team.activeCycle?.id;
}

// Find a Linear project ID by name (fuzzy match)
export async function findProjectByName(apiKey: string, teamId: string, name: string): Promise<string | undefined> {
  const safeTeamId = teamId.replace(/["\\]/g, '');
  const data = await linearQuery<{ team: { projects: { nodes: Array<{ id: string; name: string }> } } }>(
    apiKey, `{ team(id: "${safeTeamId}") { projects(first: 100, orderBy: updatedAt) { nodes { id name } } } }`
  );
  const projects = data.team.projects.nodes;
  // Exact match first, then case-insensitive
  const exact = projects.find(p => p.name === name);
  if (exact) return exact.id;
  const lower = name.toLowerCase();
  const fuzzy = projects.find(p => p.name.toLowerCase() === lower);
  return fuzzy?.id;
}

// Search for label IDs by name patterns
export async function findLabelIds(apiKey: string, teamId: string, patterns: RegExp[]): Promise<string[]> {
  const safeTeamId = teamId.replace(/["\\]/g, '');
  const data = await linearQuery<{ team: { labels: { nodes: Array<{ id: string; name: string }> } } }>(
    apiKey, `{ team(id: "${safeTeamId}") { labels(first: 100) { nodes { id name } } } }`
  );
  const labels = data.team.labels.nodes;
  const matched: string[] = [];
  for (const pattern of patterns) {
    const found = labels.find(l => pattern.test(l.name));
    if (found) matched.push(found.id);
  }
  return matched;
}

export async function linearQuery<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<T> {
  const response = await fetchWithRetry(LINEAR_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API HTTP error: ${response.status} ${response.statusText}`);
  }

  const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };

  if (json.errors && json.errors.length > 0) {
    const messages = json.errors.map(e => e.message).join('; ');
    throw new Error(`Linear API error: ${messages}`);
  }

  if (!json.data) {
    throw new Error('Linear API returned no data');
  }

  return json.data;
}

export async function getProject(apiKey: string, projectId: string): Promise<LinearProject> {
  const query = `
    query GetProject($id: String!) {
      project(id: $id) {
        id
        name
        description
      }
    }
  `;
  const data = await linearQuery<{ project: LinearProject }>(apiKey, query, { id: projectId });
  return data.project;
}

export async function getProjectIssues(apiKey: string, projectId: string): Promise<LinearIssue[]> {
  const query = `
    query GetProjectIssues($id: String!) {
      project(id: $id) {
        issues {
          nodes {
            id
            identifier
            title
            description
            state {
              name
            }
            children {
              nodes {
                id
                identifier
                title
                description
                state {
                  name
                }
              }
            }
          }
        }
      }
    }
  `;
  const data = await linearQuery<{
    project: {
      issues: {
        nodes: Array<LinearIssue & { children?: { nodes: LinearIssue[] } }>;
      };
    };
  }>(apiKey, query, { id: projectId });

  return data.project.issues.nodes.map(issue => ({
    ...issue,
    children: issue.children?.nodes,
  }));
}

export async function createIssue(apiKey: string, input: CreateIssueInput): Promise<string> {
  const query = `
    mutation CreateIssue($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
        }
      }
    }
  `;
  const data = await linearQuery<{
    issueCreate: { success: boolean; issue: { id: string; identifier: string } };
  }>(apiKey, query, { input });

  if (!data.issueCreate.success) {
    throw new Error('Linear createIssue returned success:false');
  }

  return data.issueCreate.issue.id;
}

export async function updateIssue(
  apiKey: string,
  issueId: string,
  input: Partial<CreateIssueInput>
): Promise<void> {
  const query = `
    mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
      }
    }
  `;
  const data = await linearQuery<{ issueUpdate: { success: boolean } }>(apiKey, query, {
    id: issueId,
    input,
  });

  if (!data.issueUpdate.success) {
    throw new Error(`Linear updateIssue returned success:false for issue ${issueId}`);
  }
}
