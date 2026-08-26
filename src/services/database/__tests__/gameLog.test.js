import { beforeEach, describe, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    execute: vi.fn()
}));

vi.mock('../../sqlite.js', () => ({
    default: {
        execute: mocks.execute,
        executeNonQuery: vi.fn()
    }
}));
vi.mock('../index.js', () => ({
    dbVars: {
        maxTableSize: 500,
        userPrefix: ''
    }
}));

import { gameLog } from '../gameLog.js';

describe('gameLog.getSelfPresenceForLocations', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('filters out zero-duration records with AND time > 0', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            callback([
                'wrld_1:123~region(us)',
                '2024-01-15T10:00:00Z',
                3600000
            ]);
            return undefined;
        });

        const result = await gameLog.getSelfPresenceForLocations('usr_abc', [
            'wrld_1:123~region(us)'
        ]);

        expect(result.get('wrld_1:123~region(us)')).toEqual([
            { selfLeave: '2024-01-15T10:00:00Z', selfTime: 3600000 }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][1]).toContain('AND time > 0');
    });

    test('returns empty map when locations array is empty', async () => {
        const result = await gameLog.getSelfPresenceForLocations('usr_abc', []);
        expect(result.size).toBe(0);
        expect(mocks.execute).not.toHaveBeenCalled();
    });
});

describe('gameLog.getCoInstanceHistoryBetweenFriends', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('includes inferred co-instance sessions from feed GPS/offline history', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            if (sql.includes('FROM gamelog_join_leave a')) {
                callback([
                    'wrld_logged:123~region(us)',
                    '2025-01-01T12:00:00Z',
                    3600000,
                    '2025-01-01T12:30:00Z',
                    3600000
                ]);
                return undefined;
            }
            if (
                sql.includes('FROM _feed_gps') ||
                sql.includes('FROM _feed_online_offline')
            ) {
                if (params['@userId'] === 'usr_a') {
                    callback([
                        'wrld_inferred:55~region(us)',
                        '2025-01-01T10:00:00Z',
                        3600000
                    ]);
                } else if (params['@userId'] === 'usr_b') {
                    callback([
                        'wrld_inferred:55~region(us)',
                        '2025-01-01T10:20:00Z',
                        3600000
                    ]);
                }
            }
            return undefined;
        });

        const result = await gameLog.getCoInstanceHistoryBetweenFriends(
            'usr_a',
            'usr_b'
        );

        expect(result).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    location: 'wrld_logged:123~region(us)'
                }),
                expect.objectContaining({
                    location: 'wrld_inferred:55~region(us)'
                })
            ])
        );
    });

    test('deduplicates duplicate rows coming from multiple sources', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            if (sql.includes('FROM gamelog_join_leave a')) {
                callback([
                    'wrld_same:1~region(us)',
                    '2025-01-01T10:00:00Z',
                    3600000,
                    '2025-01-01T10:20:00Z',
                    3600000
                ]);
                return undefined;
            }
            if (
                sql.includes('FROM _feed_gps') ||
                sql.includes('FROM _feed_online_offline')
            ) {
                if (params['@userId'] === 'usr_a') {
                    callback([
                        'wrld_same:1~region(us)',
                        '2025-01-01T10:00:00Z',
                        3600000
                    ]);
                } else if (params['@userId'] === 'usr_b') {
                    callback([
                        'wrld_same:1~region(us)',
                        '2025-01-01T10:20:00Z',
                        3600000
                    ]);
                }
            }
            return undefined;
        });

        const result = await gameLog.getCoInstanceHistoryBetweenFriends(
            'usr_a',
            'usr_b'
        );

        const duplicates = result.filter(
            (item) =>
                item.location === 'wrld_same:1~region(us)' &&
                item.friendALeave === '2025-01-01T10:00:00Z' &&
                item.friendBLeave === '2025-01-01T10:20:00Z'
        );
        expect(duplicates).toHaveLength(1);
    });
});

