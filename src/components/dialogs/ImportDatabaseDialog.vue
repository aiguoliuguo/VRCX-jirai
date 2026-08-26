<template>
    <Dialog :open="open" @update:open="handleOpenChange">
        <DialogContent>
            <DialogHeader>
                <DialogTitle>{{ t('dialog.import_database.header') }}</DialogTitle>
            </DialogHeader>
            <div class="mt-4">
                <Alert v-if="error" variant="destructive" class="mb-3">
                    <AlertCircle class="size-4" />
                    <AlertTitle>{{ t('dialog.import_database.error.title') }}</AlertTitle>
                    <AlertDescription>{{ error }}</AlertDescription>
                </Alert>

                <!-- Step 1: 选择源库 -->
                <template v-if="step === 'select'">
                    <p class="mb-3 text-sm text-muted-foreground">
                        {{ t('dialog.import_database.select.description') }}
                    </p>
                    <div class="flex items-center gap-2">
                        <Input
                            :model-value="selectedPath"
                            readonly
                            :placeholder="t('dialog.import_database.select.path_placeholder')" />
                        <Button size="sm" variant="outline" class="shrink-0" @click="pickFile">
                            {{ t('dialog.import_database.select.choose') }}
                        </Button>
                    </div>

                    <div v-if="validating" class="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                        <RefreshCcw class="size-4 animate-spin" />
                        {{ t('dialog.import_database.select.validating') }}
                    </div>
                    <div v-else-if="validation && validation.valid" class="mt-4 flex items-start gap-2 text-sm">
                        <CheckCircle2 class="mt-0.5 size-4 shrink-0 text-primary" />
                        <div>
                            <span class="font-medium">{{ t('dialog.import_database.select.valid') }}</span>
                            <div class="mt-1 text-xs text-muted-foreground">
                                {{ t('dialog.import_database.stats.rows', { count: validation.sourceRows }) }}
                                · {{ t('dialog.import_database.stats.friends', { count: validation.sourceFriends }) }} ·
                                {{ formatSize(validation.sourceSize) }}
                            </div>
                        </div>
                    </div>
                    <div v-else-if="selectedPath && !validating" class="mt-4 text-sm text-muted-foreground">
                        {{ t('dialog.import_database.select.invalid') }}
                    </div>
                </template>

                <!-- Step 2: 确认对比 -->
                <template v-else-if="step === 'confirm'">
                    <div class="grid grid-cols-2 gap-3">
                        <div class="rounded-lg border p-3">
                            <div class="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                                {{ t('dialog.import_database.confirm.current_label') }}
                            </div>
                            <div class="mt-2 space-y-1 text-sm">
                                <div class="flex justify-between gap-2">
                                    <span class="text-muted-foreground">{{
                                        t('dialog.import_database.stats.rows', { count: validation.currentRows })
                                    }}</span>
                                </div>
                                <div class="flex justify-between gap-2">
                                    <span class="text-muted-foreground">{{
                                        t('dialog.import_database.stats.friends', { count: validation.currentFriends })
                                    }}</span>
                                </div>
                                <div class="flex justify-between gap-2">
                                    <span class="text-muted-foreground">{{
                                        t('dialog.import_database.stats.size')
                                    }}</span>
                                    <span class="tabular-nums">{{ formatSize(validation.currentSize) }}</span>
                                </div>
                            </div>
                        </div>
                        <div class="rounded-lg border border-primary/40 bg-primary/[0.04] p-3">
                            <div class="text-xs font-medium uppercase tracking-wide text-primary">
                                {{ t('dialog.import_database.confirm.source_label') }}
                            </div>
                            <div class="mt-2 space-y-1 text-sm">
                                <div class="flex justify-between gap-2">
                                    <span class="text-muted-foreground">{{
                                        t('dialog.import_database.stats.rows', { count: validation.sourceRows })
                                    }}</span>
                                </div>
                                <div class="flex justify-between gap-2">
                                    <span class="text-muted-foreground">{{
                                        t('dialog.import_database.stats.friends', { count: validation.sourceFriends })
                                    }}</span>
                                </div>
                                <div class="flex justify-between gap-2">
                                    <span class="text-muted-foreground">{{
                                        t('dialog.import_database.stats.size')
                                    }}</span>
                                    <span class="tabular-nums">{{ formatSize(validation.sourceSize) }}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <Alert variant="warning" class="mt-4">
                        <TriangleAlert class="size-4" />
                        <AlertTitle>{{ t('dialog.import_database.confirm.warning.title') }}</AlertTitle>
                        <AlertDescription>
                            <p>{{ t('dialog.import_database.confirm.warning.backup') }}</p>
                            <p>{{ t('dialog.import_database.confirm.warning.restart') }}</p>
                        </AlertDescription>
                    </Alert>
                </template>

                <!-- Step 3: 完成 -->
                <template v-else-if="step === 'done'">
                    <div class="flex flex-col items-center gap-3 py-4 text-center">
                        <CheckCircle2 class="size-8 text-primary" />
                        <div class="text-sm font-medium">{{ t('dialog.import_database.done.message') }}</div>
                        <div class="text-xs text-muted-foreground">
                            {{ t('dialog.import_database.done.backup_path', { path: importResult.backupPath }) }}
                        </div>
                        <Alert v-if="importResult.error" variant="destructive" class="w-full text-left">
                            <AlertDescription>{{ importResult.error }}</AlertDescription>
                        </Alert>
                    </div>
                </template>
            </div>

            <DialogFooter>
                <template v-if="step !== 'done'">
                    <Button variant="ghost" @click="handleOpenChange(false)">{{
                        t('dialog.import_database.cancel')
                    }}</Button>
                </template>
                <template v-else>
                    <Button variant="ghost" @click="handleOpenChange(false)">{{
                        t('dialog.import_database.later')
                    }}</Button>
                </template>

                <Button
                    v-if="step === 'select'"
                    variant="default"
                    :disabled="!canContinueToConfirm"
                    @click="step = 'confirm'">
                    {{ t('dialog.import_database.next') }}
                </Button>
                <Button v-else-if="step === 'confirm'" variant="default" :disabled="importing" @click="runImport">
                    <RefreshCcw v-if="importing" class="mr-2 size-4 animate-spin" />
                    {{ t('dialog.import_database.import') }}
                </Button>
                <Button v-else-if="step === 'done' && !importResult?.error" variant="default" @click="restartApp">
                    {{ t('dialog.import_database.restart') }}
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
</template>

