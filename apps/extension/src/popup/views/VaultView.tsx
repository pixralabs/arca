/**
 * @file apps/extension/src/popup/views/VaultView.tsx
 * @description Arca by Pixra — Premium Charcoal Vault Item List (`bg-zinc-950`, `bg-zinc-900/80`, `border-zinc-800`):
 * - Apple-style Security Tile with Vault Health Score (0–100%) and Security Recommendations.
 * - Security Audit Drill-Down: "Compromised/Weak Passwords (Action Required)" & "Reused Passwords (Fix Now)"
 *   with 1-click "Replace with Arca Generator" button.
 * - Bulk CSV Import (Chrome, Bitwarden, 1Password) with mandatory in-RAM memory zeroization and on-device privacy guarantee.
 * - 100% Offline 32x32px Deterministic Domain/Title Initial Favicons.
 */

import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { parse as parseTld } from 'tldts';
import {
  Button,
  DialogRoot,
  DialogTrigger,
  DialogContent,
  Input,
  Label,
  useI18n,
} from '@vaultguard/ui';
import {
  Plus,
  Copy,
  Key,
  Trash2,
  QrCode,
  Share2,
  ShieldAlert,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  calculateVaultSecurityScore,
  generatePassword,
} from '@vaultguard/crypto';
import { usePopupStore } from '../store.js';
import { TotpBadge } from './TotpBadge.js';
import { TotpWarningBanner } from './TotpWarningBanner.js';

const AVATAR_COLOR_CLASSES = [
  'bg-emerald-600 border-emerald-400/40',
  'bg-amber-600 border-amber-400/40',
  'bg-rose-600 border-rose-400/40',
  'bg-zinc-700 border-zinc-500/40',
  'bg-teal-600 border-teal-400/40',
  'bg-emerald-700 border-emerald-500/40',
  'bg-amber-700 border-amber-500/40',
  'bg-rose-700 border-rose-500/40',
];

export function extractRawUrlString(entry: any): string {
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'object' && entry !== null) {
    const rec = entry as { uri?: string; url?: string };
    if (typeof rec.uri === 'string') return rec.uri;
    if (typeof rec.url === 'string') return rec.url;
  }
  return '';
}

export function extractItemBaseDomain(urls: any[]): string {
  if (!Array.isArray(urls) || urls.length === 0) return '';
  const firstRaw = extractRawUrlString(urls[0]).trim();
  if (!firstRaw) return '';
  const parsed = parseTld(firstRaw, { allowPrivateDomains: true });
  return parsed.domain ?? parsed.hostname ?? firstRaw;
}

export function getDeterministicFaviconBadge(title: string, baseDomain: string) {
  const seedSource = (title.trim() || baseDomain.trim() || 'A').toUpperCase();
  const initial = seedSource.charAt(0);
  let hash = 0;
  for (let i = 0; i < seedSource.length; i++) {
    hash = (hash * 31 + seedSource.charCodeAt(i)) >>> 0;
  }
  const colorClass =
    AVATAR_COLOR_CLASSES[hash % AVATAR_COLOR_CLASSES.length] ?? AVATAR_COLOR_CLASSES[0];
  return { initial, colorClass };
}

