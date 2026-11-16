"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
export default function DoctorProfileForm({fullName,phone,updatedAt}:{fullName:string;phone:string|null;updatedAt:string}) {
 const router=useRouter();
 const [version,setVersion]=useState(updatedAt), [busy,setBusy]=useState(false), [message,setMessage]=useState(""), [error,setError]=useState(false);
 async function save(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();if(busy)return;setBusy(true);setMessage("");setError(false);
  const fields=Object.fromEntries(new FormData(event.currentTarget));
  try { const response=await fetch("/api/portal/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({...fields,updatedAt:version})});
   const result=await response.json();if(!response.ok)throw new Error(result.message || "Unable to save profile.");
   setVersion(result.profile.updatedAt);setMessage("Your profile has been saved.");router.refresh();
  } catch(e){setError(true);setMessage(e instanceof Error?e.message:"Unable to save. Please try again.");} finally{setBusy(false);}
 }
 return <form className="form-stack" onSubmit={save}><fieldset disabled={busy} className="portal-fieldset"><div className="form-grid"><label>Full name<input name="fullName" defaultValue={fullName} autoComplete="name" required minLength={2} maxLength={150}/></label><label>Phone number<input name="phone" type="tel" defaultValue={phone??""} autoComplete="tel" maxLength={30}/></label></div><button className="button" disabled={busy}>{busy?"Saving…":"Save profile"}</button></fieldset>{message&&<p className="notice" role={error?"alert":"status"}>{message}</p>}</form>;
}
