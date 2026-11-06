import type { Category } from '@/lib/types';

/**
 * Drawn scenes, one per category, shown where a business hasn't added photos yet.
 * Flat landscape illustrations in an East African palette: they read as artwork, never as a photo
 * of the business, so nobody mistakes them for the real place.
 */
type Pal = { sky: [string, string]; sun: string; far: string; near: string; ground: string; ink: string; accent: string };

const PAL: Record<Category, Pal> = {
  stay:          { sky: ['#F7D9A8', '#F3B77A'], sun: '#FBEFD9', far: '#C98A55', near: '#9C6A3E', ground: '#7D5531', ink: '#3B2A1E', accent: '#EFE3CC' },
  safari:        { sky: ['#F6C77E', '#E9935A'], sun: '#FFF1D0', far: '#C9874E', near: '#A3743C', ground: '#7E5A2E', ink: '#2E2318', accent: '#D9B26A' },
  transport:     { sky: ['#CFE3EA', '#A9CDD9'], sun: '#F6FBFC', far: '#8DB2A0', near: '#6E9682', ground: '#55786A', ink: '#26332E', accent: '#E9E2D2' },
  guide:         { sky: ['#D9E6EF', '#B9CFDF'], sun: '#FFFFFF', far: '#8FA7B8', near: '#6E8A73', ground: '#56714F', ink: '#253038', accent: '#F4F7F9' },
  experience:    { sky: ['#FBE3C4', '#F2C29C'], sun: '#FFF6E8', far: '#D7A27A', near: '#B78559', ground: '#8E6844', ink: '#3A2A20', accent: '#C8553D' },
  event:         { sky: ['#2B2F4A', '#4A3F63'], sun: '#F4E7C5', far: '#3B3A57', near: '#2A2A40', ground: '#1D1D2E', ink: '#0F0F1A', accent: '#F2C46D' },
  home:          { sky: ['#E3EBF0', '#C9D8E1'], sun: '#FFFFFF', far: '#A8B9C4', near: '#8A9DAA', ground: '#6F818D', ink: '#2B343B', accent: '#F3D9A4' },
  furniture:     { sky: ['#F1E6D8', '#E8D7C2'], sun: '#FFFFFF', far: '#D9C4A8', near: '#C7AE8E', ground: '#B39472', ink: '#3E2F22', accent: '#B4692B' },
  home_services: { sky: ['#E4ECE6', '#CBDBD0'], sun: '#FFFFFF', far: '#A9C1B1', near: '#7FA08C', ground: '#5E806B', ink: '#22302A', accent: '#E8B04B' },
  utilities:     { sky: ['#DCE7F3', '#B9CDE6'], sun: '#FFFFFF', far: '#9DB3CC', near: '#7E97B2', ground: '#647C96', ink: '#1F2A36', accent: '#F2C14E' },
  grooming:      { sky: ['#F4E1E3', '#E9C9CD'], sun: '#FFFFFF', far: '#D9AEB4', near: '#C4939A', ground: '#A9777F', ink: '#3A2528', accent: '#F1E4D3' },
};

const Acacia = ({ x, y, s = 1, c }: { x: number; y: number; s?: number; c: string }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} fill={c}>
    <path d="M-2 0 L-1 -34 L-14 -48 L-12 -50 L0 -40 L10 -52 L12 -50 L2 -36 L3 0 Z" />
    <ellipse cx="-8" cy="-52" rx="30" ry="7" />
    <ellipse cx="14" cy="-54" rx="24" ry="6" />
    <ellipse cx="2" cy="-58" rx="22" ry="5" />
  </g>
);

