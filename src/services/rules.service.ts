import { createHash } from 'node:crypto';
import type { PrismaClient, RuleDocumentKind } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { cleanDisplayValue, normalizeIdentity } from '../utils/normalize.js';

export const OFFICIAL_RULE_CATALOG = [
  {
    key: 'article-i',
    title: 'Leaguegaming Constitution - Article I',
    kind: 'CONSTITUTION' as const,
    sourceUrl: 'https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_I.pdf',
    active: true,
  },
  {
    key: 'article-ii',
    title: 'Leaguegaming Constitution - Article II',
    kind: 'CONSTITUTION' as const,
    sourceUrl: 'https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_II.pdf',
    active: true,
  },
  {
    key: 'article-iii',
    title: 'Leaguegaming Constitution - Article III',
    kind: 'CONSTITUTION' as const,
    sourceUrl: 'https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_III.pdf',
    active: true,
  },
  {
    key: 'article-iv',
    title: 'Leaguegaming Constitution - Article IV',
    kind: 'CONSTITUTION' as const,
    sourceUrl: 'https://www.leaguegaming.com/esports/Leaguegaming_Constitution_Article_IV.pdf',
    active: true,
  },
  { key: 'playoff-rules', title: 'LG Playoff Rulebook', kind: 'PLAYOFF' as const, active: false },
  { key: 'nhl27-builds', title: 'NHL 27 Build Rules', kind: 'BUILD_RULES' as const, active: false },
  {
    key: 'nhl27-disconnect',
    title: 'NHL 27 Disconnect Procedure',
    kind: 'DISCONNECT' as const,
    active: false,
  },
] as const;

export interface RuleChunk {
  sectionKey?: string;
  title?: string;
  content: string;
  searchText: string;
  sortOrder: number;
}

export function chunkRuleText(rawText: string, maxLength = 1400): RuleChunk[] {
  const text = rawText
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  if (!text) return [];
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const chunks: RuleChunk[] = [];
  let sectionKey: string | undefined;
  let title: string | undefined;
  let buffer = '';
  const flush = () => {
    if (!buffer.trim()) return;
    const content = buffer.trim();
    chunks.push({
      ...(sectionKey ? { sectionKey } : {}),
      ...(title ? { title } : {}),
      content,
      searchText: normalizeIdentity(`${sectionKey ?? ''} ${title ?? ''} ${content}`),
      sortOrder: chunks.length,
    });
    buffer = '';
  };
  for (const line of lines) {
    const heading = line.match(/^(\d+(?:\.\d+)*):?\s+(.{2,160})$/);
    if (heading) {
      flush();
      sectionKey = heading[1];
      title = heading[2];
      buffer = line;
      continue;
    }
    if (buffer && buffer.length + line.length + 1 > maxLength) flush();
    buffer += `${buffer ? '\n' : ''}${line}`;
  }
  flush();
  return chunks;
}

export class RulesService {
  constructor(private readonly prisma: PrismaClient) {}

  async ensureCatalog(guildId: string) {
    const config = await this.prisma.guildConfig.upsert({
      where: { guildId },
      update: {},
      create: { guildId },
    });
    await Promise.all(
      OFFICIAL_RULE_CATALOG.map((entry) =>
        this.prisma.ruleDocument.upsert({
          where: { guildConfigId_key: { guildConfigId: config.id, key: entry.key } },
          update: 'sourceUrl' in entry ? { sourceUrl: entry.sourceUrl } : {},
          create: {
            guildConfigId: config.id,
            key: entry.key,
            title: entry.title,
            kind: entry.kind,
            sourceUrl: 'sourceUrl' in entry ? entry.sourceUrl : null,
            active: entry.active,
          },
        }),
      ),
    );
    return this.list(guildId);
  }

