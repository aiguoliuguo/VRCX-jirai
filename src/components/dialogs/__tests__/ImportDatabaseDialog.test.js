import { beforeEach, describe, expect, test, vi } from 'vitest';
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

const dbMocks = vi.hoisted(() => ({
    ValidateDatabase: vi.fn(),
    ImportDatabase: vi.fn()
}));

const electronMocks = vi.hoisted(() => ({
    openDatabaseDialog: vi.fn(),
    restartApp: vi.fn()
}));

vi.mock('@/components/ui/dialog', () => ({
    Dialog: { template: '<div class="dlg-stub"><slot /></div>' },
    DialogContent: { template: '<div class="dlg-content-stub"><slot /></div>' },
    DialogFooter: { template: '<div class="dlg-footer-stub"><slot /></div>' },
    DialogHeader: { template: '<div class="dlg-header-stub"><slot /></div>' },
    DialogTitle: { template: '<div class="dlg-title-stub"><slot /></div>' }
}));
vi.mock('@/components/ui/alert', () => ({
    Alert: { template: '<div class="alert-stub"><slot /></div>' },
    AlertDescription: {
        template: '<div class="alert-desc-stub"><slot /></div>'
    },
    AlertTitle: { template: '<div class="alert-title-stub"><slot /></div>' }
}));
vi.mock('@/components/ui/button', () => ({
    Button: {
        template:
            '<button class="btn-stub" @click="$emit(\'click\')"><slot /></button>'
    }
}));
vi.mock('@/components/ui/input', () => ({
    Input: { template: '<input class="input-stub" />' }
}));

import ImportDatabaseDialog from '../ImportDatabaseDialog.vue';

// ─── Helpers ─────────────────────────────────────────────────────────

const VALID_RESULT = {
    ok: true,
    valid: true,
    sourceRows: 114934,
    sourceFriends: 172,
    sourceSize: 155131904,
    currentRows: 0,
    currentSize: 3432448,
    currentFriends: 0
};

function mountComponent(overrides = {}) {
    window.SQLite = {
        ValidateDatabase: dbMocks.ValidateDatabase,
        ImportDatabase: dbMocks.ImportDatabase
    };
    window.electron = {
        openDatabaseDialog: electronMocks.openDatabaseDialog,
        restartApp: electronMocks.restartApp
    };
    if (!overrides.validation) {
        dbMocks.ValidateDatabase.mockResolvedValue(
            JSON.stringify(VALID_RESULT)
        );
    } else {
        dbMocks.ValidateDatabase.mockResolvedValue(
            JSON.stringify(overrides.validation)
        );
    }
    return mount(ImportDatabaseDialog, {
        props: {
            open: true,
            initialPath: 'C:\\Users\\me\\AppData\\Roaming\\VRCX\\VRCX.sqlite3',
            ...overrides
        }
    });
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('ImportDatabaseDialog.vue', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test('validates the prefilled initial path when opened', async () => {
        const wrapper = mountComponent();
        await flushPromises();
        expect(dbMocks.ValidateDatabase).toHaveBeenCalledWith(
            'C:\\Users\\me\\AppData\\Roaming\\VRCX\\VRCX.sqlite3'
        );
        expect(wrapper.text()).toContain('dialog.import_database.select.valid');
    });

    test('shows source stats after a successful validation', async () => {
        const wrapper = mountComponent();
        await flushPromises();
        const text = wrapper.text();
        expect(text).toContain('dialog.import_database.stats.rows');
        expect(text).toContain('"count":114934');
        expect(text).toContain('dialog.import_database.stats.friends');
    });

    test('shows an error when validation fails', async () => {
        const wrapper = mountComponent({
            validation: { ok: false, valid: false, error: 'not_vrcx_db' }
        });
        await flushPromises();
        // When the translation key is unavailable, the raw error code is shown.
        expect(wrapper.text()).toContain('not_vrcx_db');
    });

    test('does not validate when closed', async () => {
        const wrapper = mountComponent({ open: false });
        await flushPromises();
        expect(dbMocks.ValidateDatabase).not.toHaveBeenCalled();
    });

    test('can navigate to the confirm step and start the import', async () => {
        dbMocks.ImportDatabase.mockResolvedValue(
            JSON.stringify({
                ok: true,
                backupPath: 'C:\\backup\\VRCX-backup.20260825.sqlite3'
            })
        );
        const wrapper = mountComponent();
        await flushPromises();

        const buttons = wrapper.findAll('button');
        const nextButton = buttons.find((btn) =>
            btn.text().includes('dialog.import_database.next')
        );
        await nextButton.trigger('click');
        expect(wrapper.text()).toContain(
            'dialog.import_database.confirm.current_label'
        );
        expect(wrapper.text()).toContain(
            'dialog.import_database.confirm.source_label'
        );

        const importButton = wrapper
            .findAll('button')
            .find((btn) =>
                btn.text().includes('dialog.import_database.import')
            );
        await importButton.trigger('click');
        await flushPromises();

        expect(dbMocks.ImportDatabase).toHaveBeenCalledWith(
            'C:\\Users\\me\\AppData\\Roaming\\VRCX\\VRCX.sqlite3'
        );
        expect(wrapper.text()).toContain('dialog.import_database.done.message');
    });

    test('shows import error message when import fails', async () => {
        const wrapper = mountComponent();
        await flushPromises();
        const nextButton = wrapper
            .findAll('button')
            .find((btn) => btn.text().includes('dialog.import_database.next'));
        await nextButton.trigger('click');

        dbMocks.ImportDatabase.mockResolvedValue(
            JSON.stringify({ ok: false, error: 'same_path' })
        );
        const importButton = wrapper
            .findAll('button')
            .find((btn) =>
                btn.text().includes('dialog.import_database.import')
            );
        await importButton.trigger('click');
        await flushPromises();

        expect(wrapper.text()).toContain('same_path');
        expect(wrapper.text()).toContain('dialog.import_database.error.title');
    });
});