<script setup>
    import { computed, ref, watch } from 'vue';
    import { AlertCircle, CheckCircle2, RefreshCcw, TriangleAlert } from 'lucide-vue-next';
    import { useI18n } from 'vue-i18n';

    import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
    import { Button } from '@/components/ui/button';
    import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
    import { Input } from '@/components/ui/input';

    defineOptions({ name: 'ImportDatabaseDialog' });

    const props = defineProps({
        open: { type: Boolean, default: false },
        /** 预填的源库路径（例如启动检测到的原版数据库） */
        initialPath: { type: String, default: '' }
    });
    const emit = defineEmits(['update:open']);

    const { t } = useI18n();

    const step = ref('select');
    const selectedPath = ref('');
    const validating = ref(false);
    const validation = ref(null);
    const importing = ref(false);
    const importResult = ref(null);
    const error = ref('');

    const canContinueToConfirm = computed(() => !!validation.value?.valid);

    function formatSize(bytes) {
        const value = Number(bytes) || 0;
        if (value >= 1024 * 1024 * 1024) {
            return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
        }
        if (value >= 1024 * 1024) {
            return `${(value / (1024 * 1024)).toFixed(1)} MB`;
        }
        return `${Math.max(1, Math.round(value / 1024))} KB`;
    }

    function resetState() {
        step.value = 'select';
        validation.value = null;
        importResult.value = null;
        error.value = '';
        importing.value = false;
    }

    watch(
        () => props.open,
        (isOpen) => {
            if (!isOpen) return;
            resetState();
            if (props.initialPath && props.initialPath !== selectedPath.value) {
                selectedPath.value = props.initialPath;
                validateSelectedPath();
            }
        },
        { immediate: true }
    );
    function resolveError(code, fallbackKey) {
        const key = `dialog.import_database.error.${code || fallbackKey}`;
        const message = t(key);
        return message === key ? code || t(`dialog.import_database.error.${fallbackKey}`) : message;
    }

    async function validateSelectedPath() {
        if (!selectedPath.value) return;
        validating.value = true;
        error.value = '';
        validation.value = null;
        try {
            const result = JSON.parse(await window.SQLite.ValidateDatabase(selectedPath.value));
            if (result?.ok && result?.valid) {
                validation.value = result;
            } else {
                error.value = resolveError(result?.error, 'invalid');
            }
        } catch (e) {
            console.error('[ImportDatabase] validate failed:', e);
            error.value = t('dialog.import_database.error.invalid_sqlite');
        } finally {
            validating.value = false;
        }
    }

    async function getOriginalDbPath() {
        try {
            const info = JSON.parse(await window.SQLite.CheckOriginalDatabase(''));
            return info?.exists ? info.path : null;
        } catch (e) {
            console.error('[ImportDatabase] failed to check original database:', e);
            return null;
        }
    }

    async function pickFile() {
        const originalPath = await getOriginalDbPath();
        let path = null;
        if (window.electron?.openDatabaseDialog) {
            path = await window.electron.openDatabaseDialog(originalPath);
        } else if (typeof AppApi?.OpenFileSelectorDialog === 'function') {
            const defaultDir = originalPath
                ? originalPath.replace(/\\[^\\]+$/, '')
                : '';
            path = await AppApi.OpenFileSelectorDialog(
                defaultDir,
                'sqlite3',
                'VRCX Database (*.sqlite3;*.db)|*.sqlite3;*.db|All files (*.*)|*.*'
            );
        }
        if (!path) return;
        selectedPath.value = path;
        await validateSelectedPath();
    }

    async function runImport() {
        if (!selectedPath.value) return;
        importing.value = true;
        error.value = '';
        try {
            const result = JSON.parse(await window.SQLite.ImportDatabase(selectedPath.value));
            importResult.value = result;
            if (result?.ok) {
                step.value = 'done';
            } else {
                error.value = resolveError(result?.error, 'failed');
            }
        } catch (e) {
            console.error('[ImportDatabase] import failed:', e);
            error.value = t('dialog.import_database.error.failed');
        } finally {
            importing.value = false;
        }
    }

    function restartApp() {
        if (window.electron?.restartApp) {
            window.electron.restartApp();
        } else if (typeof AppApi?.RestartApplication === 'function') {
            AppApi.RestartApplication(false);
        }
    }

    function handleOpenChange(open) {
        if (!open && importing.value) return;
        emit('update:open', open);
    }
</script>
