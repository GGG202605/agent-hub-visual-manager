import { useId } from 'react';
import type { AgentPersona } from '../../lib/agentPersonas';
import type { AgentRoleCardView } from '../../types';

interface AgentCharacterProps {
  agent: AgentRoleCardView;
  persona: AgentPersona;
  /** seated 围坐 / active 在圆心讲解 / walking 走位途中 */
  mode: 'seated' | 'active' | 'walking';
  isCoordinator: boolean;
  onClick: () => void;
}

const SKIN = '#f4dcbb';
const SKIN_SHADE = '#e3c39a';
const HAIR = '#241f1d';

/**
 * v0.4 国风动漫小人（精修版）：
 * 渐变光影塑体积、rim light 勾边、说话嘴型/点头/抬袖/作揖等多动作、
 * 呼吸摆袖眨眼待机；全部程序化 SVG，零图片资源。
 */
export function AgentCharacter({ agent, persona, mode, isCoordinator, onClick }: AgentCharacterProps) {
  const uid = useId().replace(/[:]/g, '');
  const robeGrad = `robe-${uid}`;
  const robeSide = `robeSide-${uid}`;
  const faceGrad = `face-${uid}`;
  const rimGrad = `rim-${uid}`;
  const glowGrad = `glow-${uid}`;

  return (
    <button
      type="button"
      className={`plaza-character is-${mode} status-${agent.status}${isCoordinator ? ' is-coordinator' : ''}`}
      onClick={onClick}
      aria-label={`${persona.figure} · ${agent.nameZh}（${agent.statusLabel}）`}
      title={`${persona.school}·${persona.figure} — ${agent.nameZh}`}
    >
      <svg viewBox="0 0 140 190" className="plaza-character-svg" aria-hidden="true">
        <defs>
          {/* 袍服主体：左上受光，右下入影 */}
          <linearGradient id={robeGrad} x1="0.2" y1="0" x2="0.85" y2="1">
            <stop offset="0" stopColor={lighten(persona.robeColor, 26)} />
            <stop offset="0.45" stopColor={persona.robeColor} />
            <stop offset="1" stopColor={darken(persona.robeColor, 24)} />
          </linearGradient>
          <linearGradient id={robeSide} x1="0" y1="0" x2="1" y2="0.9">
            <stop offset="0" stopColor={lighten(persona.sleeveColor, 18)} />
            <stop offset="1" stopColor={darken(persona.sleeveColor, 22)} />
          </linearGradient>
          <radialGradient id={faceGrad} cx="0.42" cy="0.36" r="0.75">
            <stop offset="0" stopColor="#fbe9cd" />
            <stop offset="0.72" stopColor={SKIN} />
            <stop offset="1" stopColor={SKIN_SHADE} />
          </radialGradient>
          {/* 侧后 rim light，营造立体轮廓 */}
          <linearGradient id={rimGrad} x1="1" y1="0.2" x2="0" y2="0.8">
            <stop offset="0" stopColor="rgba(255,240,210,0.85)" />
            <stop offset="0.22" stopColor="rgba(255,240,210,0)" />
          </linearGradient>
          <radialGradient id={glowGrad} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="rgba(255,214,140,0.55)" />
            <stop offset="1" stopColor="rgba(255,214,140,0)" />
          </radialGradient>
        </defs>

        {/* 讲解光环（active 时经 CSS 点亮） */}
        <ellipse className="pc-halo" cx="70" cy="176" rx="52" ry="12" fill={`url(#${glowGrad})`} />
        {/* 足下接触阴影 */}
        <ellipse cx="70" cy="177" rx="34" ry="8" fill="rgba(52,36,20,0.32)" />
        <ellipse cx="70" cy="177" rx="22" ry="5" fill="rgba(52,36,20,0.22)" />

        <g className="pc-body">
          {/* 后摆（增加层次） */}
          <path d="M70 74 C 44 84 36 128 31 168 L 109 168 C 104 128 96 84 70 74 Z" fill={darken(persona.robeColor, 30)} />
          {/* 袍服主体 */}
          <path d="M70 62 C 46 70 38 112 34 166 L 106 166 C 102 112 94 70 70 62 Z" fill={`url(#${robeGrad})`} />
          {/* rim light 勾边 */}
          <path d="M70 62 C 94 70 102 112 106 166 L 96 166 C 94 116 88 78 70 64 Z" fill={`url(#${rimGrad})`} />
          {/* 下摆纹样与压边 */}
          <path d="M34 166 L 106 166 L 104 156 L 36 156 Z" fill={darken(persona.sashColor, 8)} />
          <path d="M38 156 Q 70 150 102 156" stroke={lighten(persona.sashColor, 30)} strokeWidth="1.6" fill="none" opacity="0.7" />
          <circle cx="52" cy="161" r="1.6" fill={lighten(persona.sashColor, 35)} opacity="0.8" />
          <circle cx="70" cy="159" r="1.6" fill={lighten(persona.sashColor, 35)} opacity="0.8" />
          <circle cx="88" cy="161" r="1.6" fill={lighten(persona.sashColor, 35)} opacity="0.8" />

          {/* 双足（走路时交替） */}
          <g className="pc-feet">
            <ellipse className="pc-foot-l" cx="58" cy="169" rx="8" ry="4" fill={darken(persona.sashColor, 18)} />
            <ellipse className="pc-foot-r" cx="82" cy="169" rx="8" ry="4" fill={darken(persona.sashColor, 18)} />
          </g>

          {/* 衣襟交领（双层） */}
          <path d="M70 64 L 54 92 L 70 118 L 86 92 Z" fill="#f7f1e3" />
          <path d="M70 68 L 58 92 L 70 112 L 82 92 Z" fill={lighten(persona.robeColor, 30)} />
          <path d="M70 64 L 54 92 L 60 96 L 70 74 Z" fill="rgba(60,40,20,0.12)" />
          {/* 腰带 + 玉佩 */}
          <rect x="47" y="104" width="46" height="10" rx="4" fill={darken(persona.sashColor, 6)} />
          <rect x="47" y="104" width="46" height="4" rx="2" fill={lighten(persona.sashColor, 22)} opacity="0.75" />
          <circle cx="70" cy="109" r="4.2" fill="#e9daa6" stroke="#b99f5c" strokeWidth="1" />
          <path d="M70 113 L 70 124 M 66 116 L 70 121 L 74 116" stroke="#8fae94" strokeWidth="1.6" fill="none" strokeLinecap="round" />

          {/* 左臂（垂袖，广袖飘动） */}
          <g className="pc-sleeve-left">
            <path d="M50 78 C 32 86 24 110 26 132 C 36 138 46 134 50 126 C 47 110 49 92 55 80 Z" fill={`url(#${robeSide})`} />
            <path d="M26 132 C 30 136 40 137 50 126 L 48 120 C 42 128 34 131 28 128 Z" fill={darken(persona.sleeveColor, 26)} />
            <ellipse cx="47" cy="128" rx="5" ry="3.6" fill={SKIN} />
          </g>

          {/* 右臂（持法器，讲解时抬起） */}
          <g className="pc-sleeve-right">
            <path d="M90 78 C 108 86 116 110 114 132 C 104 138 94 134 90 126 C 93 110 91 92 85 80 Z" fill={`url(#${robeSide})`} />
            <path d="M114 132 C 110 136 100 137 90 126 L 92 120 C 98 128 106 131 112 128 Z" fill={darken(persona.sleeveColor, 26)} />
            <ellipse cx="93" cy="128" rx="5" ry="3.6" fill={SKIN} />
            <PropShape prop={persona.prop} sash={persona.sashColor} />
          </g>

          {/* 头部（点头/说话动画作用于此） */}
          <g className="pc-head">
            <path d="M63 52 L 77 52 L 76 62 L 64 62 Z" fill={SKIN_SHADE} />
            {/* 脸 */}
            <circle cx="70" cy="36" r="17.5" fill={`url(#${faceGrad})`} />
            {/* 耳 */}
            <circle cx="52.6" cy="37" r="3.4" fill={SKIN} />
            <circle cx="87.4" cy="37" r="3.4" fill={SKIN} />
            {/* 鬓发与发际 */}
            <path d="M52.5 34 C 52.5 19 87.5 19 87.5 34 C 87.5 26 81 21.5 70 21.5 C 59 21.5 52.5 26 52.5 34 Z" fill={HAIR} />
            <path d="M53 33 C 56 29 62 27 70 27 C 78 27 84 29 87 33 C 84 27.5 78 24.5 70 24.5 C 62 24.5 56 27.5 53 33 Z" fill="#3d3531" />
            {/* 眉（随说话微挑） */}
            <g className="pc-brows">
              <path d="M58.5 31 Q 62.5 28.8 66.5 30.8" stroke="#33291f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
              <path d="M73.5 30.8 Q 77.5 28.8 81.5 31" stroke="#33291f" strokeWidth="1.6" fill="none" strokeLinecap="round" />
            </g>
            {/* 眼（高光 + 眨眼） */}
            <g className="pc-eyes">
              <ellipse cx="63" cy="36" rx="2.6" ry="3" fill="#241d18" />
              <ellipse cx="77" cy="36" rx="2.6" ry="3" fill="#241d18" />
              <circle cx="63.9" cy="34.8" r="0.9" fill="#fff" opacity="0.95" />
              <circle cx="77.9" cy="34.8" r="0.9" fill="#fff" opacity="0.95" />
            </g>
            {/* 腮红 */}
            <ellipse cx="57.5" cy="41.5" rx="3.2" ry="1.9" fill="#e8a17e" opacity="0.4" />
            <ellipse cx="82.5" cy="41.5" rx="3.2" ry="1.9" fill="#e8a17e" opacity="0.4" />
            {/* 鼻 */}
            <path d="M70 38 L 69 42.5 L 71.4 42.5" stroke={SKIN_SHADE} strokeWidth="1.3" fill="none" strokeLinecap="round" />
            {/* 口（闭合弧线；说话时 CSS 切换张合） */}
            <g className="pc-mouth">
              <path className="pc-mouth-closed" d="M65 46 Q 70 49 75 46" stroke="#9a5e46" strokeWidth="1.7" fill="none" strokeLinecap="round" />
              <ellipse className="pc-mouth-open" cx="70" cy="47" rx="3.4" ry="2.6" fill="#8a4a38" opacity="0" />
            </g>
            <BeardShape beard={persona.beard} />
            <HatShape hat={persona.hat} sash={persona.sashColor} robe={persona.robeColor} />
          </g>
        </g>
      </svg>

      <span className="plaza-nameplate">
        <strong>{persona.figure}</strong>
        <small>{agent.nameZh}</small>
      </span>
      <span className={`plaza-status-dot status-${agent.status}`} aria-hidden="true" />
    </button>
  );
}

