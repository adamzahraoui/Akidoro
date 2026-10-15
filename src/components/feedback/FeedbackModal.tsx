import { useState } from 'react';
import { Button } from '../ui/Button';
import { Card, CardTitle } from '../ui/Card';
import { useApp } from '../../context/AppContext';

const DISCORD_WEBHOOK_URL =
  'https://discord.com/api/webhooks/1560283894366867547/LDRsJDyfPOB-Z9ugBkktUwP-XEMKsdeIe0_Rb71gvgxOnPQdpK-DonXWeD_5CcEX7EK2';

const CATEGORIES = ['Bug Report', 'Feature Request', 'General Feedback'];

export function FeedbackModal() {
  const { settings } = useApp();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(CATEGORIES[2]);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');

  const resetInputs = () => {
    setCategory(CATEGORIES[2]);
    setMessage('');
    setEmail('');
  };

  const submit = async () => {
    if (!message.trim()) return;
    setStatus('sending');
    setErrorText('');
    try {
      const response = await fetch(DISCORD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: '📩 New Feedback - Akidoro',
              color: 3447003,
              fields: [
                { name: 'Category', value: category, inline: true },
                { name: 'User Email', value: email.trim() || 'Anonymous', inline: true },
                { name: 'Message', value: message.trim() },
              ],
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      });
      if (!response.ok) {
        throw new Error(`Webhook responded with ${response.status}`);
      }
      setStatus('success');
      resetInputs();
      window.setTimeout(() => {
        setStatus('idle');
        setOpen(false);
      }, 1200);
    } catch (error) {
      setStatus('error');
      const text = error instanceof Error ? error.message : String(error);
      setErrorText(text);
      console.error('Feedback submission failed', error);
    }
  };

  if (!open) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Send feedback"
          className="focus-ring fixed bottom-5 right-5 z-50 rounded-full bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-accent-700"
        >
          Feedback
        </button>
      </>
    );
  }

  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring fixed bottom-5 right-5 z-50 rounded-full bg-accent-600 px-4 py-2 text-sm font-medium text-white shadow-lg hover:bg-accent-700"
      >
        Feedback
      </button>
      <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 px-4" role="dialog" aria-modal="true" aria-labelledby="feedback-title">
        <div className={`w-full max-w-lg ${isDark ? 'dark' : ''}`}>
          <Card>
            <CardTitle hint="Sent privately to the developer">Feedback</CardTitle>
            <div className="mt-4 space-y-4">
              <label className="block text-sm font-medium">
                Category
                <select
                  value={category}
                  disabled={status === 'sending'}
                  onChange={(e) => setCategory(e.target.value)}
                  className="focus-ring mt-1.5 w-full rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
                >
                  {CATEGORIES.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium">
                Message *
                <textarea
                  value={message}
                  disabled={status === 'sending'}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={5}
                  className="focus-ring mt-1.5 w-full resize-y rounded-xl border subtle-border bg-surface-light px-4 py-3 text-sm dark:bg-surface-dark"
                  placeholder="Describe the issue or idea..."
                />
              </label>
              <label className="block text-sm font-medium">
                Email (optional)
                <input
                  type="email"
                  value={email}
                  disabled={status === 'sending'}
                  onChange={(e) => setEmail(e.target.value)}
                  className="focus-ring mt-1.5 w-full rounded-xl border subtle-border bg-surface-light px-3 py-2 text-sm dark:bg-surface-dark"
                  placeholder="you@example.com"
                />
              </label>
              {status === 'success' ? <p className="text-sm text-green-600 dark:text-green-400">Feedback sent successfully. Thank you.</p> : null}
              {status === 'error' ? <p className="text-sm text-red-600 dark:text-red-400">{errorText || 'Could not send feedback.'}</p> : null}
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    resetInputs();
                    setErrorText('');
                    setStatus('idle');
                    setOpen(false);
                  }}
                  disabled={status === 'sending'}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => void submit()}
                  disabled={status === 'sending' || !message.trim()}
                >
                  {status === 'sending' ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" aria-hidden />
                      Sending...
                    </span>
                  ) : 'Send Feedback'}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
