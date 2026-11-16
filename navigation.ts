export type SessionNavigation = { doctor: boolean; hr: boolean; clinic: boolean; owner?: boolean; clinicalRole: 'REVIEWER'|'LEAD'|'ADMIN'|null };
export function navigationGroups(session: SessionNavigation) {
 const signedIn=session.doctor||session.hr||session.clinic||session.owner;
 const dashboardHref=session.owner?'/owner/command-center':session.hr?'/hr/offboarding/dashboard':session.clinic?'/clinic/dashboard':session.doctor?'/doctor-dashboard':'/';
 const account: string[][] = [];
 if(session.doctor) account.push(['/doctor-dashboard/profile','Doctor Profile'],['/doctor-dashboard/settings','Doctor Settings']);
 if(session.clinic) account.push(["/clinic/manage/profile","Clinic Profile"],["/clinic/manage/settings","Clinic Settings"]);
 if(session.hr) account.push(['/hr/settings','HR Profile and Settings']);
 if(!session.doctor && !session.hr && !session.clinic) account.push(['/doctor-login','Doctor Login'],['/hr/login','HR Login'],['/owner-login','Owner Portal Login']);
 else if (!session.hr) account.push(['/hr/login','HR Login'],['/owner-login','Owner Portal Login']);
 const hrLinks: string[][] = session.hr ? [['/hr/offboarding/dashboard','HR Dashboard'],['/hr/employees/directory','Employee Directory'],['/hr/employees/new','Add Employee'],['/hr/documents','Employee Documents'],['/hr/offboarding','Offboarding'],['/hr/payroll','Finance · Payroll'],['/hr/payroll/payslips','Employee Payslips'],['/hr/suppliers','Supplier Management'],['/hr/performance','Work & Performance'],['/hr/employee-access','Employee Registration Access']] : signedIn ? [['/hr/offboarding/dashboard','HR Workspace']] : [['/hr/login','HR Login'],['/hr/register','HR Registration']];
 if(session.hr) hrLinks.push(['/hr/invitations','Employee Registration Invitations'],['/hr/reviewer-access','Reviewer Access · HR Codes']);
 if(session.hr) hrLinks.push(['/hr/owner-invitations','Owner Registration Invitations']);
 return [
  {id:'doctors',label:'For Doctors',links:session.doctor ? [['/doctor-dashboard','Doctor Dashboard'],['/doctor-dashboard/cases','Assigned Cases and History'],['/doctor-dashboard/communication','Case Communication'],['/doctor-dashboard/notifications','Notifications'],['/doctor-dashboard/documents','Documents']] : signedIn ? [['/for-doctors','Doctor Overview'],['/doctor-dashboard','Doctor Workspace']] : [['/for-doctors','Doctor Overview'],['/doctor-login','Doctor Login'],['/doctor-register','Doctor Registration']]},
  {id:'clinical',label:'Internal Clinical Review',links:[['/clinical','Clinical Dashboard'],['/clinical/login','Internal Login'],['/clinical/register','Internal Registration'],...(session.clinicalRole?[['/clinical/communications','Case Communication']]:[]),...(session.clinicalRole==='LEAD'||session.clinicalRole==='ADMIN'?[['/clinical/assignment-board','Planning Queue']]:[])]},
  {id:'clinic',label:'Clinic Management',links:session.clinic ? [['/clinic/dashboard','Clinic Dashboard'],['/clinic/manage/profile','Clinic Profile'],['/clinic/manage/staff','Clinic Staff'],['/clinic/manage/users','Users and Permissions'],['/clinic/patient-master','Patient Master'],['/clinic/manage/patients','Patient Records'],['/clinic/manage/appointments','Appointments'],['/clinic/manage/cases','Doctors and Cases'],['/clinic/manage/documents','Clinic Documents']] : session.doctor ? [['/clinic/dashboard','Clinic Dashboard'],['/clinic/patients','Patient Records'],['/clinic/team','Clinic Doctors'],['/clinic/assignments','Assigned Cases']] : signedIn ? [['/clinic/dashboard','Clinic Workspace']] : [['/clinic-login','Clinic Login'],['/clinic-register','Clinic Registration']]},
  {id:'hr',label:'HR Management',links:hrLinks},
  {id:'dashboard',label:'Dashboard',links:[[dashboardHref,'Open dashboard']]},
  {id:'crm',label:'CRM',links:session.clinic?[['/clinic/patient-master','Patient and customer records'],['/clinic/manage/staff','Clinic contacts']]:session.doctor?[['/doctor-dashboard/patients','Patient records'],['/doctor-dashboard/clinic','Connected practice']]:[['/clinic-login','Clinic sign in']]},
  {id:'orders',label:'Orders Management',links:session.clinic?[['/clinic/manage/cases','Assigned cases'],['/clinic/manage/appointments','Appointments']]:session.doctor?[['/doctor-dashboard/cases','Case pipeline'],['/doctor-dashboard/history','Case history']]:[['/doctor-login','Doctor sign in']]},
  {id:'production',label:'Production Management',links:[['/production','Production dashboard'],['/lab','Laboratory case workspace']]},
  {id:'quality',label:'Quality Management',links:[['/quality','Quality dashboard'],['/quality/complaints','Complaint management'],['/lab','Production QC · Assigned cases'],['/capa','CAPA management']]},
  {id:'capa',label:'CAPA Management',links:[['/capa','CAPA register']]},
  {id:'audit',label:'Audit Management',links:session.hr?[['/quality/audits','Internal audit register'],['/hr/employees/history','Employee audit history']]:session.clinicalRole==='ADMIN'?[['/clinical/admin/audit','Clinical audit log']]:[['/hr/login','Audit management sign in']]},
  {id:'inventory',label:'Inventory Management',links:session.hr?[['/inventory','Stock register'],['/hr/suppliers','Supplier management']]:[['/hr/login','Inventory sign in']]},
  {id:'finance',label:'Finance Management',links:session.hr?[['/hr/payroll','Payroll and finance'],['/hr/payroll/payslips','Employee payslips']]:[['/hr/login','HR sign in']]},
  {id:'reports',label:'Reports',links:session.hr?[['/hr/manage/reports','HR reports']]:[['/hr/login','Authorized report access']]},
  {id:'account',label:'Settings',links:account.length?account:session.hr?[['/hr/login','HR sign in']]:session.clinic?[['/clinic-login','Clinic sign in']]:[['/doctor-login','Doctor sign in']]},
  {id:'employee',label:'Employee Portal',links:[['/employee','My Work & Performance'],['/employee/login','Employee Sign In'],['/employee/register','Employee Registration']]},
  {id:'owner',label:'Owner Portal',links:session.owner ? [['/owner/command-center','Owner Command Center'],['/owner/analytics','Executive Performance'],['/owner/alerts','Owner Alerts'],['/owner/employees','Employee Records'],['/owner/js-employees','Employee ID Directory'],['/owner/employees/directory-live','Live Employee Directory'],['/owner/employees/schema','Employee Database Structure'],['/owner/doctor-review','Doctor Review'],['/owner/part-a-integrity','Data Integrity'],['/owner/python-bridge','API / Integration Status'],['/owner/customer-service','Customer Service Control'],['/owner/js-command-center','Operations Command Center']] : [['/owner-login','Owner Portal Login'],['/owner-register','Owner Registration · HR Code']]},
  {id:'service',label:'Customer Service',links:[['/customer-service','Module 47 · Service Desk'],['/doctor-dashboard/support','My Support Requests']]},
  {id:'resources',label:'Resources',links:[['/resources','Resource Center'],['/knowledge/dashboard','Knowledge Base'],['/about','Our Approach'],['/how-it-works','How It Works'],['/contact','Contact and Support']]},
 ];
}
