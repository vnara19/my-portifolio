"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { MIN_PASSWORD_LENGTH, PASSWORD_REQUIREMENTS, passwordPolicyError } from "../password-policy";
import { authClient } from "../auth-client";
import { inputClass, primaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

/** Credentials are submitted only to the authentication service; never to portfolio mutations. */
export function AccountPanel({email}:{name:string;email:string}) {
  const router=useRouter();const [busy,setBusy]=useState<"email"|"password"|null>(null);
  const [message,setMessage]=useState<{ok:boolean;text:string}|null>(null);
  async function save(event:FormEvent<HTMLFormElement>,kind:"email"|"password"){
    event.preventDefault();const form=event.currentTarget;const values=new FormData(form);setBusy(kind);setMessage(null);
    try {
      const currentPassword=String(values.get("currentPassword")??"");
      if(kind==="email"){
        const result=await authClient.$fetch("/account-email",{method:"POST",body:{newEmail:String(values.get("newEmail")??""),currentPassword}});
        if(result.error){setMessage({ok:false,text:result.error.message??"Could not change email."});return;}
        form.reset();router.replace("/entrar?updated=email");router.refresh();
      }else{
        const newPassword=String(values.get("newPassword")??"");
        const policyError=passwordPolicyError(newPassword);if(policyError){setMessage({ok:false,text:policyError});return;}
        if(newPassword!==values.get("confirmPassword")){setMessage({ok:false,text:"The new passwords do not match."});return;}
        const result=await authClient.changePassword({currentPassword,newPassword,revokeOtherSessions:true});
        if(result.error){setMessage({ok:false,text:result.error.message??"Could not change password."});return;}
        form.reset();setMessage({ok:true,text:"Password changed. Other sessions have been signed out."});router.refresh();
      }
    }catch{setMessage({ok:false,text:"Could not update your account. Please try again."});}
    finally{setBusy(null);}
  }
  return <section id="account" className="premium-panel scroll-mt-36 rounded-[24px] p-5 sm:p-6" aria-labelledby="account-title">
    <h2 id="account-title" className="text-base font-semibold">Account Settings</h2>
    <p className="mt-2 break-all text-xs text-muted-foreground">{email}</p>
    <div className="mt-5 grid gap-6 sm:grid-cols-2">
      <form onSubmit={e=>save(e,"email")} className="space-y-3"><h3 className="text-sm font-medium">Change Email</h3>
        <label className="grid gap-1.5 text-xs">New Email<input className={inputClass} name="newEmail" type="email" autoComplete="email" maxLength={254} required/></label>
        <label className="grid gap-1.5 text-xs">Current Password<input className={inputClass} name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required/></label>
        <p className="text-xs leading-5 text-muted-foreground">You will sign in again with your new email. Your portfolio stays in this account.</p>
        <button className={primaryButtonClass} disabled={busy!==null}>{busy==="email"?"Saving…":"Change Email"}</button>
      </form>
      <form onSubmit={e=>save(e,"password")} className="space-y-3"><h3 className="text-sm font-medium">Change Password</h3>
        <label className="grid gap-1.5 text-xs">Current Password<input className={inputClass} name="currentPassword" type="password" autoComplete="current-password" maxLength={128} required/></label>
        <label className="grid gap-1.5 text-xs">New Password<input className={inputClass} name="newPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={128} required/></label>
        <label className="grid gap-1.5 text-xs">Confirm New Password<input className={inputClass} name="confirmPassword" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} maxLength={128} required/></label>
        <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS}</p>
        <button className={primaryButtonClass} disabled={busy!==null}>{busy==="password"?"Saving…":"Change Password"}</button>
      </form>
    </div>
    {message?<p role={message.ok?"status":"alert"} className={`mt-4 text-xs ${message.ok?"text-primary":"text-destructive"}`}>{message.text}</p>:null}
  </section>;
}
