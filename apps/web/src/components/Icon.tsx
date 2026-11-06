const paths: Record<string, string> = {
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z',
  pin: 'M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12zM12 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6zM9 12l2 2 4-4',
  car: 'M5 17h14v-4l-2-5H7l-2 5zM8 17a1.5 1.5 0 1 0 0 .01M16 17a1.5 1.5 0 1 0 0 .01',
  chat: 'M4 20l1.5-4A8 8 0 1 1 9 19z',
  back: 'M15 6l-6 6 6 6',
  x: 'M6 6l12 12M18 6L6 18',
  cal: 'M4 5h16v15H4zM4 10h16M9 3v4M15 3v4',
  cash: 'M3 6h18v12H3zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21c1.5-4 4.5-6 8-6s6.5 2 8 6',
  check: 'M5 12l5 5 9-10',
  share: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6',
  bed: 'M3 18V8M3 14h18v4M21 18v-5a3 3 0 0 0-3-3h-7v4M7 11.5a1.5 1.5 0 1 0 0 .01',
  binoculars: 'M7 7l-3 9a3 3 0 1 0 6 0V9M17 7l3 9a3 3 0 1 1-6 0V9M10 10h4M8 4h3v3H8zM13 4h3v3h-3z',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  mtn: 'M3 20l6-10 4 6 3-4 5 8zM17 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  music: 'M9 18V5l11-2v13M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM17 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  people: 'M8 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM2 20c1-3.5 3.5-5 6-5s5 1.5 6 5M17 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM14 15.5c1-.8 2-1 3-1 2.2 0 4 1.3 5 4.5',
  sos: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  plane: 'M3 15l18-6-6 12-3-5z',
  id: 'M5 3h14v18H5zM12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM9 17h6',
  plus: 'M12 5v14M5 12h14',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  star: 'M12 2.5l2.9 6.2 6.6.6-5 4.5 1.5 6.6L12 17l-6 3.4 1.5-6.6-5-4.5 6.6-.6z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13',
  logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  menu: 'M4 7h16M4 12h16M4 17h16',
  filter: 'M4 6h16M7 12h10M10 18h4',
  briefcase: 'M3 8h18v12H3zM8 8V5h8v3',
  phone: 'M7 3h10v18H7zM11 18h2',
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  home: 'M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6',
  sofa: 'M4 11V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3M2 12a2 2 0 0 1 4 0v2h12v-2a2 2 0 0 1 4 0v5H2zM5 17v2M19 17v2',
  wrench: 'M14.5 6.5a4 4 0 0 0 5 5L20 12l-8.5 8.5a2.1 2.1 0 0 1-3-3L17 9l.5-.5a4 4 0 0 0-3-2z',
  wifi: 'M2 9a15 15 0 0 1 20 0M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 19.5h.01',
  scissors: 'M6 6a2.5 2.5 0 1 0 0 .01M6 18a2.5 2.5 0 1 0 0 .01M8 7.5L20 18M8 16.5L20 6',
  key: 'M8 14a4 4 0 1 1 3.5-6H21v3h-2v2h-3v-2h-4.5A4 4 0 0 1 8 14z',
  thumb: 'M7 11v9H4v-9zM7 11l4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.2 6A2 2 0 0 1 17.8 20H7',
  camera: 'M4 8h3l2-3h6l2 3h3v11H4zM12 10a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z',
};

export function Icon({ name, size = 20, className = '', strokeWidth = 2, filled = false, title }: { name: keyof typeof paths | string; size?: number; className?: string; strokeWidth?: number; filled?: boolean; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={paths[name] ?? paths.compass} />
    </svg>
  );
}

export const CATEGORY_ICON: Record<string, string> = {
  stay: 'bed', safari: 'binoculars', transport: 'car', guide: 'people', experience: 'mtn', event: 'music',
  home: 'home', furniture: 'sofa', home_services: 'wrench', utilities: 'wifi', grooming: 'scissors',
};
