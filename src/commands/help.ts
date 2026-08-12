import type { ChatInputCommandInteraction } from 'discord.js';
import { brandedEmbed } from '../renderers/design.js';

export async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({
    ephemeral: true,
    embeds: [
      brandedEmbed()
        .setTitle('HOW BENCH BOSS WORKS')
        .setDescription('Powerful behind the scenes. Effortless inside Discord.')
        .addFields(
          {
            name: '1 • REGISTER',
            value: 'Run `/profile`, tap **Register**, and enter your exact EA Tag.',
          },
          { name: '2 • FIND SCOUTING', value: 'Run `/scouting` or open the scouting channel.' },
          {
            name: '3 • CLAIM A SPOT',
            value: 'Tap an eligible position. You are confirmed immediately and receive a DM.',
          },
          {
            name: 'CHANGE OF PLANS?',
            value:
              'Tap another position to switch, or **Leave Game**. Waitlists automatically get the next opportunity.',
          },
          {
            name: 'MANAGEMENT',
            value: '`/scout create` • `/scout manage` • `/player` • `/board` • `/setup`',
          },
        ),
    ],
  });
}
