"use client";
import { CircleNotchIcon } from "@phosphor-icons/react/dist/ssr";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/modules/auth/auth-client";
import { Field, inputClass, primaryButtonClass } from "@/modules/portfolio/ui/edit-dialogs";

/** Account provisioning stays server-side while public email ownership verification is unavailable. */
export function SignInForm({redirectTo}:{redirectTo:string}){
 const router=useRouter();const [pending,setPending]=useState(false);const [error,setError]=useState<string|null>(null);
 async function submit(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const form=new FormData(event.currentTarget);const email=String(form.get("email")??"").trim();const password=String(form.get("password")??"");
  if(!email||!password){setError("Enter your email and password.");return;}
  setPending(true);setError(null);
  try{const result=await authClient.signIn.email({email,password});if(result.error){setError(result.error.status===429?"Too many attempts. Wait a moment and try again.":"Incorrect email or password.");return;}router.replace(redirectTo);router.refresh();}
  catch{setError("Could not sign in right now. Please try again.");}finally{setPending(false);}
 }
 return <form onSubmit={submit} className="space-y-4">
 <Field label="Email"><input aria-label="Email" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254} required className={inputClass}/></Field>
 <Field label="Password"><input aria-label="Password" name="password" type="password" autoComplete="current-password" maxLength={128} required className={inputClass}/></Field>
 {error?<p role="alert" className="text-xs leading-relaxed text-destructive">{error}</p>:null}
 <button type="submit" disabled={pending} className={`${primaryButtonClass} w-full`}>{pending?<CircleNotchIcon aria-hidden="true" size={14} className="animate-spin"/>:null}Sign In</button>
 </form>;
}
