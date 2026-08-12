export const BRAND = {
  name: "Antkogg's Bench Boss",
  shortName: 'BENCH BOSS',
  descriptor: 'LG Scouting & Management',
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
  buttonsPerRow: 5,
} as const;
