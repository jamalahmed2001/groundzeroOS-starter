import { NextResponse, type NextRequest } from 'next/server';
import { writeFileSync } from 'fs';
import { readConfig, getConfigPath } from '@/lib/config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const cfg = readConfig();
    return NextResponse.json({
      agentDriver:       cfg.agent_driver ?? 'claude-code',
      linearKeySet:      !!(cfg.linear?.api_key || process.env['LINEAR_API_KEY']),
      linearTeamId:      cfg.linear?.team_id ?? '',
      vaultRoot:         cfg.vault_root ?? '',
      llmModel:          cfg.llm?.model ?? '',
      openrouterKeySet:  !!(cfg.llm?.api_key || process.env['OPENROUTER_API_KEY']),
      lat:               cfg.location?.lat ?? 51.5074,
      lng:               cfg.location?.lng ?? -0.1278,
      modelTiers: {
        light:    cfg.model_tiers?.light    ?? '',
        standard: cfg.model_tiers?.standard ?? '',
        heavy:    cfg.model_tiers?.heavy    ?? '',
      },
      prompts: {
        executor:     cfg.prompts?.executor    ?? '',
        decompose:    cfg.prompts?.decompose   ?? '',
        atomise:      cfg.prompts?.atomise     ?? '',
        extend:       cfg.prompts?.extend      ?? '',
        replan:       cfg.prompts?.replan      ?? '',
        consolidate:  cfg.prompts?.consolidate ?? '',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json() as {
    agentDriver?: string;
    linearApiKey?: string;
    linearTeamId?: string;
    lat?: number;
    lng?: number;
    llmModel?: string;
    openrouterApiKey?: string;
    modelTiers?: { light?: string; standard?: string; heavy?: string };
    prompts?: { executor?: string; decompose?: string; atomise?: string; extend?: string; replan?: string; consolidate?: string };
  };

  try {
    const cfg = readConfig();

    if (body.agentDriver) cfg.agent_driver = body.agentDriver;
    if (body.llmModel || body.openrouterApiKey !== undefined) {
      cfg.llm = { ...(cfg.llm ?? {}) };
      if (body.llmModel !== undefined)         cfg.llm.model   = body.llmModel;
      if (body.openrouterApiKey !== undefined) cfg.llm.api_key = body.openrouterApiKey;
    }

    if (body.lat !== undefined || body.lng !== undefined) {
      cfg.location = { lat: body.lat ?? cfg.location?.lat ?? 51.5074, lng: body.lng ?? cfg.location?.lng ?? -0.1278 };
    }

    if (body.linearApiKey !== undefined || body.linearTeamId !== undefined) {
      cfg.linear = {
        enabled:  true,
        api_key:  body.linearApiKey ?? cfg.linear?.api_key ?? '',
        team_id:  body.linearTeamId ?? cfg.linear?.team_id ?? '',
      };
    }

    if (body.modelTiers) {
      const t = body.modelTiers;
      cfg.model_tiers = {
        ...(cfg.model_tiers ?? {}),
        ...(t.light    ? { light:    t.light    } : {}),
        ...(t.standard ? { standard: t.standard } : {}),
        ...(t.heavy    ? { heavy:    t.heavy    } : {}),
      };
    }

    if (body.prompts) {
      const p = body.prompts;
      const existing = cfg.prompts ?? {};
      // Only save non-empty values; clear if empty string sent
      cfg.prompts = {
        ...existing,
        ...(p.executor !== undefined    ? { executor:    p.executor    || undefined } : {}),
        ...(p.decompose !== undefined   ? { decompose:   p.decompose   || undefined } : {}),
        ...(p.atomise !== undefined     ? { atomise:     p.atomise     || undefined } : {}),
        ...(p.extend !== undefined      ? { extend:      p.extend      || undefined } : {}),
        ...(p.replan !== undefined      ? { replan:      p.replan      || undefined } : {}),
        ...(p.consolidate !== undefined ? { consolidate: p.consolidate || undefined } : {}),
      };
      // Remove the key entirely if all prompts are empty
      if (Object.values(cfg.prompts).every(v => !v)) delete cfg.prompts;
    }

    writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8');
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