export function VaultView() {
  const { t } = useI18n();
  const items = usePopupStore((s: any) => s.items);
  const searchQuery = usePopupStore((s: any) => s.searchQuery);
  const setSearchQuery = usePopupStore((s: any) => s.setSearchQuery);
  const saveItem = usePopupStore((s: any) => s.saveItem);
  const deleteItem = usePopupStore((s: any) => s.deleteItem);
  const importCsv = usePopupStore((s: any) => s.importCsv);
  const scanQrFromActiveTab = usePopupStore((s: any) => s.scanQrFromActiveTab);
  const createOneTimeShareForItem = usePopupStore((s: any) => s.createOneTimeShareForItem);
  const activeShareModal = usePopupStore((s: any) => s.activeShareModal);
  const closeShareModal = usePopupStore((s: any) => s.closeShareModal);
  const copyToClipboardWithAutoClear = usePopupStore(
    (s: any) => s.copyToClipboardWithAutoClear
  );

  // Security View Drill-Down Toggle
  const [isSecurityViewOpen, setIsSecurityViewOpen] = useState(false);

  // Add Item Dialog State
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [totpSecret, setTotpSecret] = useState('');
  const [notes, setNotes] = useState('');
  const [qrScanError, setQrScanError] = useState(false);

  // CSV Import Modal & State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generator Action Loading State
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);

  // Calculate In-RAM Security Score
  const securityAudit = useMemo(() => {
    return calculateVaultSecurityScore(items);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item: any) => {
      const titleMatch = String(item.title ?? '').toLowerCase().includes(q);
      const usernameMatch = String(item.username ?? '').toLowerCase().includes(q);
      const baseDomain = extractItemBaseDomain(item.urls).toLowerCase();
      const domainMatch = baseDomain.includes(q);
      const urlListMatch =
        Array.isArray(item.urls) &&
        item.urls.some((entry: any) =>
          extractRawUrlString(entry).toLowerCase().includes(q)
        );
      return titleMatch || usernameMatch || domainMatch || urlListMatch;
    });
  }, [items, searchQuery]);

  // Weak and Reused lists for the Security view
  const weakItems = useMemo(() => {
    return items.filter((item: any) => securityAudit.weakItemIds.has(item.id));
  }, [items, securityAudit.weakItemIds]);

  const reusedItems = useMemo(() => {
    return items.filter((item: any) => securityAudit.reusedItemIds.has(item.id));
  }, [items, securityAudit.reusedItemIds]);

  // 1-Click Replace with Arca Generator
  const handleReplaceWithArcaGenerator = async (item: any) => {
    setUpdatingItemId(item.id);
    try {
      const strongPassword = await generatePassword({ length: 20 });
      await saveItem({ ...item, password: strongPassword }, item.id);
    } catch {
      // Ignore error
    } finally {
      setUpdatingItemId(null);
    }
  };

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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await saveItem({
      title: title.trim(),
      username: username.trim(),
      password,
      urls: url.trim() ? [url.trim()] : [],
      notes: notes.trim(),
      totpSecret: totpSecret.trim() ? totpSecret.trim() : null,
      customFields: [],
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportStatus(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const csvBytes = new Uint8Array(arrayBuffer);

      const result = await importCsv(csvBytes);
      setImportStatus(
        `Successfully imported ${result.plaintexts.length} passwords! (${result.audit.weakCount} weak, ${result.audit.reusedCount} reused).`
      );
    } catch (err: any) {
      setImportStatus(`Import failed: ${err?.message || 'Invalid CSV format'}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Determine visual styling for security score
  const scoreColor =
    securityAudit.score >= 80
      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
      : securityAudit.score >= 50
      ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
      : 'text-rose-400 bg-rose-500/10 border-rose-500/30';

  const barColor =
    securityAudit.score >= 80
      ? 'bg-emerald-500'
      : securityAudit.score >= 50
      ? 'bg-amber-500'
      : 'bg-rose-500';

  // -------------------------------------------------------------
  // Render Security Recommendations Drill-Down Screen
  // -------------------------------------------------------------
  if (isSecurityViewOpen) {
    return (
      <motion.section
        initial={{ opacity: 0, x: 12 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -12 }}
        transition={{ duration: 0.16 }}
        className="ps-4 pe-4 pt-3 pb-3 text-start bg-zinc-950 text-zinc-50 font-sans space-y-3"
      >
        {/* Navigation Back Header */}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsSecurityViewOpen(false)}
            className="flex items-center text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition"
          >
            <ChevronLeft className="w-4 h-4 me-0.5" aria-hidden="true" />
            Back to Vault
          </button>
          <div className={`px-2 py-0.5 rounded-full text-xs font-bold border ${scoreColor}`}>
            Score: {securityAudit.score}%
          </div>
        </div>

        <div className="space-y-1">
          <h1 className="text-base font-bold text-zinc-50">Security Recommendations</h1>
          <p className="text-xs text-zinc-400">
            Audit of {securityAudit.totalCount} credentials stored locally in RAM.
          </p>
        </div>

        {weakItems.length === 0 && reusedItems.length === 0 ? (
          <div className="ps-4 pe-4 pt-6 pb-6 rounded-xl border border-zinc-800 bg-zinc-900/80 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" aria-hidden="true" />
            <p className="text-sm font-bold text-zinc-100">All Passwords Strong &amp; Unique</p>
            <p className="text-xs text-zinc-400">
              No weak, compromised, or reused passwords were found in your vault.
            </p>
          </div>
        ) : null}

        {/* Section 1: Compromised/Weak Passwords (Action Required) */}
        {weakItems.length > 0 ? (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Compromised / Weak Passwords ({weakItems.length})
              </h2>
            </div>
            <p className="text-xs text-zinc-400">Action Required: Password has &lt; 12 characters or lacks complexity.</p>
            <ul className="space-y-2">
              {weakItems.map((item: any) => {
                const baseDomain = extractItemBaseDomain(item.urls);
                const badge = getDeterministicFaviconBadge(String(item.title ?? ''), baseDomain);
                const findings = securityAudit.findings.get(item.id) ?? ['Weak password'];

                return (
                  <li
                    key={item.id}
                    className="p-3 rounded-xl border border-rose-500/30 bg-zinc-900/90 space-y-2 shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          aria-hidden="true"
                          className={`w-7 h-7 rounded-full border shrink-0 flex items-center justify-center font-bold text-xs text-zinc-50 ${badge.colorClass}`}
                        >
                          {badge.initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-zinc-100 truncate">{item.title}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            {item.username} {baseDomain ? `· ${baseDomain}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-rose-400 font-medium bg-rose-500/10 border border-rose-500/20 px-2 py-1 rounded">
                      ⚠ {findings.join(' • ')}
                    </div>

                    {/* 1-Click Button: Replace with Arca Generator */}
                    <Button
                      type="button"
                      variant="emerald"
                      className="w-full text-xs py-1.5"
                      disabled={updatingItemId === item.id}
                      onClick={() => void handleReplaceWithArcaGenerator(item)}
                    >
                      <Sparkles className="w-3.5 h-3.5 me-1 text-zinc-950" aria-hidden="true" />
                      {updatingItemId === item.id ? 'Updating...' : 'Replace with Arca Generator'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* Section 2: Reused Passwords (Fix Now) */}
        {reusedItems.length > 0 ? (
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                Reused Passwords (Fix Now) ({reusedItems.length})
              </h2>
            </div>
            <p className="text-xs text-zinc-400">The same plaintext password is used across multiple accounts.</p>
            <ul className="space-y-2">
              {reusedItems.map((item: any) => {
                const baseDomain = extractItemBaseDomain(item.urls);
                const badge = getDeterministicFaviconBadge(String(item.title ?? ''), baseDomain);
                const findings = securityAudit.findings.get(item.id) ?? ['Reused password'];

                return (
                  <li
                    key={item.id}
                    className="p-3 rounded-xl border border-amber-500/30 bg-zinc-900/90 space-y-2 shadow-lg"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          aria-hidden="true"
                          className={`w-7 h-7 rounded-full border shrink-0 flex items-center justify-center font-bold text-xs text-zinc-50 ${badge.colorClass}`}
                        >
                          {badge.initial}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-zinc-100 truncate">{item.title}</p>
                          <p className="text-xs text-zinc-400 truncate">
                            {item.username} {baseDomain ? `· ${baseDomain}` : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-amber-400 font-medium bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
                      ⚠ {findings.join(' • ')}
                    </div>

                    {/* 1-Click Button: Replace with Arca Generator */}
                    <Button
                      type="button"
                      variant="emerald"
                      className="w-full text-xs py-1.5"
                      disabled={updatingItemId === item.id}
                      onClick={() => void handleReplaceWithArcaGenerator(item)}
                    >
                      <Sparkles className="w-3.5 h-3.5 me-1 text-zinc-950" aria-hidden="true" />
                      {updatingItemId === item.id ? 'Updating...' : 'Replace with Arca Generator'}
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </motion.section>
    );
  }

  // -------------------------------------------------------------
  // Render Main Vault View (with Apple-Style Security Tile & List)
  // -------------------------------------------------------------
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      aria-label={t('nav.vault')}
      className="ps-4 pe-4 pt-3 pb-3 text-start bg-zinc-950 text-zinc-50 font-sans space-y-3"
    >
      {/* Apple-style Security Tile with Security Score */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsSecurityViewOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsSecurityViewOpen(true);
          }
        }}
        className="p-3 rounded-xl border border-zinc-800 bg-zinc-900/90 hover:bg-zinc-900 hover:border-zinc-700 cursor-pointer transition shadow-md space-y-2 group"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center border ${
                securityAudit.score >= 80
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : securityAudit.score >= 50
                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
              }`}
            >
              {securityAudit.score >= 80 ? (
                <ShieldCheck className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ShieldAlert className="w-4 h-4" aria-hidden="true" />
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-zinc-100 group-hover:text-emerald-400 transition">
                Security Recommendations
              </p>
              <p className="text-xs text-zinc-400">
                {securityAudit.weakCount > 0 || securityAudit.reusedCount > 0
                  ? `${securityAudit.weakCount} Weak • ${securityAudit.reusedCount} Reused`
                  : 'All Passwords Strong & Unique'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`px-2 py-0.5 rounded-md text-xs font-bold border ${scoreColor}`}>
              Score: {securityAudit.score}%
            </span>
            <ChevronRight className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition" />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all duration-300`}
            style={{ width: `${securityAudit.score}%` }}
          />
        </div>
      </div>

      {/* Search Bar & Action Buttons */}
      <div className="flex items-center justify-between gap-2">
        <Input
          type="search"
          aria-label={t('vault.search.placeholder')}
          placeholder={t('vault.search.placeholder')}
          value={searchQuery}
          onChange={(e: any) => setSearchQuery(e.target.value)}
        />

        {/* Bulk CSV Import Button */}
        <DialogRoot open={isImportModalOpen} onOpenChange={setIsImportModalOpen}>
          <DialogTrigger asChild>
            <Button
              variant="secondary"
              className="shrink-0"
              title="Import CSV from Chrome, Bitwarden, or 1Password"
            >
              <FileSpreadsheet className="w-4 h-4 me-1 text-emerald-400" aria-hidden="true" />
              Import
            </Button>
          </DialogTrigger>
          <DialogContent
            title="Bulk Import Existing Passwords"
            description="Migrate passwords from Google Chrome, Bitwarden, or 1Password (.csv)."
            closeLabel={t('common.close')}
          >
            <div className="space-y-3 pt-2">
              {/* Mandatory UI Warning (Requirement 1) */}
              <div
                role="note"
                className="ps-3 pe-3 pt-2 pb-2 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-xs text-emerald-300 leading-relaxed font-medium"
              >
                🔒 Your CSV file is processed entirely on-device. It is never uploaded to any server.
              </div>

              <p className="text-xs text-zinc-300">
                All plaintext data exists exclusively in volatile RAM and is wiped immediately via{' '}
                <code className="text-amber-400">sodium.memzero()</code> after encryption into your vault envelope.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                disabled={isImporting}
                className="block w-full text-xs text-zinc-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-zinc-800 file:text-zinc-100 hover:file:bg-zinc-700 cursor-pointer"
              />

              {isImporting ? (
                <p className="text-xs text-amber-400 animate-pulse font-medium">
                  Encrypting and auditing passwords in RAM...
                </p>
              ) : null}

              {importStatus ? (
                <div
                  role="status"
                  className="ps-3 pe-3 pt-2 pb-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200"
                >
                  {importStatus}
                </div>
              ) : null}

              <div className="flex justify-end pt-2">
                <Button variant="secondary" onClick={() => setIsImportModalOpen(false)}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </DialogRoot>

        {/* Add Item Dialog */}
        <DialogRoot open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="emerald" className="shrink-0">
              <Plus className="w-4 h-4 me-1" aria-hidden="true" />
              {t('vault.add.button')}
            </Button>
          </DialogTrigger>
          <DialogContent title={t('vault.add.button')} closeLabel={t('common.close')}>
            <form onSubmit={handleSave} className="space-y-2.5">
              <div>
                <Label htmlFor="item-title">{t('vault.item.title')}</Label>
                <Input
                  id="item-title"
                  value={title}
                  onChange={(e: any) => setTitle(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="item-username">{t('vault.item.username')}</Label>
                <Input
                  id="item-username"
                  value={username}
                  onChange={(e: any) => setUsername(e.target.value)}
                  required
                />
              </div>

              <div>
                <Label htmlFor="item-password">{t('vault.item.password')}</Label>
                <Input
                  id="item-password"
                  type="password"
                  className="font-mono"
                  value={password}
                  onChange={(e: any) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="item-totp" className="mb-0">
                    {t('totp.label')}
                  </Label>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => void handleScanQr()}
                    className="ps-2.5 pe-2.5 pt-1 pb-1 text-xs"
                  >
                    <QrCode className="w-3.5 h-3.5 me-1 text-amber-500" aria-hidden="true" />
                    {t('totp.scanQr.button')}
                  </Button>
                </div>
                <Input
                  id="item-totp"
                  className="font-mono"
                  value={totpSecret}
                  placeholder={t('totp.placeholder')}
                  onChange={(e: any) => setTotpSecret(e.target.value)}
                />
                {qrScanError ? (
                  <p role="alert" className="text-xs text-rose-500 mt-1">
                    {t('totp.scanQr.error')}
                  </p>
                ) : null}
                {totpSecret.trim().length > 0 && password.length > 0 ? (
                  <div className="mt-2">
                    <TotpWarningBanner />
                  </div>
                ) : null}
              </div>

              <div>
                <Label htmlFor="item-url">{t('vault.item.url')}</Label>
                <Input
                  id="item-url"
                  type="url"
                  value={url}
                  onChange={(e: any) => setUrl(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="item-notes">{t('vault.item.notes')}</Label>
                <Input
                  id="item-notes"
                  value={notes}
                  onChange={(e: any) => setNotes(e.target.value)}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setIsDialogOpen(false)}
                >
                  {t('vault.item.cancel')}
                </Button>
                <Button type="submit" variant="emerald">
                  {t('vault.item.save')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </DialogRoot>
      </div>

      {/* Share Modal Dialog */}
      <DialogRoot
        open={Boolean(activeShareModal)}
        onOpenChange={(open: boolean) => {
          if (!open) closeShareModal();
        }}
      >
        <DialogContent
          title={t('share.modal.title')}
          description={t('share.modal.notice')}
          closeLabel={t('common.close')}
        >
          {activeShareModal ? (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16 }}
              className="space-y-3"
            >
              <div
                role="status"
                className="ps-3.5 pe-3.5 pt-2.5 pb-2.5 rounded-lg border border-zinc-800 bg-zinc-950/90 backdrop-blur-md shadow-inner font-mono text-xs text-amber-400 break-all"
              >
                {activeShareModal.url}
              </div>
              <Button
                type="button"
                variant="emerald"
                className="w-full"
                onClick={() => void copyToClipboardWithAutoClear(activeShareModal.url)}
              >
                <Copy className="w-4 h-4 me-1" aria-hidden="true" />
                {t('share.modal.copy')}
              </Button>
            </motion.div>
          ) : null}
        </DialogContent>
      </DialogRoot>

      {/* Filtered Item List */}
      {filteredItems.length === 0 ? (
        <div className="ps-4 pe-4 pt-6 pb-6 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl text-center space-y-2">
          <p className="text-sm font-bold tracking-tight text-zinc-50">
            {t('vault.empty.title')}
          </p>
          <p className="text-xs text-zinc-400">{t('vault.empty.subtitle')}</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          <AnimatePresence>
            {filteredItems.map((item: any) => {
              const baseDomain = extractItemBaseDomain(item.urls);
              const badge = getDeterministicFaviconBadge(
                String(item.title ?? ''),
                baseDomain
              );
              const isWeak = securityAudit.weakItemIds.has(item.id);
              const isReused = securityAudit.reusedItemIds.has(item.id);

              return (
                <motion.li
                  key={item.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.16 }}
                  className="ps-3.5 pe-3.5 pt-3 pb-3 rounded-xl border border-zinc-800 bg-zinc-900/80 backdrop-blur-md shadow-2xl space-y-2"
                >
                  <div className="flex items-center justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div
                        aria-hidden="true"
                        className={`w-8 h-8 rounded-full border shrink-0 flex items-center justify-center font-sans font-bold text-xs text-zinc-50 shadow-md ${badge.colorClass}`}
                      >
                        {badge.initial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-bold tracking-tight text-zinc-50 truncate">
                            {item.title}
                          </p>
                          {isWeak ? (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 border border-rose-500/40"
                              title="Weak password (< 12 chars or lacks complexity)"
                            >
                              Weak
                            </span>
                          ) : null}
                          {isReused ? (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 border border-amber-500/40"
                              title="Password reused on other sites"
                            >
                              Reused
                            </span>
                          ) : null}
                        </div>
                        <p className="text-xs text-zinc-400 font-mono truncate">
                          {item.username}
                          {baseDomain ? ` · ${baseDomain}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        variant="secondary"
                        aria-label={t('share.button')}
                        onClick={() => void createOneTimeShareForItem(item)}
                      >
                        <Share2 className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label={t('vault.copyUsername')}
                        onClick={() => void copyToClipboardWithAutoClear(item.username)}
                      >
                        <Copy className="w-3.5 h-3.5 text-zinc-300" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="secondary"
                        aria-label={t('vault.copyPassword')}
                        onClick={() => void copyToClipboardWithAutoClear(item.password)}
                      >
                        <Key className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
                      </Button>
                      <Button
                        variant="danger"
                        aria-label={t('vault.item.delete')}
                        onClick={() => void deleteItem(item.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>

                  {item.totpSecret ? (
                    <div className="pt-1.5 border-t border-zinc-800 flex items-center justify-between">
                      <TotpBadge
                        totpInput={item.totpSecret}
                        onCopyCode={copyToClipboardWithAutoClear}
                      />
                    </div>
                  ) : null}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </motion.section>
  );
}
