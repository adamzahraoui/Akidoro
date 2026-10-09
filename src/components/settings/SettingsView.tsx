import { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { api } from '../../lib/api';
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

function AccountSection() {
  const { user, login, logout, googleLoginConfigured, sync } = useApp();
  const [optIn, setOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api
      .getEmailPreferences()
      .then((prefs) => setOptIn(prefs.optIn))
      .catch(() => undefined);
  }, [user]);

  const toggleEmail = async (value: boolean) => {
    setSaving(true);
    setNotice(null);
    try {
      const prefs = await api.putEmailPreferences(value);
      setOptIn(prefs.optIn);
    } catch {
      setNotice('Could not update email preferences.');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <Card>
        <CardTitle hint="Optional">Account & cloud sync</CardTitle>
        <p className="text-sm muted">
          Sign in with Google to sync your timer history and settings across devices. Your progress
          is stored in your own Akidoro account (Supabase) and is visible only to you.
        </p>
        <div className="mt-4">
          {googleLoginConfigured ? (
            <Button variant="primary" onClick={login}>
              Sign in with Google
            </Button>
          ) : (
            <p className="text-xs muted">Sign-in is not configured. Set the Supabase environment variables to enable it.</p>
          )}
        </div>
      </Card>
    );
  }

  const phaseText: Record<string, string> = {
    syncing: 'syncing…',
    synced: 'up to date',
    offline: 'offline — changes will sync when you reconnect',
    error: 'sync issue',
    disabled: 'disabled',
  };
  const lastSynced = sync.lastSyncedAt
    ? new Date(sync.lastSyncedAt).toLocaleTimeString()
    : null;

  return (
    <Card>
      <CardTitle hint="Signed in">Account & cloud sync</CardTitle>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {user.picture ? (
            <img
              src={user.picture}
              alt=""
              className="h-9 w-9 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent-600 text-sm font-semibold text-white">
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </span>
          )}
          <div>
            <p className="text-sm font-medium">{user.name ?? 'Signed in'}</p>
            <p className="text-xs muted">{user.email}</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
      <p className="mt-3 text-xs muted">
        Sync status: {phaseText[sync.phase] ?? sync.phase}
        {lastSynced ? ` · last synced ${lastSynced}` : ''}
        {sync.error ? ` · ${sync.error}` : ''}
      </p>
      <div className="mt-2">
        <Toggle
          label="Email me product updates"
          description="Occasional news about Akidoro. Unsubscribe any time — no account needed."
          checked={optIn}
          onChange={toggleEmail}
          disabled={saving}
        />
        {notice ? <p className="text-xs text-red-600 dark:text-red-400">{notice}</p> : null}
      </div>
    </Card>
  );
}

export function SettingsView() {
  const { settings, updateSettings, resetSettings, exportHistory, clearHistory, sessions, user } = useApp();
  const [permission, setPermission] = useState(getNotificationPermission());
  const [confirmClear, setConfirmClear] = useState(false);
  const [exported, setExported] = useState(false);

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

      <AccountSection />

      <Card>
        <CardTitle hint={`${sessions.length} stored session${sessions.length === 1 ? '' : 's'}`}>
          Data & privacy
        </CardTitle>
        <p className="text-sm muted">
          {user
            ? 'Your settings and session history are saved to your Akidoro account and synced across your devices. The timer itself always runs locally, so it keeps working offline. Music plays from pasted links through the official provider embeds, so no music account is connected.'
            : 'Guest data (settings, timer state and session history) is stored only in this browser via local storage. It is not synced across devices and never leaves your machine. Music plays from pasted links through the official provider embeds, so no music account is connected.'}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button onClick={onExport} disabled={sessions.length === 0}>
            Export history as JSON
          </Button>
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
