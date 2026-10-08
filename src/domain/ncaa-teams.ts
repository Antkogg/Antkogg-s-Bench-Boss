export interface NcaaTeamInfo {
  name: string;
  shortName: string;
  color: number; // Hex number for Discord embed
  accentColor?: number;
}

export const NCAA_TEAMS: Record<string, NcaaTeamInfo> = {
  denver: {
    name: 'Denver Pioneers',
    shortName: 'Denver',
    color: 0xba0c2f, // Crimson
  },
  connecticut: {
    name: 'University of Connecticut',
    shortName: 'UConn',
    color: 0x000e2f, // UConn National Flag Blue
  },
  uconn: {
    name: 'University of Connecticut',
    shortName: 'UConn',
    color: 0x000e2f,
  },
  michigan: {
    name: 'Michigan Wolverines',
    shortName: 'Michigan',
    color: 0x00274c, // Michigan Blue
  },
  cornell: {
    name: 'Cornell Big Red',
    shortName: 'Cornell',
    color: 0xb31b1b, // Carnelian Red
  },
  'boston college': {
    name: 'Boston College Eagles',
    shortName: 'Boston College',
    color: 0x8a100b, // Maroon
  },
  bc: {
    name: 'Boston College Eagles',
    shortName: 'Boston College',
    color: 0x8a100b,
  },
  'penn state': {
    name: 'Penn State Nittany Lions',
    shortName: 'Penn State',
    color: 0x041e42, // Penn State Blue
  },
  'michigan tech': {
    name: 'Michigan Tech Huskies',
    shortName: 'Michigan Tech',
    color: 0xffcd00, // Tech Gold
  },
  princeton: {
    name: 'Princeton Tigers',
    shortName: 'Princeton',
    color: 0xff6000, // Princeton Orange
  },
  augustana: {
    name: 'Augustana University',
    shortName: 'Augustana',
    color: 0x002d62, // Navy
  },
  'michigan state': {
    name: 'Michigan State Spartans',
    shortName: 'Michigan State',
    color: 0x18453b, // Spartan Green
  },
  'north dakota': {
    name: 'North Dakota Fighting Hawks',
    shortName: 'North Dakota',
    color: 0x009a44, // Kelly Green
  },
  und: {
    name: 'North Dakota Fighting Hawks',
    shortName: 'North Dakota',
    color: 0x009a44,
  },
  wisconsin: {
    name: 'Wisconsin Badgers',
    shortName: 'Wisconsin',
    color: 0xc5050c, // Cardinal Red
  },
  'western michigan': {
    name: 'Western Michigan Broncos',
    shortName: 'Western Michigan',
    color: 0x532e1c, // Bronco Brown
  },
  dartmouth: {
    name: 'Dartmouth Big Green',
    shortName: 'Dartmouth',
    color: 0x00693e, // Dartmouth Green
  },
  'minnesota duluth': {
    name: 'Minnesota Duluth Bulldogs',
    shortName: 'Minn Duluth',
    color: 0x7a0019, // Maroon
  },
  umd: {
    name: 'Minnesota Duluth Bulldogs',
    shortName: 'Minn Duluth',
    color: 0x7a0019,
  },
  'bowling green': {
    name: 'Bowling Green State Falcons',
    shortName: 'Bowling Green',
    color: 0xfe5000, // BG Orange
  },
  quinnipiac: {
    name: 'Quinnipiac Bobcats',
    shortName: 'Quinnipiac',
    color: 0x0a2240, // Bobcat Navy
  },
  providence: {
    name: 'Providence Friars',
    shortName: 'Providence',
    color: 0x222222, // Friars Black
  },
  'minnesota state': {
    name: 'Minnesota State Mavericks',
    shortName: 'Minn State',
    color: 0x4c1c6c, // Maverick Purple
  },
  'boston university': {
    name: 'Boston University Terriers',
    shortName: 'Boston Univ',
    color: 0xcc0000, // BU Scarlet
  },
  bu: {
    name: 'Boston University Terriers',
    shortName: 'Boston Univ',
    color: 0xcc0000,
  },
  harvard: {
    name: 'Harvard Crimson',
    shortName: 'Harvard',
    color: 0xa51c30,
  },
  northeastern: {
    name: 'Northeastern Huskies',
    shortName: 'Northeastern',
    color: 0xd41b2c,
  },
  umass: {
    name: 'UMass Minutemen',
    shortName: 'UMass',
    color: 0x881c1c,
  },
  'notre dame': {
    name: 'Notre Dame Fighting Irish',
    shortName: 'Notre Dame',
    color: 0x0c2340,
  },
  'ohio state': {
    name: 'Ohio State Buckeyes',
    shortName: 'Ohio State',
    color: 0xbb0000,
  },
  minnesota: {
    name: 'Minnesota Golden Gophers',
    shortName: 'Minnesota',
    color: 0x7a0019,
  },
};

