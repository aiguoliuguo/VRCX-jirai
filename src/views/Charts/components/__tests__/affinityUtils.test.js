import { describe, expect, it } from 'vitest';

import {
    AFFINITY_WEIGHTS,
    computeAffinityScores,
    daysSinceLastEncounter
} from '../affinityUtils';

const NOW = Date.UTC(2026, 0, 15); // 2026-01-15T00:00:00Z

function iso(daysAgo) {
    return new Date(NOW - daysAgo * 86400000).toISOString();
}

function row(coexistenceMs, encounterCount, lastEncounterAt) {
    return { coexistenceMs, encounterCount, lastEncounterAt };
}

describe('computeAffinityScores', () => {
    it('returns an empty array for empty input', () => {
        expect(computeAffinityScores([], NOW)).toEqual([]);
        expect(computeAffinityScores(null, NOW)).toEqual([]);
    });

    it('scores the strongest row 100 when it is recent', () => {
        const rows = [
            row(7200000, 12, iso(0)),
            row(3600000, 4, iso(50)),
            row(0, 0, null)
        ];
        const scored = computeAffinityScores(rows, NOW);
        expect(scored).toHaveLength(3);
        expect(scored[0].score).toBe(100);
    });

    it('never exceeds the 0-100 bound', () => {
        const rows = [row(86400000 * 30, 500, iso(0))];
        const scored = computeAffinityScores(rows, NOW);
        expect(scored[0].score).toBeLessThanOrEqual(100);
        expect(scored[0].score).toBeGreaterThanOrEqual(0);
    });

    it('ranks rows sharing more time higher when everything else is equal', () => {
        const now = Date.now();
        const rows = [
            row(1000, 1, new Date(now + 1000).toISOString()),
            row(999, 1, new Date(now + 1000).toISOString())
        ];
        const scored = computeAffinityScores(rows, now);
        expect(scored[0].coexistenceMs).toBeGreaterThan(
            scored[1].coexistenceMs
        );
        expect(scored[0].score).toBeGreaterThanOrEqual(scored[1].score);
    });

    it('applies recency decay: records older than decay window contribute no recency', () => {
        const recent = row(3600000, 2, iso(0));
        const stale = row(3600000, 2, iso(120));
        const scored = computeAffinityScores([recent, stale], NOW);
        expect(scored[1].score).toBeLessThan(scored[0].score);
        const recencyPart = AFFINITY_WEIGHTS.recency;
        const maxGap = (scored[0].score - scored[1].score) / 100;
        expect(maxGap).toBeCloseTo(recencyPart, 5);
    });

    it('treats a missing last encounter as zero recency', () => {
        const rows = [row(3600000, 10, null), row(3600000, 10, iso(0))];
        const scored = computeAffinityScores(rows, NOW);
        expect(scored[0].score).toBeLessThan(scored[1].score);
    });

    it('does not mutate the input rows', () => {
        const rows = [row(1000, 1, iso(1))];
        const copy = { ...rows[0] };
        computeAffinityScores(rows, NOW);
        expect(rows[0]).toEqual(copy);
        expect(rows[0].score).toBeUndefined();
    });
});

describe('daysSinceLastEncounter', () => {
    it('returns null when the row has no last encounter', () => {
        expect(daysSinceLastEncounter(null, NOW)).toBeNull();
        expect(daysSinceLastEncounter({}, NOW)).toBeNull();
        expect(
            daysSinceLastEncounter({ lastEncounterAt: 'not-a-date' }, NOW)
        ).toBeNull();
    });

    it('returns 0 for a same-day encounter', () => {
        expect(daysSinceLastEncounter({ lastEncounterAt: iso(0) }, NOW)).toBe(
            0
        );
    });

    it('returns the elapsed days with one decimal', () => {
        expect(daysSinceLastEncounter({ lastEncounterAt: iso(2.5) }, NOW)).toBe(
            2.5
        );
        expect(daysSinceLastEncounter({ lastEncounterAt: iso(30) }, NOW)).toBe(
            30
        );
    });
});
