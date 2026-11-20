import { useState, type FormEvent } from 'react';
import AuthLayout from '../layout/AuthLayout';
import { authService } from '../../services/authService';
import { authError, PasswordField } from './AuthFields';

export default function StaffRequest({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get('name')).trim();
    const password = String(form.get('password'));
    if (!name || password !== form.get('confirm')) {
      setError(!name ? 'Enter your full name.' : 'The passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await authService.register(String(form.get('email')), password, name);
      setSubmitted(true);
    } catch (cause) {
      setError(authError(cause));
    } finally {
      setBusy(false);
    }
  }

  return <AuthLayout>
    <h2>Create a staff account</h2>
    {submitted ? <p className="auth-success" role="status">Account created. Your administrator can now approve your access. Sign in once they assign your role.</p> : <>
      <p className="auth-intro">Your administrator will approve your workspace access.</p>
      <form onSubmit={submit} className="auth-form">
        <label className="auth-field">Full name<input name="name" autoComplete="name" maxLength={120} required /></label>
        <label className="auth-field">Work email<input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
        <PasswordField name="password" autoComplete="new-password" minLength={8} maxLength={72} required />
        <PasswordField name="confirm" label="Confirm password" autoComplete="new-password" minLength={8} maxLength={72} required />
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
      </form>
    </>}
    <div className="auth-footer"><button type="button" className="auth-link" disabled={busy} onClick={onBack}>Back to sign in</button></div>
  </AuthLayout>;
}
