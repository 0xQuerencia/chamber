import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowRight, Check, Command, CornerDownLeft, Search, X } from "lucide-react";
import { animate, createScope } from "animejs";

export interface CommandOption {
  id: string;
  group: "Navigate" | "Assignments" | "Clients" | "Documents" | "Actions";
  title: string;
  hint?: string;
  keywords?: string;
  onSelect: () => void;
}
export default function CommandPalette({ options, onClose }: { options: CommandOption[]; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const scope = useRef<HTMLDivElement>(null);
  const [term, setTerm] = useState("");
  const [active, setActive] = useState(0);
  const result = useMemo(() => {
    const q = term.trim().toLocaleLowerCase();
    return (q ? options.filter(o => [o.title, o.hint, o.keywords, o.group].join(" ").toLocaleLowerCase().includes(q)) : options)
      .slice(0, 14);
  }, [options, term]);
  useEffect(() => setActive(0), [term]);
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    input.current?.focus();
    if (scope.current && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const animationScope = createScope({ root: scope.current }).add(() => {
        animate(".command-dialog", { opacity: [0, 1], y: [-7, 0], duration: 180, ease: "out(3)" });
      });
      return () => { animationScope.revert(); before?.focus(); };
    }
    return () => before?.focus();
  }, []);
  function choose(option: CommandOption) {
    onClose();
    option.onSelect();
  }
  function keyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); }
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => (i + 1) % Math.max(1, result.length)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setActive(i => (i - 1 + Math.max(1, result.length)) % Math.max(1, result.length)); }
    if (e.key === "Enter" && result[active]) { e.preventDefault(); choose(result[active]); }
  }
  return <div className="command-overlay" ref={scope} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="command-dialog" role="dialog" aria-modal="true" aria-label="Search Chamber">
      <div className="command-input-wrap">
        <Search size={19} aria-hidden="true"/>
        <input ref={input} value={term} placeholder="Search work, clients, documents, pages…" role="combobox" aria-autocomplete="list"
          aria-expanded="true" aria-controls="command-results" aria-activedescendant={result[active] ? "command-" + result[active].id : undefined}
          onChange={e=>setTerm(e.target.value)} onKeyDown={keyDown}/>
        <button aria-label="Close search" onClick={onClose}><X size={18}/></button>
      </div>
      <div className="command-scroll" role="listbox" id="command-results" aria-label="Search results">
        {result.length === 0 && <div className="command-empty"><Command size={24}/><strong>No matching records</strong><span>Try a client name, work title or service.</span></div>}
        {result.map((item, i) => {
          const isFirstGroup = i === 0 || result[i-1].group !== item.group;
          return <div key={item.id}>
            {isFirstGroup && <div className="command-group-title">{item.group}</div>}
            <button type="button" id={"command-" + item.id} role="option" aria-selected={active === i}
              className={"command-option " + (active === i ? "selected" : "")}
              onMouseEnter={() => setActive(i)} onClick={() => choose(item)}>
              <span className="command-row-icon">{item.group === "Navigate" ? <ArrowRight size={15}/> : item.group === "Actions" ? <Check size={15}/> : <Search size={14}/>}</span>
              <span className="command-row-text"><strong>{item.title}</strong>{item.hint && <small>{item.hint}</small>}</span>
              {active === i && <CornerDownLeft size={14} className="command-enter"/>}
            </button>
          </div>;
        })}
      </div>
      <div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span><span><kbd>↵</kbd> Open</span><span><kbd>esc</kbd> Close</span><span className="command-watermark">CHAMBER</span></div>
    </div>
  </div>;
}
