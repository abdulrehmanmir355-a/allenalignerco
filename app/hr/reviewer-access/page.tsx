import {redirect} from 'next/navigation';
import {currentHR} from '@/app/lib/hr-auth';
import HRWorkspace from '@/app/components/hr-workspace';
import ReviewerAccessPanel from './reviewer-access-panel';
import '../../clinical/review.css';
export const dynamic='force-dynamic';
export default async function Page(){const a=await currentHR();if(!a)redirect('/hr/login');if(!['HR_ADMIN','HR_OFFICER','HR_VIEWER'].includes(a.role))return <main className="clinical"><h1>Reviewer Access</h1><p>HR permission required.</p></main>;return <HRWorkspace><ReviewerAccessPanel/></HRWorkspace>;}
