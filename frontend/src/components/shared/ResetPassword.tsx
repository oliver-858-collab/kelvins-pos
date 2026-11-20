import { useState, type FormEvent } from 'react';
import AuthLayout from '../layout/AuthLayout';
import { authService } from '../../services/authService';
import { authError, PasswordField } from './AuthFields';

export default function ResetPassword({ onBack, change = false }: { onBack: () => void; change?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      if (change) {
        const password = String(form.get('password'));
        if (password !== form.get('confirm')) {
          setError('The passwords do not match.');
          return;
        }
        await authService.updatePassword(password);
        await authService.logout();
        onBack();
      } else {
        await authService.resetPassword(String(form.get('email')).trim().toLowerCase());
        setSent(true);
      }
    } catch (cause) {
      setError(authError(cause));
    } finally {
      setBusy(false);
    }
  }

  return <AuthLayout>
    <h2>{change ? 'Choose a new password' : 'Reset password'}</h2>
    {sent ? <p className="auth-success" role="status">If the email is registered, a password reset link will be sent to it.</p> :
      <form className="auth-form" onSubmit={submit}>
        {change ? <>
          <PasswordField name="password" label="New password" autoComplete="new-password" minLength={8} maxLength={72} required />
          <PasswordField name="confirm" label="Confirm new password" autoComplete="new-password" minLength={8} maxLength={72} required />
        </> : <label className="auth-field">Work email<input name="email" type="email" autoComplete="email" required /></label>}
        {error && <p role="alert" className="auth-error">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy ? 'Working…' : change ? 'Save password' : 'Send reset link'}</button>
      </form>}
    <div className="auth-footer"><button type="button" className="auth-link" disabled={busy} onClick={onBack}>Back to sign in</button></div>
  </AuthLayout>;
}
