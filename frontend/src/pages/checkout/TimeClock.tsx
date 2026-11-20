import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock3, Coffee, LogIn, LogOut, RefreshCw } from 'lucide-react';
import { errorMessage, timeOfDay } from '../../lib/business';
import { clockStaff, getOpenClock, type Employment, type TimeClockEvent } from '../../services/relationsService';
import { Dialog, LoadError, useData } from './WorkspaceUI';

const eventMessages: Record<TimeClockEvent, string> = {
  in: 'Clock-in recorded.', out: 'Clock-out recorded. Your timesheet is ready for review.',
  break_start: 'Break started.', break_end: 'Break ended.',
};

function elapsed(ms: number) {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export default function TimeClock({ branch, userId, timezone, profile, profileLoading, onRecorded }: {
  branch?: string; userId: string; timezone: string; profile?: Employment | null;
  profileLoading: boolean; onRecorded: () => void;
}) {
  const load = useCallback(() => getOpenClock(userId), [userId]);
  const clock = useData(load);
  const [now, setNow] = useState(Date.now);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [confirmShiftId, setConfirmShiftId] = useState<string>();
  const saving = useRef(false);
  const shift = clock.error ? undefined : clock.data;
  const onBreak = Boolean(shift?.break_start && !shift.break_end);
  const breakMs = shift?.break_start ? Math.max(0, (shift.break_end ? Date.parse(shift.break_end) : now) - Date.parse(shift.break_start)) : 0;
  const workMs = shift?.clock_in ? Math.max(0, now - Date.parse(shift.clock_in) - breakMs) : 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const { reload } = clock;
  useEffect(() => {
    window.addEventListener('focus', reload);
    return () => window.removeEventListener('focus', reload);
  }, [reload]);

  async function record(event: TimeClockEvent, expectedId = shift?.id ?? null) {
    if (saving.current || clock.loading || clock.error || (event === 'in' ? !branch : !expectedId)) return;
    if (event !== 'in' && expectedId !== shift?.id) {
      setConfirmShiftId(undefined);
      setError('The active shift changed. Check the time clock before trying again.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setMessage('');
    setError('');
    setConfirmShiftId(undefined);
    try {
      await clockStaff(branch ?? null, expectedId, event);
      setNow(Date.now());
      setMessage(eventMessages[event]);
      onRecorded();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      reload();
      saving.current = false;
      setBusy(false);
    }
  }

  return <section className="pos-panel pos-time-clock">
    <div className="pos-panel-bar"><div>
      <h2><Clock3 size={19} /> Time clock</h2>
      <p>{profile ? [profile.employee_number, profile.position].filter(Boolean).join(' · ') :
        profileLoading ? 'Loading employee record…' : 'Ask your administrator to set up your employee record.'}</p>
    </div>
      <div className="pos-row-actions">
        <span className={`pos-badge ${onBreak ? 'pos-tone-warn' : shift ? 'pos-tone-good' : 'pos-tone-neutral'}`}>
          {clock.error ? 'Unavailable' : clock.loading && clock.data === undefined ? 'Checking…' : onBreak ? 'On break' : shift ? 'On shift' : 'Off shift'}
        </span>
        <button type="button" className="pos-icon-button" aria-label="Refresh time clock" title="Refresh time clock" disabled={busy || clock.loading} onClick={reload}><RefreshCw size={15} /></button>
      </div>
    </div>
    <LoadError message={error || clock.error} retry={clock.error ? reload : undefined} />
    {message && <p className="pos-success" role="status">{message}</p>}
    {shift && <dl className="pos-time-clock-totals">
      <div><dt>Clocked in</dt><dd>{shift.clock_in ? timeOfDay(shift.clock_in, timezone) : '—'}</dd></div>
      <div><dt>Time worked</dt><dd>{elapsed(workMs)}</dd></div>
      <div><dt>Break time</dt><dd>{elapsed(breakMs)}</dd></div>
    </dl>}
    {!shift && profile && !branch && <p className="pos-time-clock-note">Ask your administrator to assign a branch before clocking in.</p>}
    <div className="pos-row-actions pos-time-clock-actions">
      {shift ? <>
        {!shift.break_end && <button className="pos-secondary" type="button" disabled={busy || clock.loading} onClick={() => void record(onBreak ? 'break_end' : 'break_start')}>
          <Coffee size={17} /> {onBreak ? 'End break' : 'Start break'}</button>}
        <button className="pos-primary" type="button" disabled={busy || clock.loading} onClick={() => setConfirmShiftId(shift.id)}><LogOut size={17} /> Clock out</button>
      </> : <button className="pos-primary" type="button" disabled={busy || clock.loading || !!clock.error || !profile || !branch}
        onClick={() => void record('in')}><LogIn size={17} /> Clock in</button>}
    </div>
    {confirmShiftId && <Dialog title="Clock out of this shift?" close={() => setConfirmShiftId(undefined)}>
      <div className="pos-dialog-form">
        <p>{onBreak ? 'This will end your break and close the shift.' : 'This will close the shift and send your timesheet for review.'}</p>
        <div className="pos-dialog-actions">
          <button type="button" className="pos-secondary" onClick={() => setConfirmShiftId(undefined)}>Keep shift open</button>
          <button type="button" className="pos-primary" disabled={clock.loading || busy || !!clock.error}
            onClick={() => void record('out', confirmShiftId)}>Confirm clock out</button>
        </div>
      </div>
    </Dialog>}
  </section>;
}