function Motif({ c, p }: { c: Category; p: Pal }) {
  switch (c) {
    case 'stay':
      return (
        <g>
          <Acacia x={322} y={236} s={1.15} c={p.ink} />
          <g transform="translate(150 238)">
            <path d="M-78 0 L-10 -78 L58 0 Z" fill={p.accent} />
            <path d="M-10 -78 L58 0 L74 0 L4 -80 Z" fill="#D8C7A6" />
            <path d="M-26 0 L-10 -40 L6 0 Z" fill={p.ink} opacity=".85" />
            <path d="M-10 -78 L-10 -92" stroke={p.ink} strokeWidth="2" />
            <path d="M-96 0 H92" stroke={p.ink} strokeWidth="3" />
          </g>
        </g>
      );
    case 'safari':
      return (
        <g>
          <Acacia x={96} y={232} s={1.4} c={p.ink} />
          <Acacia x={300} y={226} s={0.8} c={p.ink} />
          {/* giraffe */}
          <g transform="translate(232 232)" fill={p.ink}>
            <path d="M-14 0 L-12 -26 L-16 -30 L-14 -40 L14 -40 L18 -30 L14 -26 L16 0 L12 0 L10 -24 L-6 -24 L-8 0 Z" />
            <path d="M10 -40 L30 -86 L36 -84 L18 -38 Z" />
            <path d="M28 -88 L44 -84 L42 -80 L30 -82 Z" />
            <path d="M30 -88 L29 -94 M33 -88 L33 -94" stroke={p.ink} strokeWidth="2" />
          </g>
        </g>
      );
    case 'transport':
      return (
        <g>
          <path d="M150 300 C 190 250 205 215 198 186 L 206 186 C 220 215 250 250 330 300 Z" fill="#5B5F5E" />
          <path d="M200 296 C 214 260 210 220 202 190" stroke="#F4EBD3" strokeWidth="3" strokeDasharray="10 10" fill="none" />
          <g transform="translate(250 254)">
            <rect x="-40" y="-28" width="84" height="30" rx="7" fill={p.accent} />
            <rect x="-34" y="-24" width="16" height="11" rx="2" fill="#7FA6B3" />
            <rect x="-14" y="-24" width="16" height="11" rx="2" fill="#7FA6B3" />
            <rect x="6" y="-24" width="16" height="11" rx="2" fill="#7FA6B3" />
            <rect x="26" y="-24" width="13" height="11" rx="2" fill="#7FA6B3" />
            <rect x="-40" y="-6" width="84" height="5" fill="#C8553D" />
            <circle cx="-22" cy="3" r="7" fill={p.ink} /><circle cx="26" cy="3" r="7" fill={p.ink} />
          </g>
          <Acacia x={70} y={222} s={0.9} c={p.ink} />
        </g>
      );
    case 'guide':
      return (
        <g>
          <path d="M60 210 L190 90 L250 140 L290 112 L370 210 Z" fill="#7D93A6" />
          <path d="M160 118 L190 90 L222 116 L206 112 L196 122 L182 112 Z" fill={p.accent} />
          <g transform="translate(118 246)" fill={p.ink}>
            <circle cx="0" cy="-58" r="7" />
            <path d="M-12 -66 H12 L8 -70 H-8 Z" />
            <path d="M-8 -48 H8 L10 -20 H4 L2 0 H-3 L-4 -20 H-10 Z" />
            <path d="M8 -46 L22 -30 L24 6" stroke={p.ink} strokeWidth="2.5" fill="none" />
          </g>
        </g>
      );
    case 'experience':
      return (
        <g>
          <g transform="translate(250 112)">
            <path d="M0 -58 C 36 -58 44 -20 26 8 L 10 30 H -10 L -26 8 C -44 -20 -36 -58 0 -58 Z" fill={p.accent} />
            <path d="M0 -58 C 14 -58 18 -20 10 8 L 4 30 H -4 L -10 8 C -18 -20 -14 -58 0 -58 Z" fill="#F2C46D" />
            <path d="M-10 30 L-8 44 M10 30 L8 44" stroke={p.ink} strokeWidth="1.5" />
            <rect x="-9" y="44" width="18" height="11" rx="2" fill={p.ink} />
          </g>
          <g transform="translate(118 150) scale(.5)">
            <path d="M0 -58 C 36 -58 44 -20 26 8 L 10 30 H -10 L -26 8 C -44 -20 -36 -58 0 -58 Z" fill="#2F6E5B" />
            <rect x="-9" y="44" width="18" height="11" rx="2" fill={p.ink} />
          </g>
          <Acacia x={86} y={236} s={1} c={p.ink} />
        </g>
      );
    case 'event':
      return (
        <g>
          {Array.from({ length: 30 }).map((_, i) => <circle key={i} cx={(i * 53) % 400} cy={(i * 37) % 120} r={i % 3 ? 1 : 1.6} fill="#F4E7C5" opacity=".7" />)}
          <path d="M-10 70 Q 100 120 200 82 T 410 90" stroke={p.ink} strokeWidth="1.5" fill="none" />
          {[20, 60, 100, 140, 180, 220, 260, 300, 340, 380].map((x, i) => <circle key={x} cx={x} cy={i < 5 ? 82 + Math.sin(x / 40) * 14 + 10 : 88} r="5" fill={p.accent} />)}
          <path d="M120 250 L 150 200 H 250 L 280 250 Z" fill="#3E3557" />
          <rect x="150" y="190" width="100" height="10" fill={p.accent} />
          <g fill={p.ink}>{[60, 90, 300, 330, 350].map((x) => <circle key={x} cx={x} cy="246" r="9" />)}</g>
        </g>
      );
    case 'home':
      return (
        <g>
          {[[40, 120, 70], [120, 80, 90], [222, 108, 64], [298, 70, 80]].map(([x, top, w], i) => (
            <g key={i}>
              <rect x={x} y={top} width={w} height={260 - top} fill={i % 2 ? '#56656F' : '#6A7A85'} />
              {Array.from({ length: Math.floor((240 - top) / 22) }).map((_, r) =>
                Array.from({ length: Math.floor((w - 10) / 18) }).map((__, k) => (
                  <rect key={`${r}-${k}`} x={x + 8 + k * 18} y={top + 12 + r * 22} width="9" height="11" fill={(r * 3 + k + i) % 4 === 0 ? p.accent : '#BFD0DA'} opacity={(r * 3 + k + i) % 4 === 0 ? 1 : 0.55} />
                )),
              )}
            </g>
          ))}
          <rect x="0" y="256" width="400" height="44" fill={p.ground} />
        </g>
      );
    case 'furniture':
      return (
        <g>
          <rect x="0" y="0" width="400" height="300" fill="#EADBC6" />
          <rect x="0" y="232" width="400" height="68" fill="#C9A47E" />
          <rect x="250" y="40" width="80" height="96" rx="3" fill="#F7F0E5" stroke="#B89A78" strokeWidth="5" />
          <path d="M260 120 L282 84 L300 104 L312 92 L322 120 Z" fill="#8FAE8E" />
          <g transform="translate(160 236)">
            <rect x="-110" y="-62" width="200" height="40" rx="12" fill={p.accent} />
            <rect x="-118" y="-36" width="216" height="30" rx="10" fill="#C77A3C" />
            <rect x="-128" y="-50" width="24" height="46" rx="10" fill="#A65E2A" />
            <rect x="80" y="-50" width="24" height="46" rx="10" fill="#A65E2A" />
            <rect x="-104" y="-6" width="6" height="10" fill={p.ink} /><rect x="76" y="-6" width="6" height="10" fill={p.ink} />
          </g>
          <g transform="translate(330 236)">
            <path d="M-2 0 V-90" stroke={p.ink} strokeWidth="3" />
            <path d="M-20 -88 H16 L8 -112 H-12 Z" fill="#F2C46D" />
            <ellipse cx="-2" cy="0" rx="14" ry="3" fill={p.ink} />
          </g>
        </g>
      );
    case 'home_services':
      return (
        <g>
          <g transform="translate(200 250)">
            <path d="M-80 0 V-70 L0 -130 L80 -70 V0 Z" fill="#F4EFE4" />
            <path d="M-96 -62 L0 -140 L96 -62" stroke={p.ink} strokeWidth="10" fill="none" strokeLinejoin="round" />
            <rect x="-18" y="-50" width="36" height="50" fill={p.ink} />
            <rect x="-62" y="-60" width="28" height="24" fill="#9CC3D0" />
            <rect x="34" y="-60" width="28" height="24" fill="#9CC3D0" />
          </g>
          <g transform="translate(318 214) rotate(-35)">
            <rect x="-6" y="-10" width="12" height="62" rx="5" fill={p.accent} />
            <path d="M-18 -34 A 18 18 0 1 0 18 -34 L 8 -30 V -14 H -8 V -30 Z" fill="#5B6770" />
          </g>
        </g>
      );
    case 'utilities':
      return (
        <g>
          {[80, 250].map((x, i) => (
            <g key={x} transform={`translate(${x} 260)`} stroke={p.ink} strokeWidth="4" fill="none">
              <path d="M0 0 V-170" /><path d="M-30 -150 H30 M-22 -130 H22" />
            </g>
          ))}
          <path d="M50 110 Q 165 150 280 110 Q 340 92 410 104" stroke={p.ink} strokeWidth="1.5" fill="none" />
          <path d="M58 130 Q 165 168 272 130 Q 340 112 410 124" stroke={p.ink} strokeWidth="1.5" fill="none" />
          <g transform="translate(340 200)" stroke={p.accent} strokeWidth="6" fill="none" strokeLinecap="round">
            <path d="M-34 -18 A 48 48 0 0 1 34 -18" /><path d="M-20 -4 A 28 28 0 0 1 20 -4" />
            <circle cx="0" cy="10" r="4" fill={p.accent} stroke="none" />
          </g>
        </g>
      );
    case 'grooming':
      return (
        <g>
          <rect x="0" y="0" width="400" height="300" fill="#EFD9DB" />
          <rect x="0" y="236" width="400" height="64" fill="#B98189" />
          <ellipse cx="270" cy="120" rx="58" ry="74" fill="#F7F3EE" stroke="#8C5A61" strokeWidth="6" />
          <g transform="translate(110 236)">
            <rect x="-6" y="-150" width="12" height="150" fill="#8C5A61" />
            <rect x="-14" y="-156" width="28" height="90" rx="12" fill="#F7F3EE" stroke="#8C5A61" strokeWidth="3" />
            {[0, 1, 2, 3].map((i) => <path key={i} d={`M-12 ${-140 + i * 20} L12 ${-152 + i * 20} L12 ${-144 + i * 20} L-12 ${-132 + i * 20} Z`} fill="#C8553D" />)}
          </g>
          <g transform="translate(352 228)" stroke={p.ink} strokeWidth="4" fill="none" strokeLinecap="round">
            <circle cx="-18" cy="-6" r="9" /><circle cx="18" cy="-6" r="9" />
            <path d="M-12 -14 L 22 -60 M12 -14 L -22 -60" />
          </g>
        </g>
      );
  }
}

export function Scene({ category, className = '' }: { category: Category; className?: string }) {
  const p = PAL[category] ?? PAL.safari;
  const id = `sky-${category}`;
  const indoor = category === 'furniture' || category === 'grooming';
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className={className} role="presentation" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={p.sky[0]} /><stop offset="1" stopColor={p.sky[1]} /></linearGradient>
      </defs>
      <rect width="400" height="300" fill={`url(#${id})`} />
      {!indoor ? (
        <>
          <circle cx={category === 'event' ? 320 : 300} cy="78" r={category === 'event' ? 22 : 34} fill={p.sun} opacity=".9" />
          <path d="M0 196 C 70 170 130 182 200 172 S 330 160 400 178 V300 H0 Z" fill={p.far} />
          <path d="M0 226 C 90 206 170 222 250 212 S 360 206 400 214 V300 H0 Z" fill={p.near} />
          <rect x="0" y="246" width="400" height="54" fill={p.ground} />
        </>
      ) : null}
      <Motif c={category} p={p} />
    </svg>
  );
}
