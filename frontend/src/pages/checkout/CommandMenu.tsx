import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Search, type LucideIcon } from 'lucide-react';
import { Dialog } from './WorkspaceUI';

export interface WorkspaceCommand {
  key: string;
  title: string;
  group: string;
  icon: LucideIcon;
  keywords?: string;
  run: () => void;
}

export default function CommandMenu({ commands, close }: { commands: WorkspaceCommand[]; close: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = commands.filter(command => terms.every(term =>
    `${command.title} ${command.group} ${command.keywords ?? ''}`.toLowerCase().includes(term)));
  const selected = Math.min(active, Math.max(0, matches.length - 1));

  function run(command: WorkspaceCommand) {
    close();
    command.run();
  }

  return <Dialog title="Jump to" close={close} className="pos-command">
    <form onSubmit={event => {
      event.preventDefault();
      if (matches[selected]) run(matches[selected]);
    }}>
      <label className="pos-command-search">
        <Search size={20} aria-hidden="true" />
        <input ref={input} type="text" role="combobox" aria-label="Find a page or action" aria-expanded={true}
          aria-autocomplete="list" aria-controls="workspace-commands"
          aria-activedescendant={matches[selected] ? `workspace-command-${matches[selected].key}` : undefined}
          placeholder="Find a page or action…" value={query}
          onChange={event => { setQuery(event.target.value); setActive(0); }}
          onKeyDown={event => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (matches[selected]) run(matches[selected]);
              return;
            }
            if (!matches.length || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
            event.preventDefault();
            const next = (selected + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
            setActive(next);
            document.getElementById(`workspace-command-${matches[next].key}`)?.scrollIntoView({ block: 'nearest' });
          }} />
      </label>
      <ul id="workspace-commands" role="listbox" aria-label="Matching actions" className="pos-command-results">
        {matches.map((command, index) => <li key={command.key} id={`workspace-command-${command.key}`}
          role="option" aria-selected={index === selected} onMouseEnter={() => setActive(index)}
          onMouseDown={event => event.preventDefault()} onClick={() => run(command)}>
          <span className="pos-command-icon"><command.icon size={17} aria-hidden="true" /></span>
          <span><strong>{command.title}</strong><small>{command.group}</small></span>
          <ArrowUpRight size={15} aria-hidden="true" />
        </li>)}
      </ul>
      {!matches.length && <p role="status" className="pos-command-empty">No actions match your search.</p>}
      <div className="pos-command-footer"><span><kbd>↑</kbd> <kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>
    </form>
  </Dialog>;
}
