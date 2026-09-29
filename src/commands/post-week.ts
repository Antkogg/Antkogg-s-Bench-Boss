import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { DateTime } from 'luxon';
import { requireManagement } from './authorization.js';
import type { BotContext } from './context.js';
import { OFFICIAL_SCHEDULE, type OfficialWeekSchedule } from '../config/official-schedule.js';
import { DEFAULT_AVAILABILITY_CHANNEL_ID } from '../config/constants.js';
import { brandedEmbed } from '../renderers/design.js';
import { renderIndividualGamePost } from '../renderers/schedule.renderer.js';
import { customId, type ParsedCustomId } from '../utils/custom-id.js';
import { AppError } from '../utils/errors.js';

export async function handlePostWeek(
  interaction: ChatInputCommandInteraction,
  context: BotContext,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
  await requireManagement(interaction, context);

  const rawWeek = interaction.options.getString('week')?.toLowerCase().trim();

  if (rawWeek) {
    const key = rawWeek.includes('2')
      ? 'week-2'
      : rawWeek.includes('3')
        ? 'week-3'
        : rawWeek.includes('4')
          ? 'week-4'
          : rawWeek.includes('5')
            ? 'week-5'
            : rawWeek.includes('6')
              ? 'week-6'
              : rawWeek.includes('7')
                ? 'week-7'
                : rawWeek.includes('8')
                  ? 'week-8'
                  : rawWeek;
    const schedule = OFFICIAL_SCHEDULE[key];
    if (!schedule) {
      throw new AppError(
        'NOT_FOUND',
        `Unknown week "${rawWeek}". Please choose Week 2, 3, 4, 5, 6, 7, or 8.`,
      );
    }
    await executePostWeek(interaction, context, schedule);
    return;
  }

  // If no week selected, show buttons and select menu for 1-click week posting
  const allWeeks = Object.values(OFFICIAL_SCHEDULE);
  const selectMenu = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId('post-week-select', 'select'))
      .setPlaceholder('Choose a week to post to #team-availability...')
      .addOptions(
        allWeeks.map((w) => ({
          label: `${w.label} (${w.datesLabel})`,
          value: w.weekKey,
          description: `${w.games.length} official league games`,
        })),
      ),
  );

  const buttonRow1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...allWeeks.slice(0, 4).map((w) =>
      new ButtonBuilder()
        .setCustomId(customId('post-week-btn', w.weekKey))
        .setLabel(w.label)
        .setStyle(ButtonStyle.Primary),
    ),
  );
  const buttonRow2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...allWeeks.slice(4).map((w) =>
      new ButtonBuilder()
        .setCustomId(customId('post-week-btn', w.weekKey))
        .setLabel(w.label)
        .setStyle(ButtonStyle.Primary),
    ),
  );

  await interaction.editReply({
    content: '📅 **Select which week to load and post availability for (times converted from MST):**',
    components: [buttonRow1, buttonRow2, selectMenu],
  });
}

export async function handlePostWeekInteraction(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  context: BotContext,
  parsed: ParsedCustomId,
) {
  if (!interaction.guildId || !interaction.guild)
    throw new AppError('NOT_ALLOWED', 'Use this inside the server.');
  await interaction.deferReply({ ephemeral: true });
  await requireManagement(interaction, context);

  const key = interaction.isStringSelectMenu()
    ? interaction.values[0]!
    : parsed.entityId;

  const schedule = OFFICIAL_SCHEDULE[key];
  if (!schedule) {
    throw new AppError('NOT_FOUND', `Schedule for ${key} not found.`);
  }

  await executePostWeek(interaction, context, schedule);
}

