import { createRoot } from 'react-dom/client';
import AuthLayout from './components/layout/AuthLayout';
import './index.css';

const root = createRoot(document.getElementById('root')!);
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || import.meta.env.VITE_SUPABASE_ANON_KEY?.trim());

function showStartupError(message: string) {
  root.render(
    <AuthLayout>
      <h2 className="text-lg font-semibold text-gray-900">Setup required</h2>
      <p role="alert" className="mt-2 text-sm text-gray-600">{message}</p>
    </AuthLayout>
  );
}

if (!url || !key) {
  showStartupError('Configure the Supabase URL and publishable key to sign in.');
} else {
  import('./App')
    .then(({ default: App }) => root.render(<App />))
    .catch((error: unknown) => {
      console.error(error);
      showStartupError('The app could not start. Check the Supabase configuration and reload.');
    });
}
