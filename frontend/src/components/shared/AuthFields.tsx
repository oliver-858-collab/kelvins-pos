import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function authError(error: unknown) {
  if (typeof error !== 'object' || error === null) return 'Something went wrong. Try again.';
  const code = 'code' in error ? error.code : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  if (message === 'ACCOUNT_PENDING') return 'Your account is waiting for administrator approval.';
  if (message === 'ACCOUNT_SUSPENDED') return 'Your workspace access is suspended. Contact your administrator.';
  if (message === 'PROFILE_MISSING' || message === 'ROLE_MISSING') return 'Your account needs a staff profile and role. Contact your administrator.';
  if (code === 'registration_unavailable') return 'Signup is temporarily unavailable. Try again shortly.';
  if (code === 'invalid_signup') return 'Check your name and email address.';
  if (message === 'ACCOUNT_EXISTS' || code === 'user_already_exists' || code === 'email_exists') {
    return 'An account already uses that email. Sign in or reset your password.';
  }
  if (code === 'invalid_credentials') return 'The email or password is incorrect. Check both or reset your password.';
  if (code === 'email_not_confirmed') return 'This older account is still awaiting activation. Contact your administrator.';
  if (code === 'weak_password') return 'Use a stronger password with at least eight characters and no more than 72 bytes.';
  if (code === 'same_password') return 'Choose a different password from the current one.';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit' || ('status' in error && error.status === 429)) {
    return 'Too many attempts. Wait a few minutes before retrying.';
  }
  if (code === 'signup_disabled') return 'Staff signup is closed. Contact your administrator.';
  if (message && /fetch|network|load failed/i.test(message)) return 'The connection was interrupted. Check your connection and try again.';
  return 'The request could not be completed. Try again.';
}

export function PasswordField({ label = 'Password', ...props }: ComponentProps<'input'> & { label?: string }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field">
    {label}
    <span className="auth-password">
      <input {...props} type={visible ? 'text' : 'password'} />
      <button type="button" onClick={() => setVisible(value => !value)} aria-label={visible ? 'Hide password' : 'Show password'}>
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </span>
  </label>;
}
