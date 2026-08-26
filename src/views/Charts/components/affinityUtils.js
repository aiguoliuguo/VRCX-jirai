/**
 * Affinity scoring based on coexistence stats.
 * Score (0-100) = weighted combination of log-scaled shared time,
 * log-scaled shared-instance count and a recency decay factor.
 */

export const AFFINITY_WEIGHTS = Object.freeze({
    time: 0.5,
    count: 0.3,
    recency: 0.2
});

/** Recency is at full strength when the last encounter happened within this many days. */
export const RECENCY_FULL_DAYS = 30;
/** Recency decays linearly to zero after this many days. */
export const RECENCY_DECAY_DAYS = 60;

/**
 * Attach an `score` (0-100, one decimal) to each coexistence row, normalized
 * relative to the strongest row in the list (log scale).
 *
 * @param {Array<object>} rows - Rows with { coexistenceMs, encounterCount, lastEncounterAt }
 * @param {number} now - Epoch ms used as the reference for recency
 * @returns {Array<object>} Same rows extended with `score`
 */
export function computeAffinityScores(rows, now = Date.now()) {
    const list = Array.isArray(rows) ? rows : [];
    if (list.length === 0) {
        return [];
    }
    let maxTime = 0;
    let maxCount = 0;
    for (const row of list) {
        maxTime = Math.max(maxTime, row.coexistenceMs || 0);
        maxCount = Math.max(maxCount, row.encounterCount || 0);
    }
    const timeLogMax = Math.log1p(maxTime);
    const countLogMax = Math.log1p(maxCount);

    return list.map((row) => {
        const timeNorm =
            timeLogMax > 0
                ? Math.log1p(row.coexistenceMs || 0) / timeLogMax
                : 0;
        const countNorm =
            countLogMax > 0
                ? Math.log1p(row.encounterCount || 0) / countLogMax
                : 0;
        const lastMs = row.lastEncounterAt
            ? Date.parse(row.lastEncounterAt)
            : 0;
        const days = lastMs
            ? Math.max(0, (now - lastMs) / 86400000)
            : RECENCY_DECAY_DAYS;
        const recencyNorm = Math.max(0, 1 - days / RECENCY_DECAY_DAYS);
        const rawScore =
            AFFINITY_WEIGHTS.time * timeNorm +
            AFFINITY_WEIGHTS.count * countNorm +
            AFFINITY_WEIGHTS.recency * recencyNorm;
        const score = Math.min(
            100,
            Math.max(0, Math.round(rawScore * 1000) / 10)
        );
        return { ...row, score };
    });
}

/**
 * Whole days elapsed since the last encounter (1 decimal), or null when
 * unavailable.
 * @param {object|null} row
 * @param {number} now - Epoch ms
 * @returns {number|null}
 */
export function daysSinceLastEncounter(row, now = Date.now()) {
    if (!row || !row.lastEncounterAt) {
        return null;
    }
    const ms = Date.parse(row.lastEncounterAt);
    if (Number.isNaN(ms)) {
        return null;
    }
    return Math.max(0, Math.round((now - ms) / 8640000) / 10);
}
