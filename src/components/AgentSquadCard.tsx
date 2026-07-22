import type { FixtureAgentRecord } from '../types';

interface AgentSquadCardProps {
  agent: FixtureAgentRecord;
}

const statusClass: Record<FixtureAgentRecord['status'], string> = {
  Working: 'working',
  Blocked: 'blocked',
  'Review Ready': 'review-ready',
  'Needs User Decision': 'needs-decision',
  Done: 'done',
  Idle: 'idle',
};

const heroProfiles: Record<
  FixtureAgentRecord['agentId'],
  {
    theme: string;
    callsign: string;
    icon: 'arcane' | 'shield' | 'seal' | 'gear' | 'book' | 'key';
    title: string;
  }
> = {
  'AG-ARCH': {
    theme: 'arch',
    callsign: 'Blueprint caster',
    icon: 'arcane',
    title: 'Arcane Architect',
  },
  'AG-SEC': {
    theme: 'sec',
    callsign: 'Redline sentinel',
    icon: 'shield',
    title: 'Shield Warden',
  },
  'AG-REVIEW': {
    theme: 'review',
    callsign: 'Seal arbiter',
    icon: 'seal',
    title: 'Golden Elder',
  },
  'AG-CODE': {
    theme: 'code',
    callsign: 'Core mechanic',
    icon: 'gear',
    title: 'Machine Engineer',
  },
  'AG-DOCS': {
    theme: 'docs',
    callsign: 'Decision scholar',
    icon: 'book',
    title: 'Violet Archivist',
  },
  'AG-GIT': {
    theme: 'git',
    callsign: 'Branch keeper',
    icon: 'key',
    title: 'Repo Gatekeeper',
  },
};

export function AgentSquadCard({ agent }: AgentSquadCardProps) {
  const reason = agent.blockedReason ?? agent.decisionReason ?? agent.activityIndicator;
  const statusTone = statusClass[agent.status];
  const profile = heroProfiles[agent.agentId];
  const sourcePreview = agent.sourceRefs.slice(0, 2);

  return (
    <article className={`agent-card agent-${statusTone} hero-${profile.theme}`}>
      <div className="agent-card-hero" aria-label={`${agent.agentId} ${profile.title} visual`}>
        <div className="hero-field" aria-hidden="true">
          <span className="hero-grid-line line-a" />
          <span className="hero-grid-line line-b" />
          <span className="hero-grid-line line-c" />
          <span className="hero-aura" />
          <span className="hero-orbit orbit-a" />
          <span className="hero-orbit orbit-b" />
          <span className="hero-particle particle-a" />
          <span className="hero-particle particle-b" />
          <span className="hero-particle particle-c" />
          <span className="hero-motion-trail" />
          <span className="hero-silhouette">
            <span className="hero-hood" />
            <span className="hero-torso" />
            <span className="hero-cape" />
            <span className="hero-arm arm-left" />
            <span className="hero-arm arm-right" />
          </span>
          <span className="hero-weapon" />
          <HeroGlyph icon={profile.icon} />
        </div>
        <div className="hero-caption">
          <span>{profile.callsign}</span>
          <strong>{agent.agentId.replace('AG-', '')}</strong>
        </div>
      </div>

      <div className="agent-card-head">
        <div>
          <span className="agent-id">{agent.agentId}</span>
          <h3>{agent.agentName}</h3>
          <p>{agent.roleTitle}</p>
        </div>
        <span className={`agent-status status-${statusTone}`}>{agent.status}</span>
      </div>

      <p className="agent-visual-role">{agent.visualRole} / {agent.activityIndicator}</p>

      <p className="agent-task-line">{agent.currentTask}</p>
      <div className="agent-signal-row" aria-label={`${agent.agentId} risk and review summary`}>
        <span>risk {agent.riskLevel}</span>
        <span>{agent.reviewCount} review</span>
        <span>{agent.needsUserDecision ? 'decision queued' : 'autonomy held'}</span>
      </div>
      <p className="agent-reason-line">{reason}</p>
      <div className="source-ref-list" aria-label={`${agent.agentId} source refs`}>
        {sourcePreview.map((sourceRef) => (
          <span key={sourceRef}>{sourceRef}</span>
        ))}
      </div>
    </article>
  );
}

function HeroGlyph({ icon }: { icon: 'arcane' | 'shield' | 'seal' | 'gear' | 'book' | 'key' }) {
  if (icon === 'arcane') {
    return (
      <svg className="hero-glyph glyph-arcane" viewBox="0 0 120 120" role="img" aria-label="blueprint magic circle">
        <circle cx="60" cy="60" r="38" />
        <path d="M60 18v84M18 60h84M32 32l56 56M88 32 32 88" />
        <path d="M60 28 72 56 102 60 72 66 60 92 48 66 18 60 48 56Z" />
      </svg>
    );
  }

  if (icon === 'shield') {
    return (
      <svg className="hero-glyph glyph-shield" viewBox="0 0 120 120" role="img" aria-label="shield and lock">
        <path d="M60 14 98 28v30c0 27-15 44-38 54-23-10-38-27-38-54V28Z" />
        <rect x="42" y="55" width="36" height="30" rx="6" />
        <path d="M48 55V45c0-8 5-14 12-14s12 6 12 14v10" />
        <path d="M60 66v9" />
      </svg>
    );
  }

  if (icon === 'seal') {
    return (
      <svg className="hero-glyph glyph-seal" viewBox="0 0 120 120" role="img" aria-label="review seal and scales">
        <circle cx="60" cy="60" r="36" />
        <path d="M60 28v52M36 45h48M43 45l-13 22h26ZM77 45 64 67h26Z" />
        <path d="M46 90h28M54 80h12" />
      </svg>
    );
  }

  if (icon === 'gear') {
    return (
      <svg className="hero-glyph glyph-gear" viewBox="0 0 120 120" role="img" aria-label="gear and energy core">
        <path d="M60 23v14M60 83v14M23 60h14M83 60h14M34 34l10 10M76 76l10 10M86 34 76 44M44 76 34 86" />
        <circle cx="60" cy="60" r="26" />
        <circle cx="60" cy="60" r="10" />
        <path d="M83 75h18l8 9" />
      </svg>
    );
  }

  if (icon === 'book') {
    return (
      <svg className="hero-glyph glyph-book" viewBox="0 0 120 120" role="img" aria-label="open book and decision bubbles">
        <path d="M22 30h31c9 0 13 5 13 12v48c-3-5-8-8-15-8H22Z" />
        <path d="M98 30H67c-9 0-13 5-13 12v48c3-5 8-8 15-8h29Z" />
        <path d="M34 48h17M34 62h17M70 48h17M70 62h17" />
        <circle cx="88" cy="23" r="8" />
      </svg>
    );
  }

  return (
    <svg className="hero-glyph glyph-key" viewBox="0 0 120 120" role="img" aria-label="key and git branches">
      <circle cx="42" cy="48" r="18" />
      <path d="M56 60 96 100M76 80l10-10M84 88l10-10" />
      <path d="M30 78v-8c0-10 8-18 18-18h5M78 34h14v14M78 86h14V72" />
      <path d="M62 42h14c9 0 16 7 16 16v14" />
    </svg>
  );
}
