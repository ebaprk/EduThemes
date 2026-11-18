import React,{cloneElement,createContext,isValidElement,useContext,useId,useImperativeHandle,useRef,useState} from 'react';
import {cn} from './lib/utils';
import {Button} from './components/button';
import {Alert,AlertDescription} from './components/alert';
import {Dialog,DialogContent,DialogTitle} from './components/dialog';
import {Tooltip,TooltipContent,TooltipTrigger,TooltipProvider} from './components/tooltip';
import {FieldContext} from './lib/field-context';

export function Field({controlId,className,children,...props}){
 const generated=useId();
 return <FieldContext.Provider value={controlId||generated}><div data-slot="field" className={cn('ui-field',className)} {...props}>{children}</div></FieldContext.Provider>;
}
export function FieldDescription({className,...props}){return <p data-slot="field-description" className={cn('text-sm text-muted-foreground',className)} {...props}/>}
export function ContextHelp({title='How this works',className,children,...props}){
 return <details data-slot="context-help" className={cn('ui-context-help',className)} {...props}><summary>{title}</summary><div className="ui-context-help-content">{children}</div></details>;
}
export function WorkbenchRow({className,...props}){return <div className={cn('workbench-row row',className)} {...props}/>}
export function WorkbenchColumn({className,sm,md,lg,xl,...props}){return <div className={cn('workbench-column',sm&&`workbench-sm-${sm}`,md&&`workbench-md-${md}`,lg&&`workbench-lg-${lg}`,xl&&`workbench-xl-${xl}`,className)} {...props}/>}
export function Notice({variant='default',dismissible,onClose,className,children,role='alert',...props}){
 return <Alert variant={['danger','destructive'].includes(variant)?'destructive':'default'} data-intent={variant} role={role} className={cn('ui-notice',className)} {...props}><AlertDescription>{children}</AlertDescription>{dismissible&&<Button size="icon" variant="ghost" aria-label="Dismiss message" onClick={onClose} className="ui-notice-close">×</Button>}</Alert>;
}
export function HelpTooltip({children,content,placement='top',delay,...props}){
 const node=typeof content==='function'?content({}):content;
 const child=isValidElement(children)&&typeof children.type==='string'&&!['button','a','input','select','textarea'].includes(children.type)?cloneElement(children,{tabIndex:children.props.tabIndex??0}):children;
 return <TooltipProvider delayDuration={typeof delay==='number'?delay:delay?.show??300}><Tooltip><TooltipTrigger asChild>{child}</TooltipTrigger>{isValidElement(node)&&node.type===TooltipContent?cloneElement(node,{side:placement}):<TooltipContent side={placement}>{node}</TooltipContent>}</Tooltip></TooltipProvider>;
}
// Bridges the two participant dialogs' existing imperative open/close calls to
// the same shadcn/Radix focus containment used by controlled researcher dialogs.
export function ManagedDialog({ref,onClose,onCancel,children,className,...props}){
 const [open,setOpen]=useState(false),content=useRef(null),opener=useRef(null);
 const close=()=>{if(open){setOpen(false);onClose?.();}};
 useImperativeHandle(ref,()=>({showModal(){opener.current=document.activeElement;setOpen(true);},close,querySelector:selector=>content.current?.querySelector(selector),get open(){return open;}}));
 return <Dialog open={open} onOpenChange={next=>{if(!next)close();else setOpen(true);}}><DialogContent ref={content} className={cn('ui-managed-dialog',className)} showCloseButton={false} onEscapeKeyDown={onCancel} onOpenAutoFocus={event=>{const field=content.current?.querySelector('input');if(field){event.preventDefault();field.focus();}}} onCloseAutoFocus={event=>{event.preventDefault();if(opener.current?.isConnected)opener.current.focus();}} {...props}><DialogTitle className="sr-only">{props['aria-label']||'Study access'}</DialogTitle>{children}</DialogContent></Dialog>;
}
