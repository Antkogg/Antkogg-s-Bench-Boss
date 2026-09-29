export const BRAND = {
  name: "Antkogg's LG Assistant",
  shortName: 'LG ASSISTANT',
  descriptor: 'Team Operations & Scouting',
  colors: {
    primary: 0x1f6feb,
    success: 0x2da44e,
    warning: 0xd29922,
    danger: 0xcf222e,
    neutral: 0x57606a,
    inProgress: 0x8250df,
  },
} as const;

export const DISCORD_LIMITS = {
  customId: 100,
  embedDescription: 4096,
  fieldValue: 1024,
  actionRows: 5,
} as const;

export const DEFAULT_TEAM_ROLE_ID = '1543415709831397386';
export const DEFAULT_AVAILABILITY_CHANNEL_ID = '1543417189208428564';
