import {redirect} from 'next/navigation';
import {logoutLocalModule,type LocalModule} from '@/app/lib/local-module-auth';
export default function LocalModuleLogout({module}:{module:LocalModule}){
 async function signOut(){'use server';await logoutLocalModule(module);redirect('/finance/login');}
 return <form action={signOut}><button type="submit">Sign out</button></form>;
}
