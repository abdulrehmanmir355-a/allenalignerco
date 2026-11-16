import EmployeeDirectory, { type EmployeeSearch } from "./employee-directory";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<EmployeeSearch> }) { return <EmployeeDirectory search={await searchParams} />; }
