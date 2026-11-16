import LocalModuleLogin from '@/app/components/local-module-login';
export const dynamic='force-dynamic';
export default function Login({searchParams}:{searchParams:Promise<{error?:string}>}){return <LocalModuleLogin module="finance" searchParams={searchParams}/>;}
