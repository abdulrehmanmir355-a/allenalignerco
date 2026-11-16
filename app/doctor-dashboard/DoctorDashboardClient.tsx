"use client";

import dynamic from "next/dynamic";

const DoctorDashboard = dynamic(
  () => import("./DoctorDashboardClient"),
  { ssr: false }
);

export default function Page() {
  return <DoctorDashboard />;
}
