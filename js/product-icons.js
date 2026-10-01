const iconMap = {
  tablet: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="13"></circle><path d="M14.8 29.5 33.2 18.5"></path></svg>`,
  capsule: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 34 34 14a8.5 8.5 0 0 0-12-12L2 22a8.5 8.5 0 0 0 12 12Z" transform="translate(6 6) scale(.75)"></path><path d="m18 30 12-12"></path></svg>`,
  injection: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="m16 32 16-16"></path><path d="m12 28 8 8"></path><path d="m27 11 10 10"></path><path d="m33 9 6 6"></path><path d="M9 39 4 44"></path><path d="M19 17 31 29"></path></svg>`,
  syrup: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M18 8h12"></path><path d="M19 8v8l-4 5v18h18V21l-4-5V8"></path><path d="M17 27h14"></path></svg>`,
  recurring: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M36 18a14 14 0 0 0-24-4"></path><path d="M12 14v-7"></path><path d="M12 14h7"></path><path d="M12 30a14 14 0 0 0 24 4"></path><path d="M36 34v7"></path><path d="M36 34h-7"></path></svg>`,
  medical_equipment: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M15 8v13a9 9 0 0 0 18 0V8"></path><path d="M11 8h8"></path><path d="M29 8h8"></path><path d="M24 30v5a7 7 0 0 0 14 0v-3"></path><circle cx="38" cy="28" r="4"></circle></svg>`,
  other: `<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="9" y="12" width="30" height="27" rx="5"></rect><path d="M17 12V8h14v4"></path><path d="M24 20v11"></path><path d="M18.5 25.5h11"></path></svg>`
};

export const PRODUCT_ICON_OPTIONS = [
  ['tablet','Tableta'],
  ['capsule','Cápsula'],
  ['injection','Inyección'],
  ['syrup','Jarabe'],
  ['recurring','Reposición periódica'],
  ['medical_equipment','Equipo médico'],
  ['other','Otro']
];

export function productIconSVG(type='tablet'){
  return iconMap[type] || iconMap.other;
}

export function productIconLabel(type='tablet'){
  return PRODUCT_ICON_OPTIONS.find(([value])=>value===type)?.[1] || 'Otro';
}
