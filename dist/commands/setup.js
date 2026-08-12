import { DateTime } from 'luxon';
import { PermissionFlagsBits } from 'discord.js';
import { brandedEmbed, renderSuccess } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
export async function handleSetup(interaction, context) {
    if (!interaction.inGuild() || !interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Setup is only available in a server.');
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator))
        throw new AppError('NOT_ALLOWED', 'Only server administrators can configure Bench Boss.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'view') {
        const config = await context.config.ensure(interaction.guildId);
        await interaction.reply({
            ephemeral: true,
            embeds: [
                brandedEmbed()
                    .setTitle('SERVER SETUP')
                    .addFields({
                    name: 'SCOUTING CHANNEL',
                    value: config.scoutingChannelId ? `<#${config.scoutingChannelId}>` : 'Not configured',
                    inline: true,
                }, {
                    name: 'MANAGEMENT ROLE',
                    value: config.managementRoleId
                        ? `<@&${config.managementRoleId}>`
                        : 'Administrators only',
                    inline: true,
                }, { name: 'TIMEZONE', value: config.timezone, inline: true }, {
                    name: 'DEFAULTS',
                    value: `${config.defaultFormat} • ${config.defaultDurationMinutes} min`,
                    inline: true,
                }, {
                    name: 'REMINDERS',
                    value: config.reminderMinutes.map((minutes) => `${minutes} min`).join(' • '),
                    inline: true,
                }),
            ],
        });
        return;
    }
    if (subcommand === 'channels') {
        const scouting = interaction.options.getChannel('scouting', true);
        const management = interaction.options.getChannel('management');
        await context.config.update({
            guildId: interaction.guildId,
            actorDiscordId: interaction.user.id,
            scoutingChannelId: scouting.id,
            managementChannelId: management?.id ?? null,
        });
    }
    else if (subcommand === 'roles') {
        const positionRoleIds = Object.fromEntries(['lw', 'c', 'rw', 'ld', 'rd', 'g']
            .map((name) => [name.toUpperCase(), interaction.options.getRole(name)?.id])
            .filter((entry) => Boolean(entry[1])));
        await context.config.update({
            guildId: interaction.guildId,
            actorDiscordId: interaction.user.id,
            managementRoleId: interaction.options.getRole('management', true).id,
            registeredRoleId: interaction.options.getRole('registered')?.id ?? null,
            forwardRoleId: interaction.options.getRole('forward')?.id ?? null,
            defenseRoleId: interaction.options.getRole('defense')?.id ?? null,
            goalieRoleId: interaction.options.getRole('goalie')?.id ?? null,
            positionRoleIds,
        });
    }
    else {
        const timezone = interaction.options.getString('timezone', true);
        if (!DateTime.now().setZone(timezone).isValid)
            throw new AppError('INVALID_INPUT', 'Use a valid IANA timezone such as `America/New_York`.');
        const reminderText = interaction.options.getString('reminders') ?? '60,15';
        const reminders = [...new Set(reminderText.split(',').map(Number))]
            .filter((value) => Number.isInteger(value) && value > 0 && value <= 1440)
            .sort((a, b) => b - a);
        if (!reminders.length)
            throw new AppError('INVALID_INPUT', 'Reminder times must be comma-separated minutes, such as `60,15`.');
        await context.config.update({
            guildId: interaction.guildId,
            actorDiscordId: interaction.user.id,
            timezone,
            defaultFormat: interaction.options.getString('format', true),
            defaultDurationMinutes: interaction.options.getInteger('duration', true),
            reminderMinutes: reminders,
        });
    }
    await interaction.reply({
        ephemeral: true,
        embeds: [renderSuccess('Setup saved', 'Bench Boss configuration is stored and ready to use.')],
    });
}
//# sourceMappingURL=setup.js.map