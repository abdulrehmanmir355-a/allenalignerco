import { hrScope,type HRIdentity } from '../../../../lib/hr-scope';
﻿import { NextResponse } from "next/server";
import { currentHR } from "../../../../lib/hr-auth";
import { db } from "../../../../lib/database";

export const dynamic = "force-dynamic";

async function countRecords(table: string,user:HRIdentity): Promise<number> {
  const allowedTables = [
    "Employee",
    "EmployeeOffboarding",
    "OffboardingClearance",
    "OffboardingAsset",
    "OffboardingSettlement"
  ];

  if (!allowedTables.includes(table)) {
    throw new Error("Invalid table");
  }

  const scope=hrScope(user);
  const rows = await db.query(scope.sql+
    `SELECT COUNT(*)::integer AS "total" FROM "${table}"`,scope.args
  ) as { total: number }[];

  return rows[0]?.total ?? 0;
}

export async function GET() {
  const hr = await currentHR().catch(() => null);

  if (!hr) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const [
      employees,
      offboardingCases,
      clearances,
      assets,
      settlements
    ] = await Promise.all([
      countRecords("Employee",hr),
      countRecords("EmployeeOffboarding",hr),
      countRecords("OffboardingClearance",hr),
      countRecords("OffboardingAsset",hr),
      countRecords("OffboardingSettlement",hr)
    ]);

    return NextResponse.json({
      success: true,
      summary: {
        employees,
        offboardingCases,
        clearances,
        assets,
        settlements
      }
    });

  } catch {
    return NextResponse.json(
      { error: "HR database unavailable" },
      { status: 503 }
    );
  }
}
