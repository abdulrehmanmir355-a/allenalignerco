import DoctorLoginForm from "./doctor-login-form";
export default async function DoctorLoginPage({searchParams}:{searchParams:Promise<{clinicSetup?:string;clinicInvite?:string}>}){const params=await searchParams;return <DoctorLoginForm clinicSetup={params.clinicSetup==="1"} clinicInvite={params.clinicInvite||""}/>}
