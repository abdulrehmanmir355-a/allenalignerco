import { hrScope } from '../../../lib/hr-scope';
import { redirect, notFound } from "next/navigation";
import { currentHR } from "../../../lib/hr-auth";
import { db } from "../../../lib/database";
import { hrRows, hrSchemas, type HRSection } from "../../../lib/hr-management";
import ManagementEditor, { type Field } from "../../../components/management-editor";
const titles:Record<HRSection,string>={employees:'Employee Profiles and IDs',departments:'Department Management',designations:'Designation Management',attendance:'Attendance',leave:'Leave Management',onboarding:'Employee Onboarding',offboarding:'Employee Offboarding',assets:'Asset Clearance',clearance:'Department Clearance',users:'HR Roles and Permissions',reports:'HR Reports'};
export default async function Page({params,searchParams}:{params:Promise<{section:string}>;searchParams:Promise<{employeeId?:string}>}){
 const hr=await currentHR();if(!hr)redirect('/hr/login');const {section:s}=await params;if(!(s in hrSchemas)&&s!=='reports')notFound();const section=s as HRSection;
 if(section==='users'&&hr.role!=='HR_ADMIN')return <main className="container section"><h1>Administrator access required</h1></main>;
 const scope=hrScope(hr);
 const employees=await db.query(scope.sql+'SELECT id,"employeeCode","fullName" FROM "Employee" ORDER BY "fullName" LIMIT 500',scope.args);
 const exits=await db.query(scope.sql+`SELECT o.id,e."fullName" FROM "EmployeeOffboarding" o JOIN "Employee" e ON e.id=o."employeeId" WHERE o.status NOT IN ('COMPLETED','CANCELLED') LIMIT 500`,scope.args);
 const requestedEmployee=(await searchParams).employeeId;
 const selectedEmployee=employees.find(e=>e.id===requestedEmployee);
 const employee:Field={defaultValue:selectedEmployee?String(selectedEmployee.id):undefined,name:'employeeId',label:'Employee',options:employees.map(e=>({value:e.id,label:e.employeeCode+' · '+e.fullName}))};
 const exit:Field={name:'offboardingId',label:'Offboarding record',options:exits.map(e=>({value:e.id,label:e.fullName+' · '+e.id}))};
 const field=(name:string,label:string,type='text'):Field=>({name,label,type});const select=(name:string,label:string,values:string[]):Field=>({name,label,options:values.map(value=>({value,label:value.replaceAll('_',' ')}))});
 const rows=await hrRows(section,hr);
 const [departments,designations]=section==='employees'?await Promise.all([db.query('SELECT name FROM "HRDepartment" ORDER BY name'),db.query('SELECT name FROM "HRDesignation" ORDER BY name')]):[[],[]];
 const fields:Record<HRSection,Field[]>={
 departments:[field('name','Department name')],designations:[field('name','Designation name')],
 attendance:[employee,field('day','Date','date'),select('status','Attendance',['PRESENT','ABSENT','REMOTE','HOLIDAY'])],
 leave:[employee,field('startDate','From','date'),field('endDate','Through','date'),field('reason','Reason')],
 onboarding:[employee,field('task','Onboarding task')],
 offboarding:[employee,select('exitType','Exit type',['RESIGNATION','TERMINATION','RETIREMENT','CONTRACT_END']),field('lastWorkingDay','Last working day','date'),field('reason','Reason')],
 assets:[exit,field('assetName','Asset name'),field('assetCode','Asset code')],clearance:[exit,field('department','Department'),{...field('remarks','Remarks'),required:false}],
 employees:[{...employee,name:'id'},field('fullName','Full name'),field('email','Email','email'),select('department','Department',departments.map(row=>String(row.name))),select('designation','Designation',designations.map(row=>String(row.name))),field('joinedOn','Joining date','date')],
 users:[{name:'id',label:'Account',options:rows.map(u=>({value:String(u.id),label:String(u.email)}))},select('role','Role',['HR_ADMIN','HR_OFFICER','HR_VIEWER']),select('isActive','Active',['true','false'])],reports:[]};
 const transitions:Partial<Record<HRSection,string[]>>={leave:['APPROVED','REJECTED'],onboarding:['COMPLETED'],offboarding:['COMPLETED','CANCELLED'],assets:['RETURNED'],clearance:['CLEARED','BLOCKED']};
 return <main className="container section"><h1>{titles[section]}</h1>{section==='employees'&&<p>Employee IDs are generated once and remain unchanged. Employment status follows the offboarding workflow.</p>}{section==='reports'&&<p>Current employee totals by department and employment status.</p>}{selectedEmployee&&<p>Selected employee: <a href={'/hr/employees/'+encodeURIComponent(String(selectedEmployee.id))}>{String(selectedEmployee.employeeCode)} · {String(selectedEmployee.fullName)}</a></p>}<ManagementEditor employeeLinks={['employees','attendance','leave','onboarding','offboarding'].includes(section)} endpoint={'/api/hr/manage/'+section} fields={fields[section]} records={JSON.parse(JSON.stringify(rows))} transitions={transitions[section]} canWrite={hr.role!=='HR_VIEWER'}/></main>;
}