function BeardShape({ beard }: { beard: AgentPersona['beard'] }) {
  if (beard === 'none') return null;
  if (beard === 'short') {
    return (
      <g className="pc-beard">
        <path d="M61 48 Q 70 55 79 48 Q 70 61 61 48 Z" fill="#463c34" />
        <path d="M63 49 Q 70 54 77 49" stroke="#5c5148" strokeWidth="0.9" fill="none" opacity="0.7" />
      </g>
    );
  }
  return (
    <g className="pc-beard">
      <path d="M60 47 Q 70 54 80 47 L 77 72 Q 70 79 63 72 Z" fill="#58504a" />
      <path d="M64 52 L 63.4 70 M 70 55 L 70 75 M 76 52 L 76.6 70" stroke="#6d645c" strokeWidth="0.9" opacity="0.8" />
    </g>
  );
}

function HatShape({ hat, sash, robe }: { hat: AgentPersona['hat']; sash: string; robe: string }) {
  switch (hat) {
    case 'guan':
      return (
        <g>
          <rect x="59" y="12" width="22" height="10" rx="3" fill={darken(sash, 6)} />
          <rect x="59" y="12" width="22" height="4" rx="2" fill={lighten(sash, 22)} opacity="0.8" />
          <rect x="55" y="20" width="30" height="3.6" rx="1.8" fill={HAIR} />
          <rect x="82" y="9" width="2.8" height="15" rx="1.4" fill="#d4af6a" />
          <circle cx="83.4" cy="9" r="2" fill="#e9cf8e" />
        </g>
      );
    case 'topknot':
      return (
        <g>
          <circle cx="70" cy="14.5" r="6.5" fill={HAIR} />
          <circle cx="68" cy="12.5" r="2" fill="#3d3531" />
          <rect x="60" y="13" width="20" height="2.8" rx="1.4" fill="#d4af6a" />
          <circle cx="80.5" cy="14.4" r="1.8" fill="#e9cf8e" />
        </g>
      );
    case 'scholarCap':
      return (
        <g>
          <path d="M54 22 L 86 22 L 82.5 10 L 57.5 10 Z" fill={darken(sash, 4)} />
          <path d="M57.5 10 L 82.5 10 L 81.5 13.5 L 58.5 13.5 Z" fill={lighten(sash, 20)} opacity="0.75" />
          <rect x="53" y="21" width="34" height="3.6" rx="1.8" fill={HAIR} />
        </g>
      );
    case 'warriorHelm':
      return (
        <g>
          <path d="M52 28 C 52 13 88 13 88 28 L 83 23 L 57 23 Z" fill={darken(sash, 8)} />
          <path d="M54 25 C 56 17 66 14 70 14 C 74 14 84 17 86 25 C 82 18 76 16 70 16 C 64 16 58 18 54 25 Z" fill={lighten(sash, 16)} opacity="0.7" />
          <circle cx="70" cy="12" r="3.4" fill="#d4af6a" />
          <path d="M70 9 C 74 2 80 2 83 5 C 78 5.6 74 8 72.4 11.6 Z" fill="#c8474e" />
          <path d="M70 9 C 72 4.6 76 3.4 79 4.4 C 75.4 5.4 72.6 7.6 71.6 10.4 Z" fill="#e06a70" opacity="0.85" />
        </g>
      );
    case 'hood':
      return (
        <g>
          <path d="M50 40 C 47 16 93 16 90 40 C 87 25 81 20 70 20 C 59 20 53 25 50 40 Z" fill={darken(robe, 10)} />
          <path d="M52 36 C 52 22 70 20 70 20 C 62 21 55 26 53 36 Z" fill={lighten(robe, 14)} opacity="0.6" />
        </g>
      );
    default:
      return null;
  }
}

