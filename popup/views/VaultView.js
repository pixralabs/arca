/**
 * @file apps/extension/src/popup/views/VaultView.tsx
 * @description Arca by Pixra — Premium Charcoal Vault Item List (`bg-zinc-950`, `bg-zinc-900/80`, `border-zinc-800`):
 * - 100% Offline 32x32px (`w-8 h-8`) Deterministic Domain/Title Initial Favicons (`tldts.parse` domain extraction,
 *   zero external favicon network requests, Emerald/Amber/Rose/Zinc keyring palette).
 * - Instant `useMemo` Search Filtering across `title`, `username`, and `urls`.
 * - Strict Ellipsis Truncation (`text-ellipsis overflow-hidden whitespace-nowrap`) on titles, usernames, and domains.
 *
 * Security Note (Patch VG-07 — V8/Hermes String Immutability Roadmap):
 * Decrypted item passwords (`item.password`) and TOTP secrets (`item.totpSecret`) are currently held in memory
 * as immutable JavaScript strings inside React state while the popup view is mounted. In the next major version
 * (`v0.5.0`), item metadata (`title`, `username`, `urls`) will be split from secret fields into a separate
 * `DataEnvelope` so plaintext passwords are only decrypted on demand at the exact moment of autofill or copy.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parse as parseTld } from 'tldts';
import { Button, DialogRoot, DialogTrigger, DialogContent, Input, Label, useI18n } from '@vaultguard/ui';
import { Plus, Copy, Key, Trash2, QrCode, Share2 } from 'lucide-react';
import { usePopupStore } from '../store.js';
import { TotpBadge } from './TotpBadge.js';
import { TotpWarningBanner } from './TotpWarningBanner.js';
const AVATAR_COLOR_CLASSES = ['bg-emerald-600 border-emerald-400/40', 'bg-amber-600 border-amber-400/40', 'bg-rose-600 border-rose-400/40', 'bg-zinc-700 border-zinc-500/40', 'bg-teal-600 border-teal-400/40', 'bg-emerald-700 border-emerald-500/40', 'bg-amber-700 border-amber-500/40', 'bg-rose-700 border-rose-500/40'];

/**
 * Extracts a normalized URL string from either a string entry or a `{ uri?: string; url?: string }` object.
 */
export function extractRawUrlString(entry) {
  if (typeof entry === 'string') {
    return entry;
  }
  if (typeof entry === 'object' && entry !== null) {
    const rec = entry;
    if (typeof rec.uri === 'string') {
      return rec.uri;
    }
    if (typeof rec.url === 'string') {
      return rec.url;
    }
  }
  return '';
}

/**
 * Extracts the registrable base domain (e.g. `github.com`, `instagram.com`) from `urls[0]` using `tldts`.
 * Zero network calls; 100% offline Public Suffix List parsing.
 */
export function extractItemBaseDomain(urls) {
  if (!Array.isArray(urls) || urls.length === 0) {
    return '';
  }
  const firstRaw = extractRawUrlString(urls[0]).trim();
  if (!firstRaw) {
    return '';
  }
  const parsed = parseTld(firstRaw, {
    allowPrivateDomains: true
  });
  return parsed.domain ?? parsed.hostname ?? firstRaw;
}

/**
 * Computes a deterministic 100% offline 32x32px avatar badge (`initial` + Tailwind color class)
 * seeded from the item's title and `tldts` base domain.
 */
