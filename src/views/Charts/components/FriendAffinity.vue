<template>
    <div id="chart" class="x-container">
        <div ref="affinityPageRef" class="pt-4">
            <BackToTop :target="affinityPageRef" :right="30" :bottom="30" :teleport="false" />
            <div class="options-container mt-0 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-2">
                    <span class="shrink-0">{{ t('view.charts.friend_affinity.header') }}</span>
                    <HoverCard>
                        <HoverCardTrigger as-child>
                            <Info class="ml-1 text-xs opacity-70" />
                        </HoverCardTrigger>
                        <HoverCardContent side="bottom" align="start" class="w-80">
                            <div class="text-xs">{{ t('view.charts.friend_affinity.tips.description') }}</div>
                        </HoverCardContent>
                    </HoverCard>
                </div>

                <div class="flex flex-wrap items-center gap-2">
                    <VirtualCombobox
                        class="min-w-56"
                        :model-value="centerUserId || ''"
                        @update:modelValue="handleCenterChange"
                        :groups="centerGroups"
                        :placeholder="t('view.charts.friend_affinity.select_center')"
                        :search-placeholder="t('view.charts.friend_affinity.search_user')"
                        :close-on-select="true"
                        :deselect-on-reselect="true">
                        <template #item="{ item, selected }">
                            <div class="flex w-full items-center p-1.5 text-[13px]">
                                <template v-if="item.user">
                                    <div
                                        class="relative inline-block flex-none size-9 mr-2.5"
                                        :class="userStatusClass(item.user)">
                                        <img
                                            class="size-full rounded-full object-cover"
                                            :src="userImage(item.user)"
                                            loading="lazy" />
                                    </div>
                                    <div class="flex-1 overflow-hidden">
                                        <span
                                            class="block truncate font-medium leading-[18px]"
                                            :style="{ color: item.user.$userColour }"
                                            >{{ item.label }}</span
                                        >
                                    </div>
                                </template>
                                <template v-else>
                                    <span>{{ item.label }}</span>
                                </template>
                                <CheckIcon :class="['ml-auto size-4', selected ? 'opacity-100' : 'opacity-0']" />
                            </div>
                        </template>
                    </VirtualCombobox>

                    <ToggleGroup
                        variant="outline"
                        type="single"
                        :model-value="timeRangeModelValue"
                        @update:modelValue="handleRangeChange">
                        <ToggleGroupItem value="0">
                            {{ t('view.charts.friend_affinity.period.all') }}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="30">
                            {{ t('view.charts.friend_affinity.period.days_30') }}
                        </ToggleGroupItem>
                        <ToggleGroupItem value="90">
                            {{ t('view.charts.friend_affinity.period.days_90') }}
                        </ToggleGroupItem>
                    </ToggleGroup>

                    <label class="flex cursor-pointer select-none items-center gap-2 text-xs text-muted-foreground">
                        {{ t('view.charts.friend_affinity.show_friends_only') }}
                        <Switch :checked="showFriendsOnly" @update:checked="(v) => (showFriendsOnly = v)" />
                    </label>

                    <TooltipWrapper :content="t('view.charts.friend_affinity.refresh')" side="top">
                        <Button
                            class="rounded-full"
                            size="icon"
                            variant="ghost"
                            :disabled="isLoading"
                            @click="loadData">
                            <RefreshCcw :class="isLoading ? 'animate-spin' : ''" class="size-4" />
                        </Button>
                    </TooltipWrapper>
                </div>
            </div>

            <div v-if="isLoading" class="mt-[100px] flex items-center justify-center">
                <RefreshCcw class="size-6 animate-spin text-muted-foreground" />
            </div>

            <div v-else-if="displayRows.length === 0" class="mt-[100px] flex items-center justify-center">
                <DataTableEmpty type="nodata" />
            </div>

            <template v-else>
                <div class="mx-auto mt-3 flex max-w-[1100px] flex-wrap items-center gap-3">
                    <div class="flex items-center gap-2 rounded-lg border px-3 py-2">
                        <div
                            v-if="centerUserItem?.user"
                            class="relative inline-block flex-none size-6"
                            :class="userStatusClass(centerUserItem.user)">
                            <img
                                class="size-full rounded-full object-cover"
                                :src="userImage(centerUserItem.user)"
                                loading="lazy" />
                        </div>
                        <div
                            v-else
                            class="flex size-6 flex-none items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">
                            <UserRound class="size-3.5" />
                        </div>
                        <div class="text-xs">
                            <span class="font-medium">{{ t('view.charts.friend_affinity.relative_to') }}</span>
                            <span class="ml-1">{{ centerName }}</span>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 rounded-lg border px-3 py-2">
                        <Users class="size-3.5 text-muted-foreground" />
                        <span class="text-sm font-medium">{{ displayRows.length }}</span>
                        <span class="text-xs text-muted-foreground">{{
                            t('view.charts.friend_affinity.stats.people')
                        }}</span>
                    </div>
                    <div class="flex items-center gap-2 rounded-lg border px-3 py-2">
                        <Clock class="size-3.5 text-muted-foreground" />
                        <span class="text-xs text-muted-foreground">{{
                            t('view.charts.friend_affinity.stats.total_time')
                        }}</span>
                        <span class="text-sm font-medium tabular-nums">{{ timeToText(totalCoexistenceTime) }}</span>
                    </div>
                    <span class="ml-auto hidden text-xs text-muted-foreground/60 sm:block">{{
                        t('view.charts.friend_affinity.table.click_hint')
                    }}</span>
                </div>

                <div class="mx-auto mt-4 max-w-[1100px]">
                    <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                        {{ t('view.charts.friend_affinity.chart.title', { n: chartRows.length }) }}
                    </div>
                    <div ref="chartRef" class="w-full" :style="{ height: chartHeightPx + 'px' }"></div>
                </div>

                <div class="mx-auto mt-6 max-w-[1100px]">
                    <div class="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                        {{ t('view.charts.friend_affinity.table.title') }}
                    </div>
                    <div class="space-y-0.5">
                        <button
                            v-for="(item, index) in displayRows"
                            :key="item.userId || item.displayName"
                            type="button"
                            class="group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors cursor-pointer"
                            :class="
                                isCurrentCenterItem(item)
                                    ? 'bg-primary/[0.04] ring-1 ring-inset ring-primary/30'
                                    : 'hover:bg-accent'
                            "
                            @click="switchCenter(item.userId)">
                            <span
                                class="w-7 shrink-0 text-right font-mono text-sm font-bold"
                                :class="index === 0 ? 'text-primary' : 'text-muted-foreground'">
                                #{{ index + 1 }}
                            </span>

                            <div
                                v-if="item.user"
                                class="relative inline-block flex-none size-10"
                                :class="userStatusClass(item.user)">
                                <img
                                    class="size-full rounded-full object-cover"
                                    :src="userImage(item.user)"
                                    loading="lazy" />
                            </div>
                            <div
                                v-else
                                class="flex size-10 flex-none items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
                                <UserRound class="size-4" />
                            </div>

                            <div class="min-w-0 flex-1">
                                <div class="flex items-center gap-1.5">
                                    <span
                                        class="block max-w-[360px] truncate text-sm font-medium"
                                        :style="{ color: item.user?.$userColour }">
                                        {{ item.displayName }}
                                    </span>
                                    <span
                                        class="shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium"
                                        :class="
                                            item.isFriend
                                                ? 'bg-primary/10 text-primary'
                                                : 'bg-muted text-muted-foreground'
                                        ">
                                        {{
                                            item.isFriend
                                                ? t('view.charts.friend_affinity.table.friend')
                                                : t('view.charts.friend_affinity.table.non_friend')
                                        }}
                                    </span>
                                </div>
                                <div class="mt-0.5 text-xs text-muted-foreground">
                                    <span class="tabular-nums">{{ timeToText(item.coexistenceMs) }}</span>
                                    <span class="text-muted-foreground/50">
                                        ·
                                        {{
                                            t('view.charts.friend_affinity.table.encounters', {
                                                count: item.encounterCount
                                            })
                                        }}
                                        · {{ lastSeenLabel(item) }}
                                    </span>
                                </div>
                            </div>

                            <div class="flex shrink-0 items-center gap-2">
                                <div
                                    class="h-2 w-20 overflow-hidden rounded-full"
                                    :class="isDarkMode ? 'bg-white/[0.08]' : 'bg-black/[0.06]'">
                                    <div
                                        class="h-full rounded-full transition-all duration-500"
                                        :class="
                                            index === 0
                                                ? 'bg-primary'
                                                : isDarkMode
                                                  ? 'bg-white/[0.35]'
                                                  : 'bg-black/[0.2]'
                                        "
                                        :style="{ width: getScoreWidth(item.score) }"></div>
                                </div>
                                <span
                                    class="w-10 text-right font-mono text-sm font-semibold tabular-nums"
                                    :class="index === 0 ? 'text-primary' : 'text-muted-foreground'">
                                    {{ item.score.toFixed(1) }}
                                </span>
                            </div>
                        </button>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup>
    defineOptions({ name: 'ChartsFriendAffinity' });

    import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
    import { Check as CheckIcon, Clock, Info, RefreshCcw, UserRound, Users } from 'lucide-vue-next';
    import { storeToRefs } from 'pinia';
    import { useI18n } from 'vue-i18n';
    import * as echarts from 'echarts';

    import BackToTop from '@/components/BackToTop.vue';
    import { Button } from '@/components/ui/button';
    import { DataTableEmpty } from '@/components/ui/data-table';
    import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
    import { Switch } from '@/components/ui/switch';
    import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
    import TooltipWrapper from '@/components/ui/tooltip/TooltipWrapper.vue';
    import { VirtualCombobox } from '@/components/ui/virtual-combobox';

    import { database } from '@/services/database';
    import { timeToText } from '@/shared/utils';
    import { useAppearanceSettingsStore, useFriendStore, useTrackedNonFriendsStore, useUserStore } from '@/stores';
    import { useUserDisplay } from '@/composables/useUserDisplay';
    import { computeAffinityScores, daysSinceLastEncounter } from './affinityUtils';

    const { t } = useI18n();

    const appearanceStore = useAppearanceSettingsStore();
    const { isDarkMode } = storeToRefs(appearanceStore);
    const friendStore = useFriendStore();
    const userStore = useUserStore();
    const trackedStore = useTrackedNonFriendsStore();
    const { friends } = storeToRefs(friendStore);
    const { trackedList } = storeToRefs(trackedStore);
    const { currentUser } = storeToRefs(userStore);
    const cachedUsers = userStore.cachedUsers;

    const { userImage, userStatusClass } = useUserDisplay();

    const affinityPageRef = ref(null);
    const chartRef = ref(null);
    const isLoading = ref(false);
    const rawRows = ref([]);
    /** null = 以自己为参照 */
    const centerUserId = ref(null);
    const showFriendsOnly = ref(false);
    /** null = 全部时间, 30 / 90 = 最近 N 天 */
    const timeRangeDays = ref(null);

    const TOP_CHART_COUNT = 20;
    const CHART_ROW_HEIGHT = 34;
    const CHART_HEIGHT_PADDING = 80;
    const COLOR_PALETTE = [
        '#5470c6',
        '#91cc75',
        '#fac858',
        '#ee6666',
        '#73c0de',
        '#3ba272',
        '#fc8452',
        '#9a60b4',
        '#ea7ccc'
    ];

    // ─── 中心用户选择器 ──────────────────────────────────────────────────────
    const centerGroups = computed(() => [
        {
            key: 'center',
            label: t('view.charts.friend_affinity.center_group'),
            items: [
                {
                    value: '',
                    label: t('view.charts.friend_affinity.me'),
                    search: t('view.charts.friend_affinity.me'),
                    user: currentUser.value || null
                },
                ...buildUserItems()
            ]
        }
    ]);

    function buildUserItems() {
        const items = [];
        const seenIds = new Set();
        const selfId = currentUser.value?.id;
        for (const [friendId, friend] of friends.value.entries()) {
            if (friendId === selfId) continue;
            const cached = cachedUsers.get(friendId);
            const displayName = friend.displayName || cached?.displayName || friendId;
            items.push({ value: friendId, label: displayName, search: displayName, user: cached || null });
            seenIds.add(friendId);
        }
        for (const entry of trackedList.value) {
            if (entry.userId === selfId || seenIds.has(entry.userId)) continue;
            const cached = cachedUsers.get(entry.userId);
            const displayName = entry.displayName || cached?.displayName || entry.userId;
            items.push({ value: entry.userId, label: displayName, search: displayName, user: cached || null });
            seenIds.add(entry.userId);
        }
        items.sort((a, b) => a.label.localeCompare(b.label));
        return items;
    }

    const centerUserItem = computed(() => {
        if (centerUserId.value) {
            const item = buildUserItems().find((i) => i.value === centerUserId.value);
            if (item) return item;
        }
        return { user: currentUser.value || null, label: t('view.charts.friend_affinity.me') };
    });

    const centerName = computed(() => centerUserItem.value.label);

    // ─── 数据加载 ─────────────────────────────────────────────────────────────
    function buildTargets(centerId) {
        const ids = [];
        const names = [];
        for (const id of friends.value.keys()) {
            if (id && id !== centerId && !ids.includes(id)) {
                ids.push(id);
            }
        }
        for (const entry of trackedList.value) {
            if (!entry.userId) {
                if (entry.displayName && !names.includes(entry.displayName)) {
                    names.push(entry.displayName);
                }
                continue;
            }
            if (entry.userId !== centerId && !ids.includes(entry.userId)) {
                ids.push(entry.userId);
            }
        }
        return { ids, names };
    }

    async function loadData() {
        const selfId = currentUser.value?.id;
        if (!selfId) return;
        const centerId = centerUserId.value || selfId;
        isLoading.value = true;
        try {
            const { ids, names } = buildTargets(centerId);
            const fromDateIso = timeRangeDays.value
                ? new Date(Date.now() - timeRangeDays.value * 86400000).toISOString()
                : null;
            rawRows.value = await database.getCoInstanceScoresForUsers(centerId, ids, names, fromDateIso);
        } catch (error) {
            console.error('[FriendAffinity] Failed to load affinity data:', error);
            rawRows.value = [];
        } finally {
            isLoading.value = false;
        }
    }

    function handleCenterChange(value) {
        centerUserId.value = value || null;
        loadData();
    }

    function handleRangeChange(value) {
        if (!value) return;
        timeRangeDays.value = value === '0' ? null : parseInt(value, 10);
        loadData();
    }

    function switchCenter(userId) {
        const selfId = currentUser.value?.id;
        if (!userId || userId === (centerUserId.value || selfId)) return;
        centerUserId.value = userId;
        loadData();
    }

    function isCurrentCenterItem(item) {
        const selfId = currentUser.value?.id;
        return !!item.userId && item.userId === (centerUserId.value || selfId);
    }

    // ─── 派生数据 ─────────────────────────────────────────────────────────────
    const scoredRows = computed(() => {
        const enriched = rawRows.value.map((row) => {
            const userId = row.userId;
            const friend = userId ? friends.value.get(userId) : null;
            const tracked = userId ? trackedList.value.find((entry) => entry.userId === userId) : null;
            const cached = userId ? cachedUsers.get(userId) : null;
            return {
                ...row,
                displayName:
                    friend?.displayName || tracked?.displayName || cached?.displayName || row.displayName || userId,
                user: cached || null,
                isFriend: Boolean(friend)
            };
        });
        return computeAffinityScores(enriched);
    });

    const displayRows = computed(() => {
        let rows = scoredRows.value;
        if (showFriendsOnly.value) {
            rows = rows.filter((row) => row.isFriend);
        }
        return rows.sort(
            (a, b) => b.score - a.score || b.coexistenceMs - a.coexistenceMs || b.encounterCount - a.encounterCount
        );
    });

    const chartRows = computed(() => displayRows.value.slice(0, TOP_CHART_COUNT));

    const totalCoexistenceTime = computed(() => {
        return displayRows.value.reduce((sum, row) => sum + (row.coexistenceMs || 0), 0);
    });

    function getScoreWidth(score) {
        return `${Math.max(4, Math.min(100, score))}%`;
    }

    function lastSeenLabel(item) {
        const days = daysSinceLastEncounter(item);
        if (days === null) return t('view.charts.friend_affinity.table.never');
        if (days === 0) return t('view.charts.friend_affinity.table.today');
        return t('view.charts.friend_affinity.table.days_ago', { days });
    }

    // ─── ECharts 条形图 ──────────────────────────────────────────────────────
    const chartHeightPx = computed(() =>
        chartRows.value.length ? chartRows.value.length * CHART_ROW_HEIGHT + CHART_HEIGHT_PADDING : 0
    );

    let echartsInstance = null;
    let resizeObserver = null;

    const timeRangeModelValue = computed(() => String(timeRangeDays.value ?? 0));

    function disposeChart() {
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (echartsInstance) {
            echartsInstance.dispose();
            echartsInstance = null;
        }
    }

    function buildChartOption() {
        const items = chartRows.value;
        const names = items.map((item) => item.displayName);
        return {
            grid: { left: 10, right: 50, top: 6, bottom: 6, containLabel: true },
            tooltip: {
                trigger: 'item',
                formatter: (params) => {
                    const item = items[params.dataIndex];
                    if (!item) return '';
                    return `${item.displayName}<br/>${t('view.charts.friend_affinity.chart.score_label')}: <b>${item.score.toFixed(1)}</b>`;
                }
            },
            xAxis: {
                type: 'value',
                max: 100,
                splitLine: { lineStyle: { type: 'dashed', opacity: 0.3 } }
            },
            yAxis: {
                type: 'category',
                data: names,
                axisLabel: {
                    width: 180,
                    overflow: 'truncate',
                    color: isDarkMode.value ? '#cbd5e1' : '#475569',
                    fontSize: 12
                },
                axisTick: { show: false },
                axisLine: { show: false }
            },
            series: [
                {
                    type: 'bar',
                    data: items.map((item, index) => ({
                        value: item.score,
                        userId: item.userId,
                        itemStyle: {
                            color: COLOR_PALETTE[index % COLOR_PALETTE.length],
                            borderRadius: [0, 3, 3, 0],
                            opacity: index === 0 ? 1 : 0.75
                        }
                    })),
                    barWidth: 18,
                    label: {
                        show: true,
                        position: 'right',
                        formatter: (params) => params.value.toFixed(1),
                        color: isDarkMode.value ? '#94a3b8' : '#64748b',
                        fontSize: 11
                    }
                }
            ]
        };
    }

    function initChart() {
        const chartDom = chartRef.value;
        if (!chartDom || chartRows.value.length === 0) return;
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (echartsInstance) {
            echartsInstance.dispose();
            echartsInstance = null;
        }
        echartsInstance = echarts.init(chartDom, `${isDarkMode.value ? 'dark' : null}`);
        echartsInstance.setOption(buildChartOption(), { notMerge: true });
        echartsInstance.on('click', (params) => {
            const userId = params.data?.userId;
            if (userId) {
                switchCenter(userId);
            }
        });
        resizeObserver = new ResizeObserver(() => {
            if (echartsInstance) {
                try {
                    echartsInstance.resize();
                } catch (error) {
                    console.warn('Error resizing affinity chart:', error);
                }
            }
        });
        resizeObserver.observe(chartDom);
    }

    watch(
        () => [chartRows.value, isDarkMode.value, showFriendsOnly.value],
        () => {
            nextTick(() => {
                initChart();
            });
        }
    );

    onMounted(async () => {
        await nextTick();
        await loadData();
        nextTick(() => {
            initChart();
        });
    });

    onBeforeUnmount(() => {
        disposeChart();
    });
</script>