function PropShape({ prop, sash }: { prop: AgentPersona['prop']; sash: string }) {
  switch (prop) {
    case 'scroll':
      return (
        <g transform="translate(104 116) rotate(16)">
          <rect x="-5" y="-15" width="11" height="30" rx="2.6" fill="#ecdfc2" stroke="#b8a374" strokeWidth="1.1" />
          <rect x="-5" y="-15" width="11" height="4" rx="2" fill="#c9b184" />
          <rect x="-5" y="11" width="11" height="4" rx="2" fill="#c9b184" />
          <line x1="0.5" y1="-9" x2="0.5" y2="9" stroke="#b8a374" strokeWidth="0.9" />
          <line x1="-2" y1="-8" x2="-2" y2="8" stroke="#cbb890" strokeWidth="0.7" />
          <line x1="3" y1="-8" x2="3" y2="8" stroke="#cbb890" strokeWidth="0.7" />
        </g>
      );
    case 'gourd':
      return (
        <g transform="translate(106 118)">
          <circle cx="0" cy="5" r="7.4" fill="#cd9250" />
          <circle cx="-2.4" cy="2.6" r="2.8" fill="#e2b076" opacity="0.85" />
          <circle cx="0" cy="-5.6" r="5" fill="#cd9250" />
          <circle cx="-1.6" cy="-7" r="1.8" fill="#e2b076" opacity="0.85" />
          <rect x="-1.2" y="-13.5" width="2.4" height="4.6" rx="1.2" fill="#6d4a23" />
          <path d="M-4 -10.5 Q 0 -12.5 4 -10.5" stroke="#8a3838" strokeWidth="1.6" fill="none" />
        </g>
      );
    case 'hammer':
      return (
        <g transform="translate(106 112) rotate(-14)">
          <rect x="-2" y="-5" width="4" height="27" rx="2" fill="#96754c" />
          <rect x="-2" y="-5" width="1.6" height="27" rx="0.8" fill="#b08e5e" opacity="0.8" />
          <rect x="-10" y="-14" width="20" height="10" rx="2.6" fill="#7a8592" />
          <rect x="-10" y="-14" width="20" height="4" rx="2" fill="#98a4b2" opacity="0.85" />
        </g>
      );
    case 'ruler':
      return (
        <g transform="translate(104 116)">
          <path d="M-4 -15 L 4 -15 L 4 9 L 15 9 L 15 16 L -4 16 Z" fill="#d4af6a" stroke="#8a6b45" strokeWidth="1.2" />
          <path d="M-4 -15 L 0 -15 L 0 12 L -4 12 Z" fill="#e9cf8e" opacity="0.7" />
          <line x1="1" y1="-11" x2="3" y2="-11" stroke="#8a6b45" strokeWidth="0.9" />
          <line x1="1" y1="-6" x2="3" y2="-6" stroke="#8a6b45" strokeWidth="0.9" />
          <line x1="1" y1="-1" x2="3" y2="-1" stroke="#8a6b45" strokeWidth="0.9" />
        </g>
      );
    case 'flag':
      return (
        <g transform="translate(108 104)">
          <rect x="-1.5" y="-20" width="3" height="42" rx="1.5" fill="#6d4a23" />
          <rect x="-1.5" y="-20" width="1.2" height="42" rx="0.6" fill="#8a6b45" />
          <path className="pc-flag" d="M1.5 -20 L 25 -14 L 1.5 -6 Z" fill={sash} />
          <path d="M1.5 -20 L 12 -17.4 L 1.5 -13.6 Z" fill="rgba(255,255,255,0.22)" />
          <circle cx="0" cy="-21.6" r="2.2" fill="#d4af6a" />
        </g>
      );
    case 'lawBook':
      return (
        <g transform="translate(104 118) rotate(7)">
          <rect x="-8.5" y="-11" width="17" height="22" rx="2" fill="#40507e" stroke="#28324e" strokeWidth="1.1" />
          <rect x="-8.5" y="-11" width="6" height="22" rx="2" fill="#4d5f94" />
          <line x1="-4" y1="-6" x2="5" y2="-6" stroke="#cdd6ec" strokeWidth="1.3" />
          <line x1="-4" y1="-1.5" x2="5" y2="-1.5" stroke="#cdd6ec" strokeWidth="1.3" />
          <line x1="-4" y1="3" x2="5" y2="3" stroke="#cdd6ec" strokeWidth="1.3" />
          <rect x="1" y="6" width="5" height="3.4" rx="1" fill="#b04a4a" />
        </g>
      );
    case 'brush':
      return (
        <g transform="translate(106 112) rotate(22)">
          <rect x="-1.6" y="-16" width="3.2" height="24" rx="1.6" fill="#96754c" />
          <rect x="-1.6" y="-16" width="1.3" height="24" rx="0.65" fill="#b08e5e" opacity="0.85" />
          <rect x="-2.2" y="6" width="4.4" height="3" rx="1.2" fill="#d4af6a" />
          <path d="M-2.6 9 L 2.6 9 L 0 18 Z" fill="#2c2624" />
          <path d="M-1.2 9 L 0.8 9 L 0 14.5 Z" fill="#4a423c" />
        </g>
      );
    case 'seal':
      return (
        <g transform="translate(104 118)">
          <rect x="-7.5" y="-4" width="15" height="12" rx="2.4" fill="#b64d4d" />
          <rect x="-7.5" y="-4" width="15" height="4.5" rx="2" fill="#cd6a64" opacity="0.85" />
          <rect x="-4" y="-11" width="8" height="7.4" rx="2" fill="#8f3c3c" />
          <circle cx="0" cy="-7.4" r="1.6" fill="#d4af6a" />
        </g>
      );
    default:
      return null;
  }
}

/* ---------- 颜色工具（轻量，无依赖） ---------- */

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function shift(hex: string, amount: number): string {
  const raw = hex.replace('#', '');
  const num = parseInt(raw, 16);
  const r = clamp(((num >> 16) & 0xff) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

function lighten(hex: string, amount: number): string {
  return shift(hex, amount);
}

function darken(hex: string, amount: number): string {
  return shift(hex, -amount);
}
