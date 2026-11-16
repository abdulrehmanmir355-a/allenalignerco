
export type CrmPermission = "crm:read" | "crm:write";

export type CrmPrincipal = {
  userId: string;
  accountId: string | null;
  isActive: boolean;
  permissions: readonly string[];
};

export type CrmContext = {
  userId: string;
  accountId: string;
};

export function requireCrmContext(
  principal: CrmPrincipal | null,
  permission: CrmPermission
): CrmContext {
  if (
    !principal?.isActive ||
    !principal.userId ||
    !principal.accountId ||
    !principal.permissions.includes(permission)
  ) {
    throw new Error("CRM_ACCESS_DENIED");
  }

  return {
    userId: principal.userId,
    accountId: principal.accountId,
  };
}