describe('gameLog.getCoInstanceScoresForUsers', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('returns an empty array when no targets are provided', async () => {
        const result = await gameLog.getCoInstanceScoresForUsers(
            'usr_me',
            [],
            []
        );
        expect(result).toEqual([]);
        expect(mocks.execute).not.toHaveBeenCalled();
    });

    test('excludes the center user from targets', async () => {
        mocks.execute.mockImplementation(async () => {
            return undefined;
        });

        await gameLog.getCoInstanceScoresForUsers(
            'usr_me',
            ['usr_me', 'usr_a'],
            []
        );

        const sql = mocks.execute.mock.calls[0][1];
        expect(sql).toContain("b.user_id IN ('usr_a')");
        expect(sql).not.toContain("'usr_me'");
    });

    test('aggregates overlapping sessions per target user', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            expect(params['@centerUserId']).toBe('usr_me');
            // loc1: center [10:00, 10:30], alice [10:00, 10:45] → 30min overlap
            callback([
                'usr_a',
                'Alice',
                'wrld_1:1~region(us)',
                '2025-01-01T10:30:00Z',
                1800000,
                '2025-01-01T10:45:00Z',
                2700000
            ]);
            // loc2: center [11:00, 12:00], alice [11:30, 12:30] → 30min overlap
            callback([
                'usr_a',
                'Alice',
                'wrld_2:1~region(us)',
                '2025-01-01T12:00:00Z',
                3600000,
                '2025-01-01T12:30:00Z',
                3600000
            ]);
            // loc1: center [10:00, 10:30], bob [09:50, 10:50] → 30min overlap
            callback([
                'usr_b',
                'Bob',
                'wrld_1:1~region(us)',
                '2025-01-01T10:30:00Z',
                1800000,
                '2025-01-01T10:50:00Z',
                3600000
            ]);
            return undefined;
        });

        const result = await gameLog.getCoInstanceScoresForUsers(
            'usr_me',
            ['usr_a', 'usr_b'],
            [],
            null
        );

        const alice = result.find((row) => row.userId === 'usr_a');
        const bob = result.find((row) => row.userId === 'usr_b');
        expect(alice).toBeDefined();
        expect(alice.encounterCount).toBe(2);
        expect(alice.coexistenceMs).toBe(60 * 60 * 1000);
        expect(alice.lastEncounterAt).toBe('2025-01-01T12:00:00.000Z');
        expect(alice.firstEncounterAt).toBe('2025-01-01T10:00:00.000Z');
        expect(bob).toBeDefined();
        expect(bob.encounterCount).toBe(1);
        expect(bob.coexistenceMs).toBe(30 * 60 * 1000);
    });

    test('includes a date bound when fromDateIso is provided', async () => {
        mocks.execute.mockImplementation(async () => {
            return undefined;
        });

        const fromDate = '2026-01-01T00:00:00.000Z';
        await gameLog.getCoInstanceScoresForUsers(
            'usr_me',
            ['usr_a'],
            [],
            fromDate
        );

        const sql = mocks.execute.mock.calls[0][1];
        const params = mocks.execute.mock.calls[0][2];
        expect(sql).toContain('a.created_at >= @fromDate');
        expect(sql).toContain('b.created_at >= @fromDate');
        expect(params['@fromDate']).toBe(fromDate);
    });

    test('uses display name matching for rows without a user id', async () => {
        mocks.execute.mockImplementation(async (callback, sql) => {
            if (sql.includes('b.display_name IN')) {
                callback([
                    '',
                    'Alice',
                    'wrld_1:1~region(us)',
                    '2025-01-01T10:30:00Z',
                    1800000,
                    '2025-01-01T10:45:00Z',
                    2700000
                ]);
            }
            return undefined;
        });

        const result = await gameLog.getCoInstanceScoresForUsers(
            'usr_me',
            [],
            ['Alice'],
            null
        );

        expect(result).toHaveLength(1);
        expect(result[0].userId).toBe('');
        expect(result[0].displayName).toBe('Alice');
    });
});

describe('gameLog.getMyTopWorlds', () => {
    beforeEach(() => {
        mocks.execute.mockReset();
    });

    test('adds an exclude clause when a home world id is provided', async () => {
        mocks.execute.mockImplementation(async (callback, sql, params) => {
            callback(['wrld_1', 'World One', 3, 9000]);
            return undefined;
        });

        const result = await gameLog.getMyTopWorlds(30, 5, 'time', 'wrld_home');

        expect(result).toEqual([
            {
                worldId: 'wrld_1',
                worldName: 'World One',
                visitCount: 3,
                totalTime: 9000
            }
        ]);
        expect(mocks.execute).toHaveBeenCalledTimes(1);
        expect(mocks.execute.mock.calls[0][1]).toContain(
            'AND world_id != @excludeWorldId'
        );
        expect(mocks.execute.mock.calls[0][2]).toMatchObject({
            '@limit': 5,
            '@daysOffset': '-30 days',
            '@excludeWorldId': 'wrld_home'
        });
    });
});
