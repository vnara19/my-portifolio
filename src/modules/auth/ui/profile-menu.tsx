"use client";
import { Menu } from "@base-ui/react/menu";
import { SignOutIcon, UserCircleIcon } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "../auth-client";
import { showAppToast } from "@/components/product/app-toaster";

export function ProfileMenu({name,email}:{name:string;email:string}) {
  const router=useRouter(); const [leaving,setLeaving]=useState(false);
  async function signOut(){
    setLeaving(true);
    try { const result=await authClient.signOut(); if(result.error)throw new Error(); router.replace("/entrar");router.refresh(); }
    catch {setLeaving(false);showAppToast({tone:"error",title:"Could not sign out. Please try again."});}
  }
  const item="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-xs outline-none data-highlighted:bg-primary/10 data-highlighted:text-primary";
  return <Menu.Root><Menu.Trigger aria-label="Account menu" className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/30 bg-primary/10 text-primary outline-none hover:bg-primary/20 focus-visible:ring-2 focus-visible:ring-ring/50"><UserCircleIcon size={23} weight="duotone" aria-hidden="true"/></Menu.Trigger>
    <Menu.Portal><Menu.Positioner side="bottom" align="end" sideOffset={8} className="z-50"><Menu.Popup className="w-[min(280px,calc(100vw-2rem))] rounded-2xl border border-border bg-card p-2 shadow-xl outline-none">
      <div className="min-w-0 border-b border-border px-3 py-3"><p className="truncate text-sm font-semibold">{name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{email}</p></div>
      <Menu.Item render={<Link href="/configuracao#account"/>} className={item}><UserCircleIcon size={16} aria-hidden="true"/>Account Settings</Menu.Item>
      <Menu.Item disabled={leaving} onClick={signOut} className={item}><SignOutIcon size={16} aria-hidden="true"/>{leaving?"Signing Out…":"Sign Out"}</Menu.Item>
    </Menu.Popup></Menu.Positioner></Menu.Portal>
  </Menu.Root>;
}