async function executePostWeek(
  interaction: ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction,
  context: BotContext,
  weekData: OfficialWeekSchedule,
) {
  const guildId = interaction.guildId!;
  const config = await context.config.ensure(guildId);

  // Find or create season
  let season = await context.prisma.season.findFirst({
    where: { guildConfigId: config.id, status: 'ACTIVE' },
    orderBy: { number: 'desc' },
  });
  if (!season) {
    season = await context.prisma.season.findFirst({
      where: { guildConfigId: config.id },
      orderBy: { number: 'desc' },
    });
  }
  if (!season) {
    season = await context.prisma.season.create({
      data: {
        guildConfigId: config.id,
        number: 55,
        label: 'S55',
        createdByDiscordId: interaction.user.id,
      },
    });
  }

  const sundayDt = DateTime.fromISO(weekData.sundayDate, { zone: 'America/Edmonton' });
  const startsOnUtc = sundayDt.toUTC().toJSDate();
  const deadline = sundayDt.plus({ days: 6, hours: 23, minutes: 59 }).toUTC().toJSDate();

  // Save manager's scheduling timezone to America/Edmonton (MST)
  await context.schedule.setManagementTimezone(
    guildId,
    interaction.user.id,
    'America/Edmonton',
    interaction.user.id,
  );

  // Find or create SeasonWeek
  let seasonWeek = await context.prisma.seasonWeek.findFirst({
    where: {
      guildConfigId: config.id,
      seasonId: season.id,
      weekNumber: weekData.weekNumber,
    },
    include: { games: true },
  });

  if (!seasonWeek) {
    seasonWeek = await context.prisma.seasonWeek.create({
      data: {
        guildConfigId: config.id,
        seasonId: season.id,
        weekNumber: weekData.weekNumber,
        label: weekData.label,
        status: 'OPEN',
        startsOn: startsOnUtc,
        deadline,
        createdByDiscordId: interaction.user.id,
      },
      include: { games: true },
    });
  } else {
    // If games already exist, delete previous games so we cleanly populate the exact official matchups
    if (seasonWeek.games.length > 0) {
      await context.prisma.playerGameAvailability.deleteMany({
        where: { game: { weekId: seasonWeek.id } },
      });
      await context.prisma.gameLineupAssignment.deleteMany({
        where: { game: { weekId: seasonWeek.id } },
      });
      await context.prisma.weeklyGame.deleteMany({
        where: { weekId: seasonWeek.id },
      });
    }
    // Reopen week if needed
    if (seasonWeek.status !== 'OPEN') {
      await context.prisma.seasonWeek.update({
        where: { id: seasonWeek.id },
        data: { status: 'OPEN' },
      });
    }
  }

  // Populate games (converted accurately from MST to UTC so Discord dynamic tags display in every player's local timezone)
  const addedGames: string[] = [];
  for (const game of weekData.games) {
    await context.schedule.addGame({
      guildId,
      weekId: seasonWeek.id,
      opponent: game.opponent,
      date: game.date,
      time: game.time,
      homeAway: game.homeAway,
      timezone: 'America/Edmonton',
      actorDiscordId: interaction.user.id,
    });
    addedGames.push(
      `${game.homeAway === 'AWAY' ? '@' : 'vs'} **${game.opponent}** • ${game.date} at ${game.time} MST`,
    );
  }

  // Fetch complete week and publish individual games to availability channel
  const fullWeek = await context.schedule.getWeek(seasonWeek.id);
  const channelId = config.teamAvailabilityChannelId || DEFAULT_AVAILABILITY_CHANNEL_ID;
  const postChannel = (await interaction.client.channels.fetch(channelId).catch(() => null)) as any;
  let channelMention = '`#team-availability`';

  if (postChannel && postChannel.isTextBased() && fullWeek) {
    channelMention = `<#${postChannel.id}>`;
    const activeGames = fullWeek.games.filter((g: any) => g.status !== 'CANCELLED');
    for (let i = 0; i < activeGames.length; i++) {
      const g = activeGames[i]!;
      const msg = await postChannel.send(renderIndividualGamePost(g, i + 1));
      await context.prisma.weeklyGame.update({
        where: { id: g.id },
        data: { notes: msg.id },
      });
    }
  }

  const embed = brandedEmbed()
    .setTitle(`🏒 ${weekData.label.toUpperCase()} POSTED!`)
    .setDescription(
      `Successfully posted **${weekData.games.length} individual games** for **${weekData.label} (${weekData.datesLabel})**.\n\n` +
        `Individual game cards have been posted in ${channelMention}!\n\n` +
        '**Games Posted:**\n' +
        addedGames.map((g, i) => `${i + 1}. ${g}`).join('\n') +
        '\n\n*Players can now click `[ 🟢 Available ]` or `[ 🔴 Out ]` directly on each game card!*',
    );

  await interaction.editReply({ embeds: [embed], components: [] });
}
