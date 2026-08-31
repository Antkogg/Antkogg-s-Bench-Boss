import { renderSuccess, renderError } from '../renderers/design.js';
import { renderForwardPositionSelect, renderDefensePositionSelect, } from '../renderers/welcome.renderer.js';
import { signupPositionLabel, groupForScoutingPosition } from '../domain/positions.js';
import { AppError } from '../utils/errors.js';
export async function handleWelcomeButton(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild) {
        throw new AppError('NOT_ALLOWED', 'Role selection must be completed inside the server.');
    }
    await interaction.deferReply({ ephemeral: true });
    const selected = parsed.value;
    if (selected === 'FORWARD') {
        await interaction.editReply(renderForwardPositionSelect(interaction.user.id));
        return;
    }
    if (selected === 'DEFENSE') {
        await interaction.editReply(renderDefensePositionSelect(interaction.user.id));
        return;
    }
    const validPositions = ['LW', 'C', 'RW', 'LD', 'RD', 'G'];
    if (selected && validPositions.includes(selected)) {
        const targetPosition = selected;
        const existingPlayer = await context.players.byDiscordId(interaction.guildId, interaction.user.id, interaction.user.displayName ?? interaction.user.username, interaction.user.displayAvatarURL());
        const currentPositions = (existingPlayer?.signupPositions ?? []);
        const targetGroup = groupForScoutingPosition(targetPosition);
        let currentGroup = null;
        if (currentPositions.length > 0) {
            currentGroup = groupForScoutingPosition(currentPositions[0]);
        }
        if (currentGroup && currentGroup !== targetGroup) {
            const activeGroupLabel = currentGroup === 'FORWARD' ? 'Forward' : currentGroup === 'DEFENSE' ? 'Defense' : 'Goalie';
            const targetGroupLabel = targetGroup === 'FORWARD' ? 'Forward' : targetGroup === 'DEFENSE' ? 'Defense' : 'Goalie';
            const currentList = signupPositionLabel(currentPositions);
            await interaction.editReply({
                embeds: [
                    renderError(`You currently have **${activeGroupLabel}** position(s) selected (**${currentList}**).\n\n` +
                        `To select a **${targetGroupLabel}** position, please click your active position button(s) to unselect them first.`),
                ],
            });
            return;
        }
        let nextPositions;
        if (currentPositions.includes(targetPosition)) {
            nextPositions = currentPositions.filter((p) => p !== targetPosition);
        }
        else {
            nextPositions = [...currentPositions, targetPosition];
        }
        const updatedPlayer = await context.players.updatePositions(interaction.guildId, interaction.user.id, nextPositions, interaction.user.displayName ?? interaction.user.username, interaction.user.displayAvatarURL());
        const config = await context.config.ensure(interaction.guildId);
        const member = interaction.member ??
            (await interaction.guild.members.fetch(interaction.user.id));
        await context.roles.sync(member, updatedPlayer, config);
        const posLabel = nextPositions.length > 0 ? signupPositionLabel(nextPositions) : 'None';
        await interaction.editReply({
            embeds: [
                renderSuccess(nextPositions.length > 0 ? 'Position Roles Saved!' : 'Position Roles Cleared!', nextPositions.length > 0
                    ? `Your position(s) have been set to **${posLabel}** and your server roles have been updated.`
                    : 'You have unselected all positions. Your position roles have been removed.'),
            ],
        });
        return;
    }
    throw new AppError('INVALID_INPUT', 'Unknown position selected.');
}
export async function handleWelcomeSelectMenu(interaction, context, parsed) {
    if (!interaction.guildId || !interaction.guild) {
        throw new AppError('NOT_ALLOWED', 'Role selection must be completed inside the server.');
    }
    const selectedPositions = interaction.values;
    if (!selectedPositions.length) {
        throw new AppError('INVALID_INPUT', 'Please select at least one position.');
    }
    // Validate all selected positions belong to the same group
    const group = parsed.value; // 'FORWARD' or 'DEFENSE'
    if (group === 'FORWARD') {
        const invalid = selectedPositions.some((p) => p === 'LD' || p === 'RD' || p === 'G');
        if (invalid) {
            await interaction.update({
                embeds: [
                    renderError('You cannot mix Forward positions with Defense or Goalie! Please select only Forward positions (LW, C, RW).'),
                ],
                components: [],
            });
            return;
        }
    }
    else if (group === 'DEFENSE') {
        const invalid = selectedPositions.some((p) => p === 'LW' || p === 'C' || p === 'RW' || p === 'G');
        if (invalid) {
            await interaction.update({
                embeds: [
                    renderError('You cannot mix Defense positions with Forward or Goalie! Please select only Defense positions (LD, RD).'),
                ],
                components: [],
            });
            return;
        }
    }
    const updatedPlayer = await context.players.updatePositions(interaction.guildId, interaction.user.id, selectedPositions, interaction.user.displayName ?? interaction.user.username, interaction.user.displayAvatarURL());
    const config = await context.config.ensure(interaction.guildId);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    await context.roles.sync(member, updatedPlayer, config);
    await interaction.update({
        content: '',
        embeds: [
            renderSuccess('Position Roles Saved!', `Your position(s) have been set to **${signupPositionLabel(selectedPositions)}** and your server roles have been updated.`),
        ],
        components: [],
    });
}
//# sourceMappingURL=welcome.js.map