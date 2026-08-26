<template>
    <TooltipProvider>
        <MacOSTitleBar></MacOSTitleBar>

        <div
            id="x-app"
            class="flex w-screen h-screen overflow-hidden cursor-default [&>.x-container]:pt-[15px]"
            :class="{ 'pt-7': isMacOS }">
            <RouterView></RouterView>
            <Toaster position="top-center" :theme="theme"></Toaster>

            <AlertDialogModal></AlertDialogModal>
            <PromptDialogModal></PromptDialogModal>
            <OtpDialogModal></OtpDialogModal>
            <DatabaseUpgradeDialog></DatabaseUpgradeDialog>

            <VRCXUpdateDialog></VRCXUpdateDialog>
            <ImportDatabaseDialog v-model:open="importDbOpen" :initial-path="importDbInitialPath" />
        </div>
        <div id="x-dialog-portal" class="x-dialog-portal"></div>
    </TooltipProvider>
</template>

<script setup>
    import { computed, onBeforeMount, onMounted, ref } from 'vue';

    import { addGameLogEvent, getGameLogTable } from './coordinators/gameLogCoordinator';
    import {
        runCheckVRChatDebugLoggingFlow,
        runUpdateIsGameRunningFlow,
        runUpdateIsHmdAfkFlow
    } from './coordinators/gameCoordinator';
    import { Toaster } from './components/ui/sonner';
    import { TooltipProvider } from './components/ui/tooltip';
    import { createGlobalStores } from './stores';
    import { initNoty } from './plugins/noty';
    import { useI18n } from 'vue-i18n';

    import AlertDialogModal from './components/ui/alert-dialog/AlertDialogModal.vue';
    import DatabaseUpgradeDialog from './components/dialogs/DatabaseUpgradeDialog.vue';
    import ImportDatabaseDialog from './components/dialogs/ImportDatabaseDialog.vue';
    import MacOSTitleBar from './components/MacOSTitleBar.vue';
    import OtpDialogModal from './components/ui/dialog/OtpDialogModal.vue';
    import PromptDialogModal from './components/ui/dialog/PromptDialogModal.vue';
    import VRCXUpdateDialog from './components/dialogs/VRCXUpdateDialog.vue';

    import configRepository from './services/config';

    import '@/styles/globals.css';

    console.log(`isLinux: ${LINUX}`);

    const { t } = useI18n();

    const isMacOS = computed(() => navigator.platform.includes('Mac'));

    const theme = computed(() => {
        return store.appearanceSettings.isDarkMode ? 'dark' : 'light';
    });

    initNoty();

    const store = createGlobalStores();

    if (typeof window !== 'undefined') {
        window.$pinia = store;
        // Bridge: attach coordinator functions to store for C# IPC callbacks
        store.game.updateIsGameRunning = runUpdateIsGameRunningFlow;
        store.game.updateIsHmdAfk = runUpdateIsHmdAfkFlow;
        store.gameLog.addGameLogEvent = addGameLogEvent;
    }

    onBeforeMount(() => {
        store.updateLoop.updateLoop();
    });

    onMounted(async () => {
        if (await store.vrcx.waitForDatabaseInit()) {
            getGameLogTable();
            await store.auth.migrateStoredUsers();
            store.auth.autoLoginAfterMounted();
            store.vrcx.checkAutoBackupRestoreVrcRegistry();
        }

        runCheckVRChatDebugLoggingFlow();
        checkPromptImportOriginalDatabase();
    });

    const ORIGINAL_DB_PROMPT_KEY = 'VRCX_ImportDbPrompted';

    const importDbOpen = ref(false);
    const importDbInitialPath = ref('');

    async function checkPromptImportOriginalDatabase() {
        if (LINUX) return;
        try {
            if (configRepository.getBool(ORIGINAL_DB_PROMPT_KEY)) return;

            const info = JSON.parse(await window.SQLite.CheckOriginalDatabase());
            if (!info?.exists || !info?.valid) return;
            if (Number(info.sourceRows) <= 0) return;
            // Only suggest importing into an effectively empty database.
            if (Number(info.currentRows) > 0) return;

            configRepository.setBool(ORIGINAL_DB_PROMPT_KEY, true);

            const { ok } = await store.modal.confirm({
                title: t('dialog.import_db_prompt.title'),
                description: t('dialog.import_db_prompt.description', {
                    rows: info.sourceRows,
                    friends: info.sourceFriends ?? 0
                }),
                confirmText: t('dialog.import_db_prompt.confirm'),
                cancelText: t('dialog.import_db_prompt.cancel')
            });
            if (ok && info.path) {
                importDbInitialPath.value = info.path;
                importDbOpen.value = true;
            }
        } catch (error) {
            console.error('Failed to check original database:', error);
        }
    }
</script>
