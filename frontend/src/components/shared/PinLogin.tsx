import React, { useState } from 'react';
import { Delete, RotateCcw } from 'lucide-react';

interface PinLoginProps {
  onSubmit: (pin: string) => void;
  isLoading?: boolean;
  error?: string;
}

const PinLogin: React.FC<PinLoginProps> = ({ onSubmit, isLoading = false, error }) => {
  const [pin, setPin] = useState<string>('');
  const PIN_LENGTH = 4;

  const handleDigit = (digit: string) => {
    if (pin.length < PIN_LENGTH) {
      const next = pin + digit;
      setPin(next);
      if (next.length === PIN_LENGTH) {
        // Auto-submit when PIN is complete
        setTimeout(() => onSubmit(next), 100);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
  };

  const digits = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

  return (
    <div className="flex flex-col items-center gap-6">
      {/* PIN dots */}
      <div className="flex gap-4">
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
              i < pin.length
                ? 'bg-indigo-600 border-indigo-600 scale-110'
                : 'bg-transparent border-gray-300'
            }`}
          />
        ))}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-sm text-rose-600 font-medium text-center">{error}</p>
      )}

      {/* Number pad */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {digits.slice(0, 9).map((d) => (
          <button
            key={d}
            onClick={() => handleDigit(d)}
            disabled={isLoading || pin.length >= PIN_LENGTH}
            className="h-14 text-xl font-semibold text-gray-800 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {d}
          </button>
        ))}

        {/* Row 4: Clear | 0 | Backspace */}
        <button
          onClick={handleClear}
          disabled={isLoading || pin.length === 0}
          className="h-14 flex items-center justify-center text-gray-500 hover:text-rose-600 hover:bg-rose-50 bg-gray-50 border border-gray-200 rounded-xl transition-all active:scale-95 disabled:opacity-30"
          title="Clear"
        >
          <RotateCcw className="w-5 h-5" />
        </button>

        <button
          key="0"
          onClick={() => handleDigit('0')}
          disabled={isLoading || pin.length >= PIN_LENGTH}
          className="h-14 text-xl font-semibold text-gray-800 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-gray-200 rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          0
        </button>

        <button
          onClick={handleBackspace}
          disabled={isLoading || pin.length === 0}
          className="h-14 flex items-center justify-center text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 bg-gray-50 border border-gray-200 rounded-xl transition-all active:scale-95 disabled:opacity-30"
          title="Backspace"
        >
          <Delete className="w-5 h-5" />
        </button>
      </div>

      {/* Loading indicator */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-indigo-600">
          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          Verifying PIN…
        </div>
      )}
    </div>
  );
};

export default PinLogin;
