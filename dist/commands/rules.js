import { ActionRowBuilder, ButtonBuilder, ButtonStyle, } from 'discord.js';
import { OFFICIAL_RULE_CATALOG } from '../services/rules.service.js';
import { brandedEmbed, renderSuccess, renderWarning } from '../renderers/design.js';
import { AppError } from '../utils/errors.js';
import { requireManagement } from './authorization.js';
export async function handleRules(interaction, context) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Browse rules inside the server.');
    const documents = await context.rules.ensureCatalog(interaction.guildId);
    const lines = OFFICIAL_RULE_CATALOG.map((catalog) => {
        const document = documents.find((item) => item.key === catalog.key);
        const indexed = document?.versions[0]?._count.sections ?? 0;
        const state = catalog.active
            ? indexed
                ? `Indexed • ${indexed} sections`
                : 'Official source linked • text not indexed yet'
            : 'Not yet published/configured for NHL 27.';
        return `**${catalog.title}**\n${state}${document?.sourceUrl ? ` • [Official source](${document.sourceUrl})` : ''}`;
    }).join('\n\n');
    await interaction.reply({
        embeds: [
            brandedEmbed()
                .setTitle('OFFICIAL LG RULES')
                .setDescription(`${lines}\n\nUse \`/rule search\` to search indexed official text. Sources are authoritative.`),
        ],
        ephemeral: true,
    });
}
export async function handleRule(interaction, context) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use rule commands inside the server.');
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'admin-add') {
        await requireManagement(interaction, context);
        const attachment = interaction.options.getAttachment('text', true);
        if (attachment.size > 1_000_000)
            throw new AppError('INVALID_INPUT', 'Rule text attachments must be 1 MB or smaller.');
        if (attachment.contentType && !attachment.contentType.startsWith('text/'))
            throw new AppError('INVALID_INPUT', 'Upload an extracted UTF-8 `.txt` file. Preserve the official PDF URL in the source field.');
        if (!attachment.name.toLowerCase().endsWith('.txt'))
            throw new AppError('INVALID_INPUT', 'Upload official rule content as a UTF-8 `.txt` file.');
        const response = await fetch(attachment.url);
        if (!response.ok)
            throw new AppError('NOT_FOUND', 'Discord could not retrieve that attachment.');
        const text = await response.text();
        const sourceUrl = interaction.options.getString('source', true);
        const result = await context.rules.ingest({
            guildId: interaction.guildId,
            key: interaction.options.getString('key', true),
            title: interaction.options.getString('title', true),
            kind: interaction.options.getString('kind', true),
            sourceUrl,
            versionLabel: interaction.options.getString('version', true),
            text,
            actorDiscordId: interaction.user.id,
        });
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('Official rule text indexed', `${result.document.title}\nVersion: **${result.version.versionLabel}**\nSections: **${result.sectionCount}**`),
            ],
        });
        return;
    }
    if (subcommand === 'admin-state') {
        await requireManagement(interaction, context);
        const active = interaction.options.getBoolean('active', true);
        const document = await context.rules.setActive(interaction.guildId, interaction.options.getString('key', true), active, interaction.user.id);
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderSuccess('Rule document updated', `**${document.title}** is now ${active ? 'active' : 'inactive'}. Historical versions were preserved.`),
            ],
        });
        return;
    }
    const query = interaction.options.getString(subcommand === 'ask' ? 'question' : 'query', true);
    const results = await context.rules.search(interaction.guildId, query);
    if (!results.length) {
        await interaction.reply({
            ephemeral: true,
            embeds: [
                renderWarning('No official match found', 'The indexed official documents do not clearly answer this. No rule was guessed.'),
            ],
        });
        return;
    }
    const fields = results.map((result) => {
        const sourceUrl = result.version.sourceUrl ?? result.version.document.sourceUrl;
        return {
            name: `${result.version.document.title}${result.sectionKey ? ` • ${result.sectionKey}` : ''}${result.title ? ` • ${result.title}` : ''}`.slice(0, 256),
            value: `${excerpt(result.content, 650)}${sourceUrl ? `\n[Official source](${sourceUrl})` : '\nOfficial source URL is not configured.'}`,
        };
    });
    const embed = brandedEmbed()
        .setTitle(subcommand === 'ask' ? 'OFFICIAL SOURCE RESULTS' : `RULE SEARCH • ${query.slice(0, 100)}`)
        .setDescription(subcommand === 'ask'
        ? '**OFFICIAL RULE / SOURCE**\nThe excerpts below are retrieved only from indexed official documents.\n\n**PLAIN-ENGLISH EXPLANATION**\nAn AI provider is not configured, so the assistant will not invent or infer an answer. Review the cited text or ask League Staff if it is unclear.'
        : 'Best matches from active, indexed official LG documents.')
        .addFields(fields);
    await interaction.reply({ ephemeral: true, embeds: [embed] });
}
export async function handleBuilds(interaction, context) {
    await renderStructuredDocument(interaction, context, 'BUILD_RULES', 'The official NHL 27 build/trait rules have not yet been configured.');
}
export async function handleDisconnect(interaction, context) {
    await renderStructuredDocument(interaction, context, 'DISCONNECT', 'The official NHL 27 disconnect procedure has not yet been configured.');
}
async function renderStructuredDocument(interaction, context, kind, unavailable) {
    if (!interaction.guildId)
        throw new AppError('NOT_ALLOWED', 'Use this command inside the server.');
    await context.rules.ensureCatalog(interaction.guildId);
    const document = await context.rules.getConfigured(interaction.guildId, kind);
    if (!document?.versions[0]) {
        await interaction.reply({
            ephemeral: true,
            embeds: [renderWarning('Not yet configured', unavailable)],
        });
        return;
    }
    const version = document.versions[0];
    const description = version.sections
        .map((section) => section.content)
        .join('\n\n')
        .slice(0, 3800);
    const sourceUrl = version.sourceUrl ?? document.sourceUrl;
    await interaction.reply({
        ephemeral: true,
        embeds: [
            brandedEmbed()
                .setTitle(document.title)
                .setDescription(`${description}\n\nOfficial source is authoritative.`),
        ],
        components: sourceUrl
            ? [
                new ActionRowBuilder().addComponents(new ButtonBuilder()
                    .setLabel('Open Official Source')
                    .setStyle(ButtonStyle.Link)
                    .setURL(sourceUrl)),
            ]
            : [],
    });
}
function excerpt(content, maxLength) {
    const normalized = content.replace(/\s+/g, ' ').trim();
    return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}
//# sourceMappingURL=rules.js.map