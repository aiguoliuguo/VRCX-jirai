import { beforeEach, describe, expect, test, vi } from 'vitest';
import { createTestingPinia } from '@pinia/testing';
import { flushPromises, mount } from '@vue/test-utils';

// ─── Mocks ───────────────────────────────────────────────────────────

vi.mock('vue-i18n', () => ({
    useI18n: () => ({
        t: (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key),
        locale: require('vue').ref('en')
    }),
    createI18n: () => ({
        global: { t: (key) => key, locale: require('vue').ref('en') },
        install: vi.fn()
    })
}));

vi.mock('@/plugins/router', () => {
    const { ref } = require('vue');
    return {
        router: {
            beforeEach: vi.fn(),
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: ref({ path: '/', name: '', meta: {} }),
            isReady: vi.fn().mockResolvedValue(true)
        },
        initRouter: vi.fn()
    };
});
vi.mock('vue-router', async (importOriginal) => {
    const actual = await importOriginal();
    const { ref } = require('vue');
    return {
        ...actual,
        useRouter: vi.fn(() => ({
            push: vi.fn(),
            replace: vi.fn(),
            currentRoute: ref({ path: '/', name: '', meta: {} })
        }))
    };
});
vi.mock('@/plugins/interopApi', () => ({ initInteropApi: vi.fn() }));
vi.mock('@/services/database', () => ({
    database: {
        getCoInstanceScoresForUsers: dbMocks.getCoInstanceScoresForUsers
    }
}));
vi.mock('@/services/config', () => ({
    default: {
        init: vi.fn(),
        getString: vi.fn().mockImplementation((_k, d) => d ?? '{}'),
        setString: vi.fn(),
        getBool: vi.fn().mockImplementation((_k, d) => d ?? false),
        setBool: vi.fn(),
        getInt: vi.fn().mockImplementation((_k, d) => d ?? 0),
        setInt: vi.fn(),
        getFloat: vi.fn().mockImplementation((_k, d) => d ?? 0),
        setFloat: vi.fn(),
        getObject: vi.fn().mockReturnValue(null),
        setObject: vi.fn(),
        getArray: vi.fn().mockReturnValue([]),
        setArray: vi.fn(),
        remove: vi.fn()
    }
}));
vi.mock('@/services/jsonStorage', () => ({ default: vi.fn() }));
vi.mock('@/services/watchState', () => ({
    watchState: { isLoggedIn: false }
}));
vi.mock('@/services/request', () => ({
    request: vi.fn().mockResolvedValue({ json: {} }),
    processBulk: vi.fn(),
    buildRequestInit: vi.fn(),
    parseResponse: vi.fn(),
    shouldIgnoreError: vi.fn(),
    $throw: vi.fn(),
    failedGetRequests: new Map()
}));

const dbMocks = vi.hoisted(() => ({
    getCoInstanceScoresForUsers: vi.fn()
}));

const echartsMocks = vi.hoisted(() => ({
    init: vi.fn(),
    setOption: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    resize: vi.fn(),
    dispose: vi.fn(),
    clear: vi.fn()
}));
vi.mock('echarts', () => ({
    init: () => echartsMocks,
    graphic: { LinearGradient: class {} }
}));

import FriendAffinity from '../FriendAffinity.vue';
import {
    useFriendStore,
    useTrackedNonFriendsStore,
    useUserStore
} from '@/stores';

// ─── Helpers ─────────────────────────────────────────────────────────

const NOW = Date.now();

const MOCK_ROWS = [
    {
        userId: 'usr_a',
        displayName: 'Alice',
        coexistenceMs: 7200000,
        encounterCount: 12,
        lastEncounterAt: new Date(NOW - 86400000).toISOString(),
        firstEncounterAt: new Date(NOW - 86400000 * 60).toISOString()
    },
    {
        userId: 'usr_b',
        displayName: 'Bob',
        coexistenceMs: 3600000,
        encounterCount: 3,
        lastEncounterAt: new Date(NOW - 86400000 * 30).toISOString(),
        firstEncounterAt: new Date(NOW - 86400000 * 30).toISOString()
    },
    {
        userId: 'usr_c',
        displayName: 'Carol',
        coexistenceMs: 900000,
        encounterCount: 1,
        lastEncounterAt: null,
        firstEncounterAt: null
    }
];

async function mountComponent(overrides = {}) {
    const pinia = createTestingPinia({ stubActions: false });

    const userStore = useUserStore(pinia);
    userStore.$patch({
        currentUser: { id: 'usr_me', displayName: 'Me' }
    });
    userStore.cachedUsers.set('usr_a', { id: 'usr_a', displayName: 'Alice' });

    const friendStore = useFriendStore(pinia);
    friendStore.friends.set('usr_a', { id: 'usr_a', displayName: 'Alice' });

    const trackedStore = useTrackedNonFriendsStore(pinia);
    trackedStore.$patch({
        trackedList: [{ userId: 'usr_c', displayName: 'Carol', addedAt: '' }]
    });

    dbMocks.getCoInstanceScoresForUsers.mockResolvedValue(
        overrides.rows ?? MOCK_ROWS
    );

    const wrapper = mount(FriendAffinity, {
        global: {
            plugins: [pinia],
            stubs: {
                BackToTop: { template: '<div />' },
                VirtualCombobox: { template: '<div class="vc-stub" />' },
                ToggleGroup: { template: '<div class="tg-stub" />' },
                ToggleGroupItem: { template: '<button class="tgi-stub" />' },
                TooltipWrapper: { template: '<div class="tw-stub" />' }
            }
        }
    });
    await flushPromises();
    return { wrapper, pinia };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('FriendAffinity.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('loads affinity data with self as the center user', async () => {
        const { wrapper } = await mountComponent();
        expect(dbMocks.getCoInstanceScoresForUsers).toHaveBeenCalledWith(
            'usr_me',
            expect.arrayContaining(['usr_a', 'usr_c']),
            [],
            null
        );
        expect(wrapper.text()).toContain('Alice');
    });

    test('renders ranked rows with scores', async () => {
        const { wrapper } = await mountComponent();
        const rows = wrapper.findAll('button[type="button"]');
        const rowText = wrapper.text();
        expect(rows.length).toBeGreaterThanOrEqual(3);
        expect(rowText).toContain('Alice');
        expect(rowText).toContain('Bob');
        expect(rowText).toContain('Carol');
        expect(rowText).toContain('#1');
        expect(rowText).toContain('99.7');
    });

    test('marks first row as friend and third as non-friend', async () => {
        const { wrapper } = await mountComponent();
        const rowText = wrapper.text();
        expect(rowText).toContain('view.charts.friend_affinity.table.friend');
        expect(rowText).toContain(
            'view.charts.friend_affinity.table.non_friend'
        );
    });

    test('clicking a row switches the center user and reloads', async () => {
        const { wrapper } = await mountComponent();
        const bobRow = wrapper
            .findAll('button[type="button"]')
            .find((btn) => btn.text().includes('Bob'));
        expect(bobRow).toBeDefined();
        await bobRow.trigger('click');
        await flushPromises();

        expect(dbMocks.getCoInstanceScoresForUsers).toHaveBeenLastCalledWith(
            'usr_b',
            expect.arrayContaining(['usr_a', 'usr_c']),
            [],
            null
        );
    });

    test('shows no-data empty state when nothing is returned', async () => {
        const { wrapper } = await mountComponent({ rows: [] });
        expect(wrapper.text()).toContain('no_data');
    });
});