export function getDeterministicFaviconBadge(title, baseDomain) {
  const seedSource = (title.trim() || baseDomain.trim() || 'A').toUpperCase();
  const initial = seedSource.charAt(0);
  let hash = 0;
  for (let i = 0; i < seedSource.length; i++) {
    hash = hash * 31 + seedSource.charCodeAt(i) >>> 0;
  }
  const colorClass = AVATAR_COLOR_CLASSES[hash % AVATAR_COLOR_CLASSES.length] ?? AVATAR_COLOR_CLASSES[0];
  return {
    initial,
    colorClass
  };
}
export function VaultView() {
  const {
    t
  } = useI18n();
  // Patch VG-07 Note: `items` currently contains decrypted password strings in JS memory;
  // planned for next major version: split secret fields (`password`, `totpSecret`) into a separate DataEnvelope.
  const items = usePopupStore(s => s.items);
  const searchQuery = usePopupStore(s => s.searchQuery);
  const setSearchQuery = usePopupStore(s => s.setSearchQuery);
  const saveItem = usePopupStore(s => s.saveItem);
  const deleteItem = usePopupStore(s => s.deleteItem);
  const scanQrFromActiveTab = usePopupStore(s => s.scanQrFromActiveTab);
  const createOneTimeShareForItem = usePopupStore(s => s.createOneTimeShareForItem);
  const activeShareModal = usePopupStore(s => s.activeShareModal);
  const closeShareModal = usePopupStore(s => s.closeShareModal);
  const copyToClipboardWithAutoClear = usePopupStore(s => s.copyToClipboardWithAutoClear);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [qrScanError, setQrScanError] = useState(false);
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter(item => {
      const titleMatch = String(item.title ?? '').toLowerCase().includes(q);
      const usernameMatch = String(item.username ?? '').toLowerCase().includes(q);
      const baseDomain = extractItemBaseDomain(item.urls).toLowerCase();
      const domainMatch = baseDomain.includes(q);
      const urlListMatch = Array.isArray(item.urls) && item.urls.some(entry => extractRawUrlString(entry).toLowerCase().includes(q));
      return titleMatch || usernameMatch || domainMatch || urlListMatch;
    });
  }, [items, searchQuery]);
  const handleScanQr = async () => {
    setQrScanError(false);
    const scanned = await scanQrFromActiveTab();
    if (scanned) {
      setTotpSecret(scanned.uri);
      if (!title.trim() && scanned.config.issuer) {
        setTitle(scanned.config.issuer);
      }
    } else {
      setQrScanError(true);
    }
  };
  const handleSave = async e => {
    e.preventDefault();
    const ok = await saveItem({
      title: title.trim(),
      username: username.trim(),
      password,
      urls: url.trim() ? [url.trim()] : [],
      notes: notes.trim(),
      totpSecret: totpSecret.trim() ? totpSecret.trim() : null,
      customFields: []
    });
    if (ok) {
      setTitle('');
      setUsername('');
      setPassword('');
      setUrl('');
      setTotpSecret('');
      setNotes('');
      setQrScanError(false);
      setIsDialogOpen(false);
    }
  };
  return /*#__PURE__*/React.createElement(motion.section, {
    initial: {
      opacity: 0,
      y: 6
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.18
    },
    "aria-label": t('nav.vault'),
    className: "ps-4 pe-4 pt-3 pb-3 text-start bg-zinc-950 text-zinc-50 font-sans space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between gap-2"
  }, /*#__PURE__*/React.createElement(Input, {
    type: "search",
    "aria-label": t('vault.search.placeholder'),
    placeholder: t('vault.search.placeholder'),
    value: searchQuery,
    onChange: e => setSearchQuery(e.target.value)
  }), /*#__PURE__*/React.createElement(DialogRoot, {
    open: isDialogOpen,
    onOpenChange: setIsDialogOpen
  }, /*#__PURE__*/React.createElement(DialogTrigger, {
    asChild: true
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "emerald",
    className: "shrink-0"
  }, /*#__PURE__*/React.createElement(Plus, {
    className: "w-4 h-4 me-1",
    "aria-hidden": "true"
  }), t('vault.add.button'))), /*#__PURE__*/React.createElement(DialogContent, {
    title: t('vault.add.button'),
    closeLabel: t('common.close')
  }, /*#__PURE__*/React.createElement("form", {
    onSubmit: handleSave,
    className: "space-y-2.5"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-title"
  }, t('vault.item.title')), /*#__PURE__*/React.createElement(Input, {
    id: "item-title",
    value: title,
    onChange: e => setTitle(e.target.value),
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-username"
  }, t('vault.item.username')), /*#__PURE__*/React.createElement(Input, {
    id: "item-username",
    value: username,
    onChange: e => setUsername(e.target.value),
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-password"
  }, t('vault.item.password')), /*#__PURE__*/React.createElement(Input, {
    id: "item-password",
    type: "password",
    className: "font-mono",
    value: password,
    onChange: e => setPassword(e.target.value),
    required: true
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-between mb-1"
  }, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-totp",
    className: "mb-0"
  }, t('totp.label')), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "secondary",
    onClick: () => void handleScanQr(),
    className: "ps-2.5 pe-2.5 pt-1 pb-1 text-xs"
  }, /*#__PURE__*/React.createElement(QrCode, {
    className: "w-3.5 h-3.5 me-1 text-amber-500",
    "aria-hidden": "true"
  }), t('totp.scanQr.button'))), /*#__PURE__*/React.createElement(Input, {
    id: "item-totp",
    className: "font-mono",
    value: totpSecret,
    placeholder: t('totp.placeholder'),
    onChange: e => setTotpSecret(e.target.value)
  }), qrScanError ? /*#__PURE__*/React.createElement("p", {
    role: "alert",
    className: "text-xs text-rose-500 mt-1"
  }, t('totp.scanQr.error')) : null, totpSecret.trim().length > 0 && password.length > 0 ? /*#__PURE__*/React.createElement("div", {
    className: "mt-2"
  }, /*#__PURE__*/React.createElement(TotpWarningBanner, null)) : null), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-url"
  }, t('vault.item.url')), /*#__PURE__*/React.createElement(Input, {
    id: "item-url",
    type: "url",
    value: url,
    onChange: e => setUrl(e.target.value)
  })), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement(Label, {
    htmlFor: "item-notes"
  }, t('vault.item.notes')), /*#__PURE__*/React.createElement(Input, {
    id: "item-notes",
    value: notes,
    onChange: e => setNotes(e.target.value)
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-end gap-2 pt-2"
  }, /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "secondary",
    onClick: () => setIsDialogOpen(false)
  }, t('vault.item.cancel')), /*#__PURE__*/React.createElement(Button, {
    type: "submit",
    variant: "emerald"
  }, t('vault.item.save'))))))), /*#__PURE__*/React.createElement(DialogRoot, {
    open: Boolean(activeShareModal),
    onOpenChange: open => {
      if (!open) closeShareModal();
    }
  }, /*#__PURE__*/React.createElement(DialogContent, {
    title: t('share.modal.title'),
    description: t('share.modal.notice'),
    closeLabel: t('common.close')
  }, activeShareModal ? /*#__PURE__*/React.createElement(motion.div, {
    initial: {
      opacity: 0,
      y: 6
    },
    animate: {
      opacity: 1,
      y: 0
    },
    transition: {
      duration: 0.16
    },
    className: "space-y-3"
  }, /*#__PURE__*/React.createElement("div", {
    role: "status",
    className: "ps-3.5 pe-3.5 pt-2.5 pb-2.5 rounded-lg border border-zinc-800 bg-zinc-950/90 backdrop-blur-md shadow-inner font-mono text-xs text-amber-400 break-all"
  }, activeShareModal.url), /*#__PURE__*/React.createElement(Button, {
    type: "button",
    variant: "emerald",
    className: "w-full",
    onClick: () => void copyToClipboardWithAutoClear(activeShareModal.url)
  }, /*#__PURE__*/React.createElement(Copy, {
    className: "w-4 h-4 me-1",
    "aria-hidden": "true"
  }), t('share.modal.copy'))) : null)), filteredItems.length === 0 ? /*#__PURE__*/React.createElement("div", {
    className: "ps-4 pe-4 pt-6 pb-6 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl text-center"
  }, /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-bold tracking-tight text-zinc-50"
  }, t('vault.empty.title')), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-400 mt-1"
  }, t('vault.empty.subtitle'))) : /*#__PURE__*/React.createElement("ul", {
    className: "space-y-2.5"
  }, /*#__PURE__*/React.createElement(AnimatePresence, null, filteredItems.map(item => {
    const baseDomain = extractItemBaseDomain(item.urls);
    const badge = getDeterministicFaviconBadge(String(item.title ?? ''), baseDomain);
    return /*#__PURE__*/React.createElement(motion.li, {
      key: item.id,
      initial: {
        opacity: 0,
        y: 6
      },
      animate: {
        opacity: 1,
        y: 0
      },
      exit: {
        opacity: 0,
        y: -4
      },
      transition: {
        duration: 0.16
      },
      className: "ps-3.5 pe-3.5 pt-3 pb-3 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl space-y-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-between gap-2.5"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2.5 min-w-0 flex-1"
    }, /*#__PURE__*/React.createElement("div", {
      "aria-hidden": "true",
      className: `w-8 h-8 rounded-full border shrink-0 flex items-center justify-center font-sans font-bold text-xs text-zinc-50 shadow-md ${badge.colorClass}`
    }, badge.initial), /*#__PURE__*/React.createElement("div", {
      className: "min-w-0 flex-1"
    }, /*#__PURE__*/React.createElement("p", {
      className: "text-sm font-bold tracking-tight text-zinc-50 text-ellipsis overflow-hidden whitespace-nowrap"
    }, item.title), /*#__PURE__*/React.createElement("p", {
      className: "text-xs text-zinc-400 font-mono text-ellipsis overflow-hidden whitespace-nowrap"
    }, item.username, baseDomain ? ` · ${baseDomain}` : ''))), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5 shrink-0"
    }, /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      "aria-label": t('share.button'),
      onClick: () => void createOneTimeShareForItem(item)
    }, /*#__PURE__*/React.createElement(Share2, {
      className: "w-3.5 h-3.5 text-amber-500",
      "aria-hidden": "true"
    })), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      "aria-label": t('vault.copyUsername'),
      onClick: () => void copyToClipboardWithAutoClear(item.username)
    }, /*#__PURE__*/React.createElement(Copy, {
      className: "w-3.5 h-3.5 text-zinc-300",
      "aria-hidden": "true"
    })), /*#__PURE__*/React.createElement(Button, {
      variant: "secondary",
      "aria-label": t('vault.copyPassword'),
      onClick: () => void copyToClipboardWithAutoClear(item.password)
    }, /*#__PURE__*/React.createElement(Key, {
      className: "w-3.5 h-3.5 text-emerald-500",
      "aria-hidden": "true"
    })), /*#__PURE__*/React.createElement(Button, {
      variant: "danger",
      "aria-label": t('vault.item.delete'),
      onClick: () => void deleteItem(item.id)
    }, /*#__PURE__*/React.createElement(Trash2, {
      className: "w-3.5 h-3.5",
      "aria-hidden": "true"
    })))), item.totpSecret ? /*#__PURE__*/React.createElement("div", {
      className: "pt-1.5 border-t border-zinc-800 flex items-center justify-between"
    }, /*#__PURE__*/React.createElement(TotpBadge, {
      totpInput: item.totpSecret,
      onCopyCode: copyToClipboardWithAutoClear
    })) : null);
  }))));
}