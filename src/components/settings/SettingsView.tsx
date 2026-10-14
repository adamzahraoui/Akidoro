import { useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  getNotificationPermission,
  requestNotificationPermission,
} from '../../lib/notifications';
import { playCompletionChime } from '../../lib/sound';
import type { ThemePreference } from '../../types';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { NumberField } from '../ui/NumberField';
import { Toggle } from '../ui/Toggle';

export function SettingsView() {
  const { settings, updateSettings, resetSettings, exportHistory, exportBackup, importBackup, clearHistory, sessions } = useApp();
  const [permission, setPermission] = useState(getNotificationPermission());
  const [confirmClear, setConfirmClear] = useState(false);
  const [exported, setExported] = useState(false);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onToggleNotifications = async (value: boolean) => {
    if (!value) {
      updateSettings({ notifications: false });
      return;
    }
    const result = await requestNotificationPermission();
    setPermission(result);
    if (result === 'granted') updateSettings({ notifications: true });
  };

  const onExport = () => {
    const json = exportHistory();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akidoro-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    window.setTimeout(() => setExported(false), 2500);
  };

  const onExportBackup = () => {
    const json = exportBackup();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `akidoro-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportBackup = async (file: File) => {
    setImporting(true);
    setBackupNotice(null);
    try {
      const text = await file.text();
      const result = await importBackup(text);
      setBackupNotice(result.message);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>Timer durations</CardTitle>
        <div className="grid gap-x-8 sm:grid-cols-2">
          <NumberField
            label="Focus"
            value={settings.focusMin}
            min={1}
            max={180}
            suffix="minutes"
            onChange={(v) => updateSettings({ focusMin: v })}
          />
          <NumberField
            label="Short break"
            value={settings.shortMin}
            min={1}
            max={60}
            suffix="minutes"
            onChange={(v) => updateSettings({ shortMin: v })}
          />
          <NumberField
            label="Long break"
            value={settings.longMin}
            min={1}
            max={120}
            suffix="minutes"
            onChange={(v) => updateSettings({ longMin: v })}
          />
          <NumberField
            label="Focus sessions before a long break"
            value={settings.sessionsBeforeLong}
            min={1}
            max={12}
            suffix="sessions"
            onChange={(v) => updateSettings({ sessionsBeforeLong: v })}
          />
        </div>
        <p className="mt-2 text-xs muted">
          Duration changes apply to the next session; a running countdown keeps its original length.
        </p>
      </Card>

      <Card>
        <CardTitle>Automation</CardTitle>
        <Toggle
          label="Auto-start breaks"
          description="Begin a break immediately when a focus session completes."
          checked={settings.autoStartBreaks}
          onChange={(v) => updateSettings({ autoStartBreaks: v })}
        />
        <Toggle
          label="Auto-start focus"
          description="Begin the next focus session immediately when a break completes."
          checked={settings.autoStartFocus}
          onChange={(v) => updateSettings({ autoStartFocus: v })}
        />
      </Card>

      <Card>
        <CardTitle>Appearance</CardTitle>
        <label htmlFor="theme" className="block text-sm font-medium">
          Theme
        </label>
        <select
          id="theme"
          value={settings.theme}
          onChange={(e) => updateSettings({ theme: e.target.value as ThemePreference })}
          className="focus-ring mt-1.5 w-48 rounded-lg border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </Card>

      <Card>
        <CardTitle>Alerts</CardTitle>
        <Toggle
          label="Completion sound"
          checked={settings.soundEnabled}
          onChange={(v) => updateSettings({ soundEnabled: v })}
        />
        <div className="flex items-center gap-3 py-2">
          <label htmlFor="volume" className="text-sm font-medium">
            Volume
          </label>
          <input
            id="volume"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volume}
            onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
            className="max-w-xs flex-1"
            aria-valuetext={`${Math.round(settings.volume * 100)} percent`}
          />
          <Button size="sm" onClick={() => playCompletionChime(settings.volume, 'focus')}>
            Test
          </Button>
        </div>
        <Toggle
          label="Browser notifications"
          description={
            permission === 'denied'
              ? 'Blocked in your browser settings — enable notifications there to use this.'
              : 'Permission is requested only when you turn this on.'
          }
          checked={settings.notifications}
          onChange={onToggleNotifications}
          disabled={permission === 'unsupported' || permission === 'denied'}
        />
      </Card>

      <Card>
        <CardTitle hint={`${sessions.length} stored session${sessions.length === 1 ? '' : 's'}`}>
          Data & privacy
        </CardTitle>
        <p className="text-sm muted">
          'Notes, settings, timer progress and session history are stored only in this browser profile: they are not synced across devices and may be lost if site data is cleared. Sharing a browser profile means sharing this local data.'
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={onExport} disabled={sessions.length === 0}>
            Export history as JSON
          </Button>
          <Button onClick={onExportBackup}>Export backup (JSON)</Button>
          <Button variant="ghost" onClick={() => fileRef.current?.click()} disabled={importing}>
            {importing ? 'Importing…' : 'Import backup'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void onImportBackup(file);
            }}
          />
          {backupNotice ? <span className="text-xs muted">{backupNotice}</span> : null}
          {exported ? <span className="text-xs text-accent-700 dark:text-accent-300">Exported</span> : null}
          {confirmClear ? (
            <>
              <Button
                variant="danger"
                onClick={() => {
                  clearHistory();
                  setConfirmClear(false);
                }}
              >
                Confirm clear
              </Button>
              <Button variant="ghost" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </>
          ) : (
            <Button
              variant="danger"
              onClick={() => setConfirmClear(true)}
              disabled={sessions.length === 0}
            >
              Clear history
            </Button>
          )}
          <Button variant="ghost" onClick={resetSettings}>
            Reset settings
          </Button>
        </div>
      </Card>
    </div>
  );
}
