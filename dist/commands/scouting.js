import { DateTime } from 'luxon';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
import { accessLevel, hasManagementAccess } from '../domain/permissions.js';
import { capacity } from '../domain/scouting.js';
import { renderManagementPanel } from '../renderers/management.renderer.js';
import { brandedEmbed, discordTimestamp, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
export async function handleScoutingBrowser(interaction, context) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this command in the server.');
    const sessions = await context.scouting.upcoming(interaction.guildId);
    if (!sessions.length) {
        await interaction.reply({
            ephemeral: true,
            embeds: [
                brandedEmbed()
                    .setTitle('UPCOMING SCOUTING')
                    .setDescription('No upcoming sessions are posted yet.'),
            ],
        });
        return;
    }
    const embed = brandedEmbed()
        .setTitle('UPCOMING SCOUTING')
        .setDescription('Choose a time to jump to its signup post.')
        .addFields(...sessions.slice(0, 10).map((session) => ({
        name: `${discordTimestamp(session.startsAt, 'D')} • ${discordTimestamp(session.startsAt, 't')}`,
        value: `${session.format === 'PRIVATE_6V6' ? 'Private 6v6' : 'One Side'} • ${session.assignments.length}/${capacity(session.format)} • ${session.status}`,
        inline: true,
    })));
    const links = sessions.filter((session) => session.channelId && session.messageId).slice(0, 5);
    const components = links.length
        ? [
            new ActionRowBuilder().addComponents(...links.map((session) => new ButtonBuilder()
                .setLabel(DateTime.fromJSDate(session.startsAt).toFormat('ccc h:mm a'))
                .setStyle(ButtonStyle.Link)
                .setURL(`https://discord.com/channels/${interaction.guildId}/${session.channelId}/${session.messageId}`))),
        ]
        : [];
    await interaction.reply({ ephemeral: true, embeds: [embed], components });
}
export async function handleScout(interaction, context) {
    if (!interaction.guildId || !interaction.member || !('roles' in interaction.member))
        throw new AppError('NOT_ALLOWED', 'Use this command in the server.');
    const config = await context.config.ensure(interaction.guildId);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!hasManagementAccess(accessLevel(member, config.managementRoleId)))
        throw new AppError('NOT_ALLOWED', 'This command is for Bench Boss management.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'upcoming')
        return handleScoutingBrowser(interaction, context);
    if (subcommand === 'create') {
        if (!config.scoutingChannelId)
            throw new AppError('NOT_CONFIGURED', 'Configure the scouting channel with `/setup channels` first.');
        const dateStr = interaction.options.getString('date', true);
        const timeStr = interaction.options.getString('time', true);
        let starts = DateTime.now().setZone(config.timezone);
        if (dateStr === 'Tomorrow') {
            starts = starts.plus({ days: 1 });
        }
        else if (dateStr !== 'Today') {
            const targetDayMap = {
                Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
                Friday: 5, Saturday: 6, Sunday: 7
            };
            const targetDay = targetDayMap[dateStr];
            if (targetDay) {
                let daysToAdd = targetDay - starts.weekday;
                if (daysToAdd <= 0)
                    daysToAdd += 7;
                starts = starts.plus({ days: daysToAdd });
            }
        }
        const [hours, minutes] = timeStr.split(':').map(Number);
        starts = starts.set({ hour: hours, minute: minutes, second: 0, millisecond: 0 });
        if (!starts.isValid)
            throw new AppError('INVALID_INPUT', 'Failed to parse the selected date and time.');
        if (starts.toMillis() < Date.now() - 60_000)
            throw new AppError('INVALID_INPUT', 'Scouting must start in the future. Check your time selection.');
        await interaction.deferReply({ ephemeral: true });
        const title = interaction.options.getString('title');
        const session = await context.scouting.create({
            guildId: interaction.guildId,
            startsAt: starts.toUTC().toJSDate(),
            durationMinutes: config.defaultDurationMinutes,
            format: interaction.options.getString('format', true),
            signupMode: (interaction.options.getString('mode') ?? 'OPEN_SIGNUP'),
            ...(title ? { note: title } : {}),
            createdByDiscordId: interaction.user.id,
        });
        await context.posts.publish(session);
        await interaction.editReply({
            embeds: [
                renderSuccess('Scouting posted', `${discordTimestamp(session.startsAt, 'F')} is live in <#${session.guildConfig.scoutingChannelId}>.`),
            ],
        });
        return;
    }
    const requestedId = interaction.options.getString('session');
    const session = requestedId
        ? await context.scouting.get(requestedId)
        : (await context.scouting.upcoming(interaction.guildId, 1))[0];
    if (!session)
        throw new AppError('NOT_FOUND', 'No upcoming scouting session was found.');
    await interaction.reply({ ephemeral: true, ...renderManagementPanel(session) });
}
//# sourceMappingURL=scouting.js.map