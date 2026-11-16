
export type CrmCustomerType = "DOCTOR" | "CLINIC" | "LAB";

export type NewCrmLead = {
  lead_name: string;
  customer_type: CrmCustomerType;
  company_name: string | null;
  country: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  lead_source: string | null;
  notes: string | null;
};

export function parseNewCrmLead(input: unknown): NewCrmLead {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid lead data");
  }

  const data = input as Record<string, unknown>;

  function requiredText(key: string, max: number): string {
    const value = data[key];
    if (typeof value !== "string") {
      throw new Error(`${key} is required`);
    }

    const clean = value.trim();
    if (!clean || clean.length > max) {
      throw new Error(`Invalid ${key}`);
    }
    return clean;
  }

  function optionalText(key: string, max: number): string | null {
    const value = data[key];
    if (value === undefined || value === null || value === "") {
      return null;
    }

    if (typeof value !== "string" || value.trim().length > max) {
      throw new Error(`Invalid ${key}`);
    }

    return value.trim() || null;
  }

  const customerType = requiredText("customer_type", 20);

  if (!["DOCTOR", "CLINIC", "LAB"].includes(customerType)) {
    throw new Error("Invalid customer type");
  }

  const email = optionalText("email", 200)?.toLowerCase() ?? null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Invalid email address");
  }

  return {
    lead_name: requiredText("lead_name", 200),
    customer_type: customerType as CrmCustomerType,
    company_name: optionalText("company_name", 200),
    country: optionalText("country", 100),
    email,
    phone: optionalText("phone", 60),
    website: optionalText("website", 2000),
    lead_source: optionalText("lead_source", 100),
    notes: optionalText("notes", 4000),
  };
}
