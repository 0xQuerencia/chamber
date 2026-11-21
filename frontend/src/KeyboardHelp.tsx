import {useEffect,useRef} from "react";
import {Keyboard,X} from "lucide-react";
import {shortcuts,type ShortcutDef} from "./keyboard";

export default function KeyboardHelp({onClose}:{onClose:()=>void}){
 const close=useRef<HTMLButtonElement>(null);
 const previous=useRef<HTMLElement|null>(null);
 useEffect(()=>{
  previous.current=document.activeElement instanceof HTMLElement?document.activeElement:null;
  close.current?.focus();
  return()=>previous.current?.focus();
 },[]);
 const groups:ShortcutDef["group"][]=["Global","Go to","Registers","Forms"];
 return <div className="keyboard-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
   <section className="keyboard-dialog" role="dialog" aria-modal="true" aria-label="Chamber keyboard shortcut guide"
    onKeyDown={e=>{if(e.key==="Escape"){e.preventDefault();onClose()}
     if(e.key!=="Tab")return;
     const els=e.currentTarget.querySelectorAll<HTMLElement>("button:not([disabled]),[href],input:not([disabled])");
     if(!els.length)return;
     const first=els[0],last=els[els.length-1];
     if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
     else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }}>
    <header><div><Keyboard size={19}/><span><h2>Keyboard shortcuts</h2><p>Everything you need to operate the Chamber registers.</p></span></div>
      <button ref={close} onClick={onClose} type="button" aria-label="Close shortcut guide"><X size={19}/></button></header>
    <div className="keyboard-guide">
      {groups.map(group=><section key={group}>
       <h3>{group}</h3>
       <div className="keyboard-rows">{shortcuts.filter(s=>s.group===group).map(s=><div key={s.key} className="keyboard-entry">
        <kbd>{s.key}</kbd><span><strong>{s.label}</strong><small>{s.description}</small></span>
       </div>)}</div>
      </section>)}
    </div>
    <footer>Use <kbd>Esc</kbd> to close this guide. Shortcuts do not intercept normal typing in forms.</footer>
   </section>
 </div>;
}
