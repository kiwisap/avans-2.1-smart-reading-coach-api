import type { AdviceStatsDto } from '../dto/adviceStatsDto.js';
import type { AdviceStatsRepository } from '../repositories/adviceStatsRepository.js';
import type { UserRepository } from '../repositories/userRepository.js';

interface Deps {
    adviceStatsRepository: Pick<
        AdviceStatsRepository,
        'shownBySource' | 'itemsBySource' | 'ratingsBySource'
    >;
    userRepository: Pick<UserRepository, 'findStudentsOfTeacher'>;
}

interface Tally {
    total: number;
    read: number;
    rated: number;
    stars: number;
}

const average = (tally: Pick<Tally, 'rated' | 'stars'>): number | null =>
    tally.rated > 0 ? Math.round((tally.stars / tally.rated) * 10) / 10 : null;

const toCount = ({ total, read, rated, stars }: Tally) => ({
    total,
    read,
    rated,
    averageRating: average({ rated, stars }),
});

// Whether the advice of Bo helps: what Bo showed, what students added and from where, what they
// read and how they rated it. Only about the students the teacher is linked to.
export function createAdviceStatsService({ adviceStatsRepository, userRepository }: Deps) {
    return {
        async getStats(teacherId: string): Promise<AdviceStatsDto> {
            const [students, shownRows, itemRows, ratingRows] = await Promise.all([
                userRepository.findStudentsOfTeacher(teacherId),
                adviceStatsRepository.shownBySource(teacherId),
                adviceStatsRepository.itemsBySource(teacherId),
                adviceStatsRepository.ratingsBySource(teacherId),
            ]);

            const empty = (): Tally => ({ total: 0, read: 0, rated: 0, stars: 0 });
            const added = { advice: empty(), catalog: empty(), teacher: empty(), unknown: empty() };
            const models = {
                ai: { shown: 0, ...empty() },
                rules: { shown: 0, ...empty() },
            };
            let catalogAlsoSuggested = 0;

            for (const row of shownRows) models[row.source].shown += row.total;

            for (const row of itemRows) {
                const bucket = added[row.source ?? 'unknown'];
                bucket.total += row.total;
                bucket.read += row.read;
                if (row.source === 'advice' && row.suggestedBy) {
                    models[row.suggestedBy].total += row.total;
                    models[row.suggestedBy].read += row.read;
                }
                if (row.source === 'catalog' && row.suggestedBy) catalogAlsoSuggested += row.total;
            }

            for (const row of ratingRows) {
                const bucket = added[row.source ?? 'unknown'];
                bucket.rated += row.total;
                bucket.stars += row.stars;
                if (row.source === 'advice' && row.suggestedBy) {
                    models[row.suggestedBy].rated += row.total;
                    models[row.suggestedBy].stars += row.stars;
                }
            }

            const toModel = ({ shown, total, read, rated, stars }: Tally & { shown: number }) => ({
                shown,
                added: total,
                read,
                rated,
                averageRating: average({ rated, stars }),
            });

            return {
                students: students.length,
                shown: models.ai.shown + models.rules.shown,
                added: {
                    advice: toCount(added.advice),
                    catalog: toCount(added.catalog),
                    teacher: toCount(added.teacher),
                    unknown: toCount(added.unknown),
                },
                catalogAlsoSuggested,
                bySource: { ai: toModel(models.ai), rules: toModel(models.rules) },
            };
        },
    };
}

export type AdviceStatsService = ReturnType<typeof createAdviceStatsService>;
