import { useState, type FormEvent } from 'react';
import AuthLayout from '../layout/AuthLayout';
import { authError, PasswordField } from './AuthFields';

export default function SignIn({ login, isLoading, onRequestAccess, onReset }: {
  login: (email: string, password: string) => Promise<void>;
  isLoading: boolean;
  onRequestAccess: () => void;
  onReset: () => void;
}) {
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    setError('');
    const fields = new FormData(event.currentTarget);
    try {
      await login(String(fields.get('email')), String(fields.get('password')));
    } catch (cause) { setError(authError(cause)); }
  }

  return <AuthLayout>
    <h2>Sign in</h2>
    <p className="auth-intro">Open your Kelvin’s POS workspace.</p>
    <form onSubmit={submit} className="auth-form">
      <label className="auth-field">Email
        <input name="email" type="email" autoComplete="username" maxLength={254} required />
      </label>
      <PasswordField name="password" autoComplete="current-password" required />
      <button type="button" className="auth-link auth-forgot" onClick={onReset}>Forgot password?</button>
      {error && <p role="alert" className="auth-error">{error}</p>}
      <button className="auth-submit" disabled={isLoading}>{isLoading ? 'Signing in…' : 'Sign in'}</button>
    </form>
    <div className="auth-footer">New staff member? <button type="button" className="auth-link" onClick={onRequestAccess}>Create an account</button></div>
  </AuthLayout>;
}