export function getNcaaTeamInfo(nameOrOpponent?: string | null): NcaaTeamInfo | null {
  if (!nameOrOpponent) return null;
  const cleaned = nameOrOpponent.toLowerCase().trim();

  // Exact or contains match
  for (const [key, info] of Object.entries(NCAA_TEAMS)) {
    if (cleaned.includes(key) || key.includes(cleaned)) {
      return info;
    }
  }

  // Fallback keyword search
  if (cleaned.includes('pioneer')) return NCAA_TEAMS.denver ?? null;
  if (cleaned.includes('uconn') || cleaned.includes('huskies') && cleaned.includes('conn'))
    return NCAA_TEAMS.connecticut ?? null;
  if (cleaned.includes('wolverine')) return NCAA_TEAMS.michigan ?? null;
  if (cleaned.includes('big red')) return NCAA_TEAMS.cornell ?? null;
  if (cleaned.includes('eagles') && cleaned.includes('boston')) return NCAA_TEAMS['boston college'] ?? null;
  if (cleaned.includes('nittany') || cleaned.includes('penn')) return NCAA_TEAMS['penn state'] ?? null;
  if (cleaned.includes('tech')) return NCAA_TEAMS['michigan tech'] ?? null;
  if (cleaned.includes('tiger')) return NCAA_TEAMS.princeton ?? null;
  if (cleaned.includes('augustana')) return NCAA_TEAMS.augustana ?? null;
  if (cleaned.includes('spartan')) return NCAA_TEAMS['michigan state'] ?? null;
  if (cleaned.includes('hawks') || cleaned.includes('dakota')) return NCAA_TEAMS['north dakota'] ?? null;
  if (cleaned.includes('badger')) return NCAA_TEAMS.wisconsin ?? null;
  if (cleaned.includes('bronco')) return NCAA_TEAMS['western michigan'] ?? null;
  if (cleaned.includes('dartmouth')) return NCAA_TEAMS.dartmouth ?? null;
  if (cleaned.includes('duluth') || cleaned.includes('bulldog')) return NCAA_TEAMS['minnesota duluth'] ?? null;
  if (cleaned.includes('bowling') || cleaned.includes('falcons')) return NCAA_TEAMS['bowling green'] ?? null;
  if (cleaned.includes('bobcats') || cleaned.includes('quinnipiac')) return NCAA_TEAMS.quinnipiac ?? null;
  if (cleaned.includes('friars') || cleaned.includes('providence')) return NCAA_TEAMS.providence ?? null;
  if (cleaned.includes('mavericks')) return NCAA_TEAMS['minnesota state'] ?? null;
  if (cleaned.includes('terriers') || cleaned.includes('boston u')) return NCAA_TEAMS['boston university'] ?? null;

  return null;
}

export function getTeamColor(nameOrOpponent?: string | null, fallbackColor = 0xcc0000): number {
  const info = getNcaaTeamInfo(nameOrOpponent);
  return info?.color ?? fallbackColor;
}

export function getTeamShortName(nameOrOpponent?: string | null): string {
  if (!nameOrOpponent) return 'TBD';
  const info = getNcaaTeamInfo(nameOrOpponent);
  return info?.shortName ?? nameOrOpponent;
}
