import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type GuildMember,
} from 'discord.js';
import type { GuildConfig } from '../generated/prisma/client.js';
import { brandedEmbed } from './design.js';
import { customId } from '../utils/custom-id.js';

export function renderWelcomeEmbed(member: GuildMember, config: GuildConfig) {
  const isScouting = config.welcomeMode === 'SCOUTING';
  const goalsChannelId = config.s55GoalsChannelId ?? '1534700577789841418';
  const rulesChannelId = config.lgRulesChannelId ?? '1543414198741237911';

  const season = config.seasonLabel ?? 'S55';
  const team = config.teamName.toLowerCase().includes('terriers')
    ? config.teamName
    : `${config.teamName} Terriers`;
  const officialBotIntro = `This is Antkogg's Official Bot for the ${season} ${team}.`;

  const scoutingChannel = config.scoutingChannelId ?? '1537242429630189669';

  const channelLines: string[] = [
    `• Goals & Season Info: <#${goalsChannelId}>`,
    `• LG Rules & Guidelines: <#${rulesChannelId}>`,
  ];

  if (isScouting) {
    channelLines.push(`• Scouting Signup & Games: <#${scoutingChannel}>`);
    if (config.scoutingAnnouncementsChannelId) {
      channelLines.push(`• Scouting Announcements: <#${config.scoutingAnnouncementsChannelId}>`);
    }
  } else {
    if (config.teamAvailabilityChannelId) {
      channelLines.push(`• Team Availability & Schedule: <#${config.teamAvailabilityChannelId}>`);
    }
    if (config.teamAnnouncementsChannelId) {
      channelLines.push(`• Team Announcements: <#${config.teamAnnouncementsChannelId}>`);
    }
  }

  const iconUrl = member.guild?.iconURL({ size: 256 }) ?? member.user?.displayAvatarURL();

  const embed = brandedEmbed()
    .setTitle(isScouting ? `🏒 Welcome to ${team} Scouting!` : `🏆 Welcome to ${team}!`)
    .setDescription(
      isScouting
        ? `Welcome to the server <@${member.id}>!\n\n` +
            `${officialBotIntro}\n\n` +
            `Make sure to stay active and watch <#${scoutingChannel}> for when we post upcoming scouting games! Select your position below to get set up.`
        : `Welcome to the server <@${member.id}>!\n\n` +
            `${officialBotIntro}\n\n` +
            `Whether you are joining our active team roster or hopping in to fill games, we're glad to have you here! Check out the key channels below and select your position category to get set up.`,
    );

  if (iconUrl) {
    embed.setThumbnail(iconUrl);
  }

  embed.addFields(
      {
        name: '📌 Important Channels & Info',
        value: `Please make sure to check out these channels:\n${channelLines.join('\n')}`,
      },
      {
        name: '🎯 Select Your Position',
        value:
          `Click the buttons below to select the position(s) you play in LG.\n` +
          `*Note: You can select multiple positions within the same category (e.g. LW and RW). To switch to a different category, unselect your current position(s) first.*`,
      },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('welcome-group', member.id, 'LW'))
      .setLabel('🏒 Left Wing (LW)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('welcome-group', member.id, 'C'))
      .setLabel('🏒 Center (C)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('welcome-group', member.id, 'RW'))
      .setLabel('🏒 Right Wing (RW)')
      .setStyle(ButtonStyle.Primary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(customId('welcome-group', member.id, 'LD'))
      .setLabel('🛡️ Left Defense (LD)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('welcome-group', member.id, 'RD'))
      .setLabel('🛡️ Right Defense (RD)')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(customId('welcome-group', member.id, 'G'))
      .setLabel('🥅 Goalie (G)')
      .setStyle(ButtonStyle.Secondary),
  );

  return { content: `Welcome <@${member.id}>!`, embeds: [embed], components: [row1, row2] };
}

export function renderForwardPositionSelect(memberId: string) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId('welcome-positions', memberId, 'FORWARD'))
    .setPlaceholder('Select forward position(s)...')
    .setMinValues(1)
    .setMaxValues(3)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Left Wing (LW)')
        .setValue('LW')
        .setDescription('Play Left Wing'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Center (C)')
        .setValue('C')
        .setDescription('Play Center'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Right Wing (RW)')
        .setValue('RW')
        .setDescription('Play Right Wing'),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  return {
    content: 'Select the forward position(s) you play:',
    components: [row],
  };
}

export function renderDefensePositionSelect(memberId: string) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(customId('welcome-positions', memberId, 'DEFENSE'))
    .setPlaceholder('Select defense position(s)...')
    .setMinValues(1)
    .setMaxValues(2)
    .addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel('Left Defense (LD)')
        .setValue('LD')
        .setDescription('Play Left Defense'),
      new StringSelectMenuOptionBuilder()
        .setLabel('Right Defense (RD)')
        .setValue('RD')
        .setDescription('Play Right Defense'),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
  return {
    content: 'Select the defense position(s) you play:',
    components: [row],
  };
}
