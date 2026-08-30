import { brandedEmbed } from '../renderers/design.js';
export async function handleHelp(interaction) {
    await interaction.reply({
        ephemeral: true,
        embeds: [
            brandedEmbed()
                .setTitle("HOW ANTKOGG'S LG ASSISTANT WORKS")
                .setDescription('Scouting, weekly availability, team operations, and official rule references—inside Discord.')
                .addFields({
                name: '1 • REGISTER',
                value: 'Run `/profile`, tap **Register**, and enter your exact EA Tag.',
            }, { name: '2 • FIND SCOUTING', value: 'Run `/scouting` or open the scouting channel.' }, {
                name: '3 • CLAIM A SPOT',
                value: 'Tap an eligible position. You are confirmed immediately and receive a DM.',
            }, {
                name: '4 • WEEKLY AVAILABILITY',
                value: 'Use the current availability post to answer every game, or run `/availability mine` to review your week.',
            }, {
                name: '5 • GAME DAY',
                value: 'After management confirms you, run `/game` for your position, opponent, server, and code.',
            }, {
                name: 'CHANGE OF PLANS?',
                value: 'Tap another position to switch, or **Leave Game**. Waitlists automatically get the next opportunity.',
            }, {
                name: 'OFFICIAL RULES',
                value: 'Use `/rules`, `/rule search`, `/builds`, or `/disconnect`. The bot cites configured official sources and does not guess.',
            }, {
                name: 'MANAGEMENT',
                value: '`/timezone` • `/week` • `/availability manage` • `/game` • `/scout` • `/player` • `/setup`',
            }),
        ],
    });
}
//# sourceMappingURL=help.js.map