  list(guildId: string) {
    return this.prisma.ruleDocument.findMany({
      where: { guildConfig: { guildId } },
      include: {
        versions: {
          where: { active: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { _count: { select: { sections: true } } },
        },
      },
      orderBy: [{ kind: 'asc' }, { title: 'asc' }],
    });
  }

  getConfigured(guildId: string, kind: RuleDocumentKind) {
    return this.prisma.ruleDocument.findFirst({
      where: { guildConfig: { guildId }, kind, active: true, versions: { some: { active: true } } },
      include: {
        versions: {
          where: { active: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: { sections: { orderBy: { sortOrder: 'asc' }, take: 5 } },
        },
      },
    });
  }

  async ingest(input: {
    guildId: string;
    key: string;
    title: string;
    kind: RuleDocumentKind;
    sourceUrl: string;
    versionLabel: string;
    text: string;
    actorDiscordId: string;
  }) {
    const chunks = chunkRuleText(input.text);
    if (!chunks.length) throw new AppError('INVALID_INPUT', 'The supplied rule text is empty.');
    const config = await this.prisma.guildConfig.upsert({
      where: { guildId: input.guildId },
      update: {},
      create: { guildId: input.guildId },
    });
    const key = normalizeIdentity(input.key)
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    if (!key) throw new AppError('INVALID_INPUT', 'A document key is required.');
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(input.sourceUrl);
    } catch {
      throw new AppError('INVALID_INPUT', 'Enter a valid official source URL.');
    }
    if (sourceUrl.protocol !== 'https:')
      throw new AppError('INVALID_INPUT', 'Official rule sources must use HTTPS.');
    const title = cleanDisplayValue(input.title, 120);
    const versionLabel = cleanDisplayValue(input.versionLabel, 50);
    const contentHash = createHash('sha256').update(input.text).digest('hex');
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.ruleDocument.upsert({
        where: { guildConfigId_key: { guildConfigId: config.id, key } },
        update: { title, kind: input.kind, sourceUrl: input.sourceUrl, active: true },
        create: {
          guildConfigId: config.id,
          key,
          title,
          kind: input.kind,
          sourceUrl: input.sourceUrl,
          active: true,
        },
      });
      await tx.ruleDocumentVersion.updateMany({
        where: { documentId: document.id },
        data: { active: false },
      });
      const version = await tx.ruleDocumentVersion.upsert({
        where: { documentId_versionLabel: { documentId: document.id, versionLabel } },
        update: {
          sourceUrl: input.sourceUrl,
          contentHash,
          active: true,
          sections: { deleteMany: {}, create: chunks },
        },
        create: {
          documentId: document.id,
          versionLabel,
          sourceUrl: input.sourceUrl,
          contentHash,
          createdByDiscordId: input.actorDiscordId,
          sections: { create: chunks },
        },
        include: { _count: { select: { sections: true } } },
      });
      await tx.auditLog.create({
        data: {
          guildConfigId: config.id,
          actorDiscordId: input.actorDiscordId,
          action: 'RULE_DOCUMENT_INGESTED',
          targetType: 'RuleDocumentVersion',
          targetId: version.id,
          details: { key, versionLabel, contentHash, sections: chunks.length },
        },
      });
      return { document, version, sectionCount: chunks.length };
    });
  }

  async setActive(guildId: string, key: string, active: boolean, actorDiscordId: string) {
    const document = await this.prisma.ruleDocument.findFirst({
      where: { guildConfig: { guildId }, key },
    });
    if (!document) throw new AppError('NOT_FOUND', 'Rule document not found.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ruleDocument.update({
        where: { id: document.id },
        data: { active },
      });
      await tx.auditLog.create({
        data: {
          guildConfigId: document.guildConfigId,
          actorDiscordId,
          action: 'RULE_DOCUMENT_STATUS_CHANGED',
          targetType: 'RuleDocument',
          targetId: document.id,
          details: { active },
        },
      });
      return updated;
    });
  }

  async search(guildId: string, query: string, take = 5) {
    const terms = normalizeIdentity(query)
      .split(' ')
      .filter((term) => term.length >= 2)
      .slice(0, 8);
    if (!terms.length) throw new AppError('INVALID_INPUT', 'Enter a meaningful rule search query.');
    const sections = await this.prisma.ruleSection.findMany({
      where: {
        version: {
          active: true,
          document: { guildConfig: { guildId }, active: true },
        },
        OR: terms.map((term) => ({ searchText: { contains: term, mode: 'insensitive' } })),
      },
      include: { version: { include: { document: true } } },
      take: 150,
    });
    return sections
      .map((section) => ({
        ...section,
        score: terms.reduce((score, term) => {
          const haystack = section.searchText.toLowerCase();
          return (
            score +
            (haystack.split(term).length - 1) +
            (section.title?.toLowerCase().includes(term) ? 3 : 0)
          );
        }, 0),
      }))
      .sort((a, b) => b.score - a.score || a.sortOrder - b.sortOrder)
      .slice(0, take);
  }
}
