import "server-only";
import { currentDoctor } from "./portal-auth";
import { currentHR } from "./hr-auth";
import { currentClinic } from "./clinic-auth";
export async function activeWorkspace(){const [doctor,hr,clinic]=await Promise.all([currentDoctor(),currentHR(),currentClinic()]);return doctor?'/doctor-dashboard':hr?'/hr/offboarding/dashboard':clinic?'/clinic/dashboard':null;}
