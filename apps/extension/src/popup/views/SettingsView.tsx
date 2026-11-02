/**
 * @file apps/extension/src/popup/views/SettingsView.tsx
 * @description Arca by Pixra — Language Switcher, Auto-Lock Timeout, Opt-In Cloud Sync Toggle,
 * New Device Approval Prompt (`NEW_DEVICE_ATTEMPT`), 24-Word Recovery Bypass, and Active Device Revocation UI.
 */

import React, { useEffect, useState } from 'react';
import {
  Button,
  Input,
  Label,
  Switch,
  TabsRoot,
  TabsList,
  TabsTrigger,
  TabsContent,
  useI18n,
} from '@vaultguard/ui';
import { validateSyncServerUrl } from '@vaultguard/crypto';
import { usePopupStore } from '../store.js';

export function SettingsView() {
  const { locale, setLocale, t } = useI18n();
  const autoLockMinutes = usePopupStore(s => s.autoLockMinutes);
  const syncEnabled = usePopupStore(s => s.syncEnabled);
  const syncServerUrl = usePopupStore(s => s.syncServerUrl);
  const currentDeviceId = usePopupStore(s => s.deviceId);
  const trustedDevices = usePopupStore(s => s.trustedDevices);
  const pendingDeviceAttempts = usePopupStore(s => s.pendingDeviceAttempts);
  const updateSyncSettings = usePopupStore(s => s.updateSyncSettings);
  const loadDevices = usePopupStore(s => s.loadDevices);
  const requestDeviceAuthorization = usePopupStore(s => s.requestDeviceAuthorization);
  const approveOrDenyDeviceAttempt = usePopupStore(s => s.approveOrDenyDeviceAttempt);
  const revokeDevice = usePopupStore(s => s.revokeDevice);
  const lock = usePopupStore(s => s.lock);

  const [serverUrlInput, setServerUrlInput] = useState(syncServerUrl);
  const [syncToggle, setSyncToggle] = useState(syncEnabled);
  const [urlError, setUrlError] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [recoveryBypassPhrase, setRecoveryBypassPhrase] = useState('');
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  useEffect(() => {
    void loadDevices();
  }, [loadDevices]);

  const handleLanguageChange = (next: 'en' | 'hi') => {
    void setLocale(next);
  };

  const handleSaveSync = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const normalized = validateSyncServerUrl(serverUrlInput);
      setUrlError(false);
      setServerUrlInput(normalized);
      const ok = await updateSyncSettings(syncToggle, normalized);
      if (ok) {
        setStatusBanner(
          syncToggle
            ? 'Cloud Sync enabled. Encrypted vault blobs synced with Blind Relay.'
            : 'Cloud Sync disabled. Vault is 100% local.'
        );
      }
    } catch {
      setUrlError(true);
    }
  };

  const handleRequestDeviceAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newDeviceName.trim() || 'Arca Mobile (Android)';
    const recovery = recoveryBypassPhrase.trim() || undefined;
    const res = await requestDeviceAuthorization(label, recovery);
    if (res) {
      if (res.bypassUsed && res.status === 'TRUSTED') {
        setStatusBanner(
          `24-Word Recovery Kit verified! Device "${label}" (${res.shortCode}) bypassed approval and is now TRUSTED.`
        );
      } else if (res.status === 'PENDING') {
        setStatusBanner(
          `New device "${label}" (${res.shortCode}) requested access. Approve or deny below.`
        );
      } else {
        setStatusBanner(`Device "${label}" authorized (${res.status}).`);
      }
      setNewDeviceName('');
      setRecoveryBypassPhrase('');
    }
  };

  const handleApproveAttempt = async (
    targetDeviceId: string,
    approve: boolean,
    targetDevicePubKey?: string
  ) => {
    await approveOrDenyDeviceAttempt(targetDeviceId, approve, targetDevicePubKey);
    setStatusBanner(
      approve
        ? `Device ${targetDeviceId.slice(0, 8)} approved as TRUSTED.`
        : `Device ${targetDeviceId.slice(0, 8)} denied and blocked.`
    );
  };

  const handleRevokeDevice = async (targetDeviceId: string) => {
    await revokeDevice(targetDeviceId);
    setStatusBanner(`Device ${targetDeviceId.slice(0, 8)} session revoked immediately.`);
  };

  return React.createElement(
    'section',
    {
      'aria-labelledby': 'settings-heading',
      className: 'ps-4 pe-4 pt-3 pb-3 text-start bg-zinc-950 text-zinc-50 space-y-4',
    },
    React.createElement(
      'h1',
      {
        id: 'settings-heading',
        className: 'text-sm font-bold text-zinc-50',
      },
      t('settings.title')
    ),
    statusBanner
      ? React.createElement(
          'div',
          {
            role: 'status',
            className:
              'ps-3 pe-3 pt-2 pb-2 rounded-lg bg-zinc-900 border border-emerald-500/40 text-xs text-emerald-400',
          },
          statusBanner
        )
      : null,
    React.createElement(
      TabsRoot,
      {
        defaultValue: 'general',
        className: 'space-y-3',
      },
      React.createElement(
        TabsList,
        {
          className:
            'grid grid-cols-2 gap-1 ps-1 pe-1 pt-1 pb-1 rounded-lg bg-zinc-900 border border-zinc-800',
        },
        React.createElement(
          TabsTrigger,
          {
            value: 'general',
            className:
              'ps-2 pe-2 pt-1.5 pb-1.5 rounded text-xs font-semibold text-zinc-300 data-[state=active]:bg-emerald-500 data-[state=active]:text-zinc-950',
          },
          t('settings.tab.general')
        ),
        React.createElement(
          TabsTrigger,
          {
            value: 'sync',
            className:
              'ps-2 pe-2 pt-1.5 pb-1.5 rounded text-xs font-semibold text-zinc-300 data-[state=active]:bg-emerald-500 data-[state=active]:text-zinc-950',
          },
          t('settings.tab.sync')
        )
      ),
      React.createElement(
        TabsContent,
        {
          value: 'general',
          className: 'space-y-3',
        },
        React.createElement(
          'div',
          null,
          React.createElement(Label, { htmlFor: 'lang-select' }, t('settings.language')),
          React.createElement(
            'div',
            {
              id: 'lang-select',
              className: 'flex items-center gap-2 mt-1',
            },
            React.createElement(
              Button,
              {
                variant: locale === 'en' ? 'emerald' : 'secondary',
                onClick: () => handleLanguageChange('en'),
              },
              t('settings.language.en')
            ),
            React.createElement(
              Button,
              {
                variant: locale === 'hi' ? 'emerald' : 'secondary',
                onClick: () => handleLanguageChange('hi'),
              },
              t('settings.language.hi')
            )
          )
        ),
        React.createElement(
          'div',
          null,
          React.createElement(Label, { htmlFor: 'autolock-display' }, t('settings.autoLock')),
          React.createElement(
            'p',
            {
              id: 'autolock-display',
              className: 'text-xs text-zinc-300',
            },
            autoLockMinutes,
            ' min'
          )
        )
      ),
      React.createElement(
        TabsContent,
        {
          value: 'sync',
          className: 'space-y-4',
        },
        /* 1. Opt-In Cloud Sync Configuration */
        React.createElement(
          'form',
          {
            onSubmit: handleSaveSync,
            className: 'space-y-3 ps-3 pe-3 pt-3 pb-3 rounded-lg bg-zinc-900 border border-zinc-800',
          },
          React.createElement(
            'div',
            {
              className: 'flex items-center justify-between gap-2',
            },
            React.createElement(
              Label,
              {
                htmlFor: 'sync-enable-switch',
                className: 'mb-0',
              },
              t('settings.sync.enable')
            ),
            React.createElement(Switch, {
              id: 'sync-enable-switch',
              checked: syncToggle,
              onCheckedChange: setSyncToggle,
            })
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              Label,
              { htmlFor: 'sync-server-url-input' },
              t('settings.sync.serverUrl.label')
            ),
            React.createElement(Input, {
              id: 'sync-server-url-input',
              type: 'url',
              value: serverUrlInput,
              placeholder: t('settings.sync.serverUrl.placeholder'),
              onChange: (e: any) => setServerUrlInput(e.target.value),
              required: true,
            }),
            urlError
              ? React.createElement(
                  'p',
                  {
                    role: 'alert',
                    className: 'text-xs text-rose-500 mt-1',
                  },
                  t('settings.sync.error.url')
                )
              : null
          ),
          React.createElement(
            'p',
            {
              className: 'text-xs text-zinc-400 leading-relaxed',
            },
            t('settings.sync.cspNote')
          ),
          React.createElement(
            Button,
            {
              type: 'submit',
              variant: 'emerald',
              className: 'w-full',
            },
            t('settings.sync.save.button')
          )
        ),

        /* 2. Pending New Device Approval Prompt (Step 3 & Step 4: NEW_DEVICE_ATTEMPT) */
        pendingDeviceAttempts.length > 0
          ? React.createElement(
              'div',
              {
                role: 'alert',
                className:
                  'space-y-2 ps-3 pe-3 pt-3 pb-3 rounded-lg bg-amber-500/10 border border-amber-500/40',
              },
              React.createElement(
                'p',
                { className: 'text-xs font-bold text-amber-400' },
                'A new device is trying to access your vault. Allow?'
              ),
              ...pendingDeviceAttempts.map((attempt: any) =>
                React.createElement(
                  'div',
                  {
                    key: attempt.newDeviceId,
                    className:
                      'ps-2.5 pe-2.5 pt-2 pb-2 rounded bg-zinc-950 border border-zinc-800 space-y-2',
                  },
                  React.createElement(
                    'div',
                    { className: 'flex items-center justify-between text-xs' },
                    React.createElement(
                      'span',
                      { className: 'font-semibold text-zinc-100' },
                      attempt.deviceName || 'New Device'
                    ),
                    React.createElement(
                      'span',
                      {
                        className:
                          'ps-1.5 pe-1.5 pt-0.5 pb-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[11px]',
                      },
                      'SAS: ',
                      attempt.shortCode
                    )
                  ),
                  React.createElement(
                    'p',
                    { className: 'text-[11px] text-zinc-400 font-mono truncate' },
                    'ID: ',
                    attempt.newDeviceId
                  ),
                  React.createElement(
                    'div',
                    { className: 'flex items-center gap-2' },
                    React.createElement(
                      Button,
                      {
                        variant: 'emerald',
                        className: 'flex-1 text-xs',
                        onClick: () =>
                          void handleApproveAttempt(
                            attempt.newDeviceId,
                            true,
                            attempt.deviceAuthPubKey
                          ),
                      },
                      'Yes, Allow'
                    ),
                    React.createElement(
                      Button,
                      {
                        variant: 'danger',
                        className: 'flex-1 text-xs',
                        onClick: () =>
                          void handleApproveAttempt(
                            attempt.newDeviceId,
                            false,
                            attempt.deviceAuthPubKey
                          ),
                      },
                      'No, Block'
                    )
                  )
                )
              )
            )
          : null,

        /* 3. Active / Trusted Devices Management & Instant Revocation */
        React.createElement(
          'div',
          {
            className: 'space-y-2 ps-3 pe-3 pt-3 pb-3 rounded-lg bg-zinc-900 border border-zinc-800',
          },
          React.createElement(
            'div',
            { className: 'flex items-center justify-between' },
            React.createElement(
              'h2',
              { className: 'text-xs font-bold text-zinc-100 uppercase tracking-wider' },
              'Active Devices'
            ),
            React.createElement(
              'span',
              { className: 'text-[11px] text-zinc-400' },
              `${trustedDevices.filter((d: any) => d.status === 'TRUSTED').length} Trusted`
            )
          ),
          trustedDevices.length === 0
            ? React.createElement(
                'p',
                { className: 'text-xs text-zinc-400' },
                'No synced devices registered yet.'
              )
            : React.createElement(
                'div',
                { className: 'space-y-2' },
                ...trustedDevices.map((dev: any) =>
                  React.createElement(
                    'div',
                    {
                      key: dev.deviceId,
                      className:
                        'flex items-center justify-between gap-2 ps-2.5 pe-2.5 pt-2 pb-2 rounded bg-zinc-950 border border-zinc-800',
                    },
                    React.createElement(
                      'div',
                      { className: 'min-w-0 flex-1' },
                      React.createElement(
                        'div',
                        { className: 'flex items-center gap-1.5' },
                        React.createElement(
                          'span',
                          { className: 'text-xs font-semibold text-zinc-100 truncate' },
                          dev.deviceName
                        ),
                        dev.deviceId === currentDeviceId
                          ? React.createElement(
                              'span',
                              {
                                className:
                                  'ps-1.5 pe-1.5 pt-0.5 pb-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-semibold',
                              },
                              'Current'
                            )
                          : null,
                        React.createElement(
                          'span',
                          {
                            className: `ps-1.5 pe-1.5 pt-0.5 pb-0.5 rounded text-[10px] font-semibold ${
                              dev.status === 'TRUSTED'
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : dev.status === 'PENDING'
                                ? 'bg-amber-500/15 text-amber-400'
                                : 'bg-rose-500/15 text-rose-400'
                            }`,
                          },
                          dev.status
                        )
                      ),
                      React.createElement(
                        'p',
                        { className: 'text-[11px] text-zinc-400 font-mono truncate mt-0.5' },
                        `SAS ${dev.shortCode || '---'} • ${dev.deviceId.slice(0, 12)}`
                      )
                    ),
                    dev.status !== 'REVOKED'
                      ? React.createElement(
                          Button,
                          {
                            variant: 'danger',
                            className: 'text-xs ps-2.5 pe-2.5 pt-1 pb-1',
                            onClick: () => void handleRevokeDevice(dev.deviceId),
                          },
                          'Revoke'
                        )
                      : null
                  )
                )
              )
        ),

        /* 4. Authorize New Device / 24-Word Recovery Kit Bypass */
        React.createElement(
          'form',
          {
            onSubmit: handleRequestDeviceAuth,
            className: 'space-y-2.5 ps-3 pe-3 pt-3 pb-3 rounded-lg bg-zinc-900 border border-zinc-800',
          },
          React.createElement(
            'h2',
            { className: 'text-xs font-bold text-zinc-100 uppercase tracking-wider' },
            'Link New Device / Recovery Kit Bypass'
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              Label,
              { htmlFor: 'new-device-name-input' },
              'New Device Label'
            ),
            React.createElement(Input, {
              id: 'new-device-name-input',
              type: 'text',
              value: newDeviceName,
              placeholder: 'e.g. Pixel 9 Pro / Work Laptop',
              onChange: (e: any) => setNewDeviceName(e.target.value),
            })
          ),
          React.createElement(
            'div',
            null,
            React.createElement(
              Label,
              { htmlFor: 'recovery-bypass-input' },
              '24-Word Recovery Kit (Optional — Bypasses Device Approval)'
            ),
            React.createElement(Input, {
              id: 'recovery-bypass-input',
              type: 'password',
              value: recoveryBypassPhrase,
              placeholder: 'Enter 24 words to prove ownership & auto-approve...',
              onChange: (e: any) => setRecoveryBypassPhrase(e.target.value),
            })
          ),
          React.createElement(
            Button,
            {
              type: 'submit',
              variant: 'secondary',
              className: 'w-full text-xs',
            },
            recoveryBypassPhrase.trim().length > 0
              ? 'Authorize Immediately with 24-Word Recovery Kit'
              : 'Send New Device Authorization Request'
          )
        )
      )
    ),
    React.createElement(
      'div',
      {
        className: 'pt-2 border-t border-zinc-800 space-y-2',
      },
      React.createElement(
        Button,
        {
          variant: 'danger',
          className: 'w-full',
          onClick: () => void lock(),
        },
        t('nav.lock')
      )
    )
  );
